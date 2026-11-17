"""QuantPilot portfolio analytics service primitives.

The web application mirrors these routines in TypeScript for preview portability.
This module is the research-service implementation for production batch jobs:
constrained mean-variance search, risk parity, attribution, and rebalance review.
"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import product
from typing import Iterable

import numpy as np


@dataclass(frozen=True)
class Allocation:
    weights: np.ndarray
    annual_return: float
    annual_volatility: float
    sharpe: float


def aligned_returns(prices: np.ndarray) -> np.ndarray:
    """Return asset x observation returns after removing incomplete rows."""
    values = np.asarray(prices, dtype=float)
    if values.ndim != 2 or values.shape[0] < 2:
        raise ValueError("prices must be a 2D asset-by-date matrix")
    if np.any(values <= 0) or not np.isfinite(values).all():
        raise ValueError("prices must be finite and positive")
    return values[:, 1:] / values[:, :-1] - 1.0


def _weights(asset_count: int, minimum: float, maximum: float, step: float) -> Iterable[np.ndarray]:
    if minimum < 0 or maximum > 1 or minimum > maximum or step <= 0:
        raise ValueError("invalid allocation constraints")
    grid = np.arange(minimum, maximum + step / 2, step)
    for candidate in product(grid, repeat=asset_count - 1):
        final = 1.0 - sum(candidate)
        if minimum - 1e-9 <= final <= maximum + 1e-9:
            yield np.round(np.append(candidate, final), 10)


def optimize(prices: np.ndarray, minimum: float = 0.0, maximum: float = 0.8, step: float = 0.05, risk_free: float = 0.0) -> dict:
    returns = aligned_returns(prices)
    covariance = np.cov(returns)
    annual_means = returns.mean(axis=1) * 252
    annual_covariance = covariance * 252
    candidates: list[Allocation] = []
    for weights in _weights(prices.shape[0], minimum, maximum, step):
        expected = float(weights @ annual_means)
        volatility = float(np.sqrt(max(weights @ annual_covariance @ weights, 0)))
        sharpe = (expected - risk_free) / volatility if volatility else 0.0
        candidates.append(Allocation(weights, expected, volatility, sharpe))
    if not candidates:
        raise ValueError("no feasible portfolio satisfies the constraints")
    minimum_variance = min(candidates, key=lambda item: item.annual_volatility)
    maximum_sharpe = max(candidates, key=lambda item: item.sharpe)
    risk_parity = min(candidates, key=lambda item: np.std(item.weights * (annual_covariance @ item.weights)))
    return {
        "minimum_variance": minimum_variance,
        "maximum_sharpe": maximum_sharpe,
        "risk_parity": risk_parity,
        "frontier": candidates,
        "aligned_observations": returns.shape[1],
    }


def attribution(weights: np.ndarray, returns: np.ndarray) -> np.ndarray:
    """Annualized return contribution per asset."""
    return np.asarray(weights) * np.asarray(returns).mean(axis=1) * 252


def rebalance_review(current: np.ndarray, target: np.ndarray, threshold: float = 0.05) -> list[dict]:
    current, target = np.asarray(current), np.asarray(target)
    if current.shape != target.shape or not np.isclose(target.sum(), 1):
        raise ValueError("current and target allocations must align and target must sum to one")
    proposals = []
    for index, (before, after) in enumerate(zip(current, target)):
        drift = before - after
        if abs(drift) >= threshold:
            proposals.append({"index": index, "current": float(before), "target": float(after), "drift": float(drift), "action": "increase" if after > before else "decrease"})
    return proposals
