# QuantPilot portfolio analytics service primitives.
# Used for reproducible research reports and independent model validation.

aligned_returns <- function(prices) {
  prices <- as.matrix(prices)
  if (nrow(prices) < 2 || any(!is.finite(prices)) || any(prices <= 0)) stop("prices must be a positive finite asset-by-date matrix")
  prices[, -1, drop = FALSE] / prices[, -ncol(prices), drop = FALSE] - 1
}

portfolio_stats <- function(weights, returns, risk_free = 0) {
  covariance <- cov(t(returns)) * 252
  expected <- sum(weights * rowMeans(returns) * 252)
  volatility <- sqrt(max(as.numeric(t(weights) %*% covariance %*% weights), 0))
  list(weights = weights, annual_return = expected, annual_volatility = volatility,
       sharpe = if (volatility > 0) (expected - risk_free) / volatility else 0)
}

# Bounded grid search is deliberate: it is deterministic, auditable, and keeps
# portfolio proposals inside user-visible long-only constraints.
optimize_portfolio <- function(prices, minimum = 0, maximum = 0.8, step = 0.05, risk_free = 0) {
  returns <- aligned_returns(prices)
  assets <- nrow(returns)
  grid <- seq(minimum, maximum, by = step)
  candidates <- list()
  for (weights in expand.grid(rep(list(grid), assets - 1))) {
    vector <- as.numeric(weights)
    final <- 1 - sum(vector)
    if (final >= minimum && final <= maximum) {
      point <- portfolio_stats(c(vector, final), returns, risk_free)
      candidates[[length(candidates) + 1]] <- point
    }
  }
  if (!length(candidates)) stop("no feasible portfolio satisfies constraints")
  volatility <- vapply(candidates, `[[`, numeric(1), "annual_volatility")
  sharpe <- vapply(candidates, `[[`, numeric(1), "sharpe")
  list(minimum_variance = candidates[[which.min(volatility)]],
       maximum_sharpe = candidates[[which.max(sharpe)]],
       efficient_frontier = candidates,
       aligned_observations = ncol(returns))
}

risk_contributions <- function(weights, returns) {
  covariance <- cov(t(returns)) * 252
  marginal <- covariance %*% weights
  total <- as.numeric(t(weights) %*% marginal)
  if (total == 0) return(rep(0, length(weights)))
  as.numeric(weights * marginal / total)
}

return_attribution <- function(weights, returns) {
  as.numeric(weights * rowMeans(returns) * 252)
}

rebalance_review <- function(current, target, threshold = 0.05) {
  if (length(current) != length(target) || abs(sum(target) - 1) > 1e-8) stop("allocation vectors must align and target must sum to one")
  drift <- current - target
  keep <- abs(drift) >= threshold
  data.frame(index = which(keep), current = current[keep], target = target[keep], drift = drift[keep], action = ifelse(target[keep] > current[keep], "increase", "decrease"))
}
