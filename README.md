# QuantPilot
### Institutional-Style Quantitative Research, Portfolio Analytics & Investment Intelligence

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178C6?logo=typescript)
![Python](https://img.shields.io/badge/Python-Analytics-3776AB?logo=python)
![R](https://img.shields.io/badge/R-Statistics-276DC3?logo=r)
![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-4169E1?logo=postgresql)
![Status](https://img.shields.io/badge/Status-Active-success)

**QuantPilot** is a full-stack quantitative finance and investment research platform designed to bring market intelligence, portfolio management, financial analysis, strategy development, backtesting, and advanced risk modelling into one unified workspace.

It combines real market data, mathematical financial models, statistical analysis, interactive visualizations, and AI-assisted research to help users make more informed, data-driven investment decisions.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Platform Modules](#platform-modules)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Quantitative Methodologies](#quantitative-methodologies)
- [Data and Security](#data-and-security)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Limitations](#limitations)
- [Future Scope](#future-scope)

---

## Overview

Traditional investment platforms often separate market data, technical analysis, portfolio risk, financial statements, valuation, and strategy testing.

QuantPilot brings these capabilities together.

The platform provides tools to:

- Monitor financial markets and compare financial instruments.
- Analyze historical market performance and technical indicators.
- Evaluate company fundamentals and financial statements.
- Build valuation models and compare companies.
- Optimize portfolios using quantitative techniques.
- Measure portfolio exposure and downside risk.
- Develop, backtest, and evaluate trading strategies.
- Analyze market regimes and financial factors.
- Run forecasting and Monte Carlo simulations.
- Generate structured research reports.
- Use AI-assisted research grounded in available platform data.

QuantPilot is designed as a research and analytical decision-support system, not an automated trading or guaranteed-return platform.

---

## Key Features

### 1. Market Intelligence

- Market overview dashboard.
- Instrument search and watchlists.
- Market indices and major movers.
- Multi-asset performance comparison.
- Sector performance visualization.
- Market breadth indicators where constituent data is available.
- Historical market data analysis.

### 2. Technical Analysis

- Interactive financial charts.
- SMA and EMA indicators.
- RSI and MACD.
- Bollinger Bands.
- Average True Range (ATR).
- Stochastic Oscillator.
- ADX and rolling volatility.
- Candlestick pattern recognition.
- Historical signal analysis.

### 3. Fundamental Analysis

- Company financial overview.
- Financial ratios and valuation metrics.
- Income statement analysis.
- Balance sheet analysis.
- Cash flow analysis.
- Annual and quarterly financial trends.
- Company peer comparison.
- Configurable company scoring.

### 4. Valuation and Financial Modelling

- Discounted Cash Flow (DCF) modelling.
- Revenue and earnings projections.
- Free Cash Flow calculations.
- Weighted Average Cost of Capital (WACC).
- Terminal value estimation.
- Enterprise and equity valuation.
- Sensitivity analysis.
- Bull, base, and bear scenarios.

### 5. Portfolio Management

- Portfolio holdings and valuation.
- Asset allocation and concentration.
- Portfolio performance tracking.
- Unrealized profit and loss.
- Portfolio attribution.
- Target allocation management.
- Rebalancing recommendations.
- Portfolio optimization.

### 6. Portfolio Optimization and Risk

- Mean-variance optimization.
- Minimum-variance portfolios.
- Efficient frontier visualization.
- Risk parity allocation.
- Value at Risk (VaR).
- Conditional Value at Risk (CVaR).
- Sharpe and Sortino ratios.
- Beta and volatility analysis.
- Maximum drawdown.
- Correlation and risk contribution.
- Portfolio stress testing.

### 7. Quantitative Strategy Lab

- Visual strategy builder.
- Technical indicator-based entry and exit rules.
- Historical strategy backtesting.
- Configurable position sizing.
- Transaction cost and slippage modelling.
- Strategy parameter optimization.
- Walk-forward validation.
- Out-of-sample evaluation.
- Strategy robustness analysis.
- Saved experiments and strategy comparisons.

### 8. Advanced Quantitative Research

- Market regime detection.
- Factor models and regression analysis.
- Forecasting and statistical models.
- Historical and parametric Monte Carlo simulations.
- Block bootstrap analysis where applicable.
- Scenario-based portfolio analysis.
- Statistical performance evaluation.

### 9. Research Intelligence and Reporting

- AI-assisted financial research.
- Company and portfolio summaries.
- Strategy performance explanations.
- Risk analysis summaries.
- Research report generation.
- PDF export.
- Source and timestamp references.
- Transparent assumptions and calculation methodologies.

---

## Platform Modules

| Module | Purpose |
|---|---|
| Overview | Consolidated market and portfolio dashboard |
| Market Intelligence | Market monitoring and instrument analysis |
| Research | Company research and financial analysis |
| Strategy Lab | Strategy development and backtesting |
| Portfolio Risk | Portfolio exposure and risk measurement |
| Advanced Analytics | Statistical and quantitative modelling |
| Experiments | Saved strategy and research experiments |
| Watchlist | Monitoring selected financial instruments |
| Research Reports | Exportable financial research |

---

## Technology Stack

### Research analytics services

The repository includes independent Python and R implementations under `analytics/` for portfolio optimization, covariance analysis, risk parity, return attribution, and review-only rebalance proposals. The Next.js app keeps a deterministic TypeScript mirror for interactive previews, while the Python/R modules provide a clear path for batch research, model validation, and production analytics service deployment.

- **Python:** bounded mean-variance search, minimum variance, maximum Sharpe, risk parity, attribution, and rebalance review.
- **R:** covariance-based portfolio statistics, efficient-frontier search, risk contributions, attribution, and rebalance review.
- Both implementations use aligned historical returns and explicit long-only constraints; neither executes trades.

### Frontend
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Interactive financial visualizations

### Backend
- Next.js server-side routes and application logic
- PostgreSQL
- Drizzle ORM
- Better Auth

### Financial Data
- Twelve Data (US and supported international markets) and Upstox (NSE/BSE), routed by listing exchange
- Historical market price data
- Financial data endpoints supported by the configured provider plan

### Quantitative Engine
- Financial return calculations
- Statistical analysis
- Portfolio optimization
- Risk modelling
- Strategy backtesting
- Monte Carlo simulations
- Forecasting models

### Deployment
- Vercel
- PostgreSQL hosting
- Environment-based configuration

---

## Architecture

QuantPilot follows a modular full-stack architecture.

```text
                   QUANTPILOT
                       |
          +------------+------------+
          |                         |
      FRONTEND                  AUTHENTICATION
      Next.js                    Better Auth
      React 19                        |
          |                           |
          +-------------+-------------+
                        |
                 APPLICATION LAYER
                        |
       +----------------+----------------+
       |                |                |
  MARKET DATA       QUANT ENGINE      PORTFOLIO
  INTEGRATION       & ANALYTICS       MANAGEMENT
       |                |                |
  Twelve Data       Backtesting       Holdings
  Historical Data   Optimization      Allocation
  Fundamentals      Risk Models       Attribution
       |                |                |
       +----------------+----------------+
                        |
                   DATABASE
                   PostgreSQL
                   Drizzle ORM
                        |
                REPORTING & EXPORTS
                        |
                Research Intelligence
```

---

## Getting Started

### Prerequisites

Before running QuantPilot locally, ensure you have:

- Node.js (compatible with your Next.js version).
- npm or another supported package manager.
- PostgreSQL database.
- Market-data API credentials.
- Git.

### 1. Clone the Repository

```bash
git clone https://github.com/SourodipC18/Quant-Pilot.git
```

```bash
cd Quant-Pilot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a local `.env` file in the project root.

Use the actual variable names already defined in the application's environment configuration.

Example:

```env
DATABASE_URL=your_postgresql_connection_string

TWELVE_DATA_API_KEY=your_twelve_data_api_key
UPSTOX_ANALYTICS_TOKEN=your_read_only_upstox_analytics_token

BETTER_AUTH_SECRET=your_auth_secret
BETTER_AUTH_URL=http://localhost:3000
```

Additional environment variables may be required depending on the configured AI provider and deployment setup.

**Important:** Never commit `.env` files or expose API keys in client-side code. On Vercel, set the credentials as server-side environment variables for each environment you use, then redeploy.

- **Twelve Data** covers US and supported international listings, subject to the existing key’s entitlements and quota. Its default history basis is split-adjusted.
- **Upstox** covers NSE and BSE equities, indices, and listed ETFs from its official catalogue. Generate a free, read-only [Analytics Token](https://upstox.com/developer/api-documentation/analytics-token/) and set `UPSTOX_ANALYTICS_TOKEN`. Tokens expire after one year. No brokerage or order operations are used.
- Choose the exchange listing in instrument search, or use identifiers like `RELIANCE:NSE`, `SENSEX:BSE`, and `AAPL:NASDAQ` in symbol fields. Previously saved bare symbols remain supported for non-Indian listings. Nifty 50 and Sensex are available as portfolio benchmarks alongside the existing US benchmark.
- Upstox V3 returns prices as reported, without an adjustment selector. Splits and other corporate actions can distort returns; check Data Quality and choose a suitable historical window. Combined analytics require a verified common currency; no FX conversion or missing-price imputation is performed.

### 4. Set Up the Database

Run the database commands configured in the project:

```bash
npx drizzle-kit generate
```

```bash
npx drizzle-kit migrate
```

If the repository uses a different migration workflow, follow its existing scripts.

### 5. Start the Development Server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

### 6. Build for Production

```bash
npm run build
```

---

## Phase 6C.1 — Advanced 3D analytics

**Monte Carlo → Simulation universe.** Select an instrument, sample allocation, saved portfolio or the read-only paper account. The seed, horizon and path count control a daily historical bootstrap (20–504 sessions, 100–2,000 paths). Switch between trajectories, a time/value probability-density surface and terminal return counts. Each density slice uses all paths and integrates to one across equal-width value bins. Only the rendered time grid and trajectory cloud are thinned. Expected ending value is the arithmetic mean; downside risk includes the fifth percentile of path maximum drawdowns.

Portfolio draws preserve same-session cross-asset dependence: each matched return vector is projected onto fixed weights before sampling. Samples use target allocations; saved and paper positions use share counts times closing prices on the latest aligned return date. Saved portfolios assume no idle cash; paper cash remains a zero-return allocation. These are daily rebalanced scenarios, not reconstructions of historical trades. Mixed currencies are not converted. Paper trading retains its existing USD-only rules; verified USD and INR histories use the existing Twelve Data and Upstox routes.

**Strategy Lab → Strategy optimization.** Set the fast and slow ranges, integer step and ranking metric, then evaluate up to 144 pairs. The existing SMA/EMA backtester runs on the first 70% of at most 1,000 chronological bars. Only training scores determine the winner; a fresh, flat account tests that pair on the final 30%, including its own indicator warm-up. Costs and next-bar execution match the configured strategy. Undefined scores are unavailable rather than zero. The heatmap, 3D mesh, comparison table and CSV expose the same training grid. Historical selection is not evidence of future performance.

Both 3D surfaces load on demand and reuse the Efficient Frontier’s camera and axis components. Rotate, zoom, reset or enter fullscreen; 2D alternatives remain available without WebGL.

## Phase 6C.2 — Portfolio Risk Lab

Open **Analysis tools → Portfolio Risk Lab** or send a sample allocation there from the sample library. Select a sample, saved portfolio, or paper account and a six-month, one-year, or three-year lookback. The lab uses verified USD or INR daily closes from Twelve Data (split adjusted) or Upstox (as reported). Saved portfolios use the latest shared close to mark their shares; paper portfolios include idle USD cash with zero return. Samples use their target weights. Currencies are not converted or combined, and holdings are never silently dropped.

**Stress testing.** Choose two holdings, set shock bounds, and inspect the selected scenario’s ending value and constituent P&L. Unselected holdings and cash are flat under hypothetical holding shocks. Alternatively, choose two market proxies: holding-level OLS betas are fit jointly using at least 60 same-session observations. Proxy shocks exclude the intercept and cannot imply a loss of more than a holding’s full value. Proxy shocks do not reproduce a historical event or estimate a causal response.

**Historical replay.** Financial crisis, COVID-19 crash, rate tightening, and technology selloff presets supply editable date windows, not fixed shock percentages. Replay derives each holding’s move from common provider closes within seven calendar days of both bounds; if even one holding lacks coverage, the replay is unavailable. The replay uses current weights, so it is not a backtest of historical ownership. Changing either observed axis shock creates a hypothetical overlay while other holdings keep their observed returns. Price-only results omit dividends, fees, liquidity, and execution effects.

**Rolling correlation and risk.** Pearson coefficients use 30, 60, 90, or 252 contiguous matched sessions; no window crosses missing returns or reports a coefficient for zero variance. The dashboard shows the highest observed coefficient for the selected period and window. Volatility is annualized using 252 sessions (minimum 30 observed returns); one-day 95% VaR uses the empirical fifth percentile and CVaR averages the worst 5% of observed sessions (both require 100 returns). Drawdown is the worst peak-to-trough loss across uninterrupted spans of at least 30 returns. These figures use a fixed-weight, daily-rebalanced hypothetical portfolio, not recorded trade history.

Both charts support fullscreen, keyboard-accessible 2D inspection, hover detail, and CSV export. In 3D you can rotate, zoom, and reset the camera. Correlation uses a fixed −1 to +1 scale; its 3D view thins rendered dates, while the paged heatmap and CSV keep every window for the selected pairs. A WebGL failure returns to the 2D chart. Historical coverage varies with listing age, provider subscription, and configuration. Live INR requires `UPSTOX_ANALYTICS_TOKEN`. Paper trading remains USD-only.

## Phase 6C.3 — Advanced risk and factor surfaces

Open **Analysis tools → Portfolio Risk Lab** for the historical risk dashboard and the rolling risk, drawdown, and factor exposure surfaces. Choose an individual listing (for example `AAPL:NASDAQ` or `RELIANCE:NSE`), a sample, a saved portfolio, or the paper account, then choose a six-month, one-year, or three-year range. Saved portfolios use their configured benchmark; automatic selection uses SPY for USD and Nifty 50 for INR. Paper trading remains USD-only.

- **Valuation and cash.** Stock analysis values one share. Samples use their exact target allocations, rebalanced daily with no idle cash. Saved and paper portfolios revalue current share quantities at each historical close; their weights drift with prices rather than being inferred from a future valuation. Paper includes current idle cash at zero return, while saved portfolios exclude cash. These are revaluations from observed prices, not a replay of historical trades or a record of historical account equity. No dividend, fee, FX conversion, or missing-price imputation is performed.
- **Rolling risk.** Select 20, 30, 60, 90, 126, or 252-session windows. Volatility and tracking error use sample standard deviation scaled to 252 sessions/year. Sharpe uses mean daily return over sample volatility; Sortino uses the root mean square of below-target daily returns over all observations. Both assume a zero risk-free rate and downside target and scale by the square root of 252. One-session 95% historical VaR uses the interpolated fifth percentile; CVaR averages the worst 5% of daily returns, rounded up to a whole observation. Both are floored at zero and require 100 observations. Benchmark returns must match the exact holding close-to-close intervals and currency. Rolling estimates do not span gaps; overall risk statistics pool valid returns.
- **Drawdown.** Rolling drawdown measures the endpoint loss relative to the highest value inside its trailing window. Markers identify the deepest loss per window. The full-period 2D line instead uses the running high of each uninterrupted span. The dashboard highlights the largest peak-to-trough loss across spans with at least 20 returns. Recovery dates and session counts are retrospective and never cross a missing-data break.
- **Regional factors.** The US uses SPY (market), XLK (technology), IWM (small cap), XLF (financials), and QQQ (Nasdaq-100). India uses NIFTYBEES (market), ITBEES (technology), HDFCSML250 (small cap), BANKBEES (banks), and JUNIORBEES (Nifty Next 50). In **Research Studio → Factor Models → Load rolling exposures**, apply the same rolling analysis to the selected single stock or equal-weight targets without changing the existing joint regression. Rolling fits are separate OLS regressions with an intercept, using raw broad-market price returns or each other proxy’s return minus broad-market return. They expose coefficients, R², and sample size for 60–252 aligned sessions. These are ETF proxy sensitivities, not official Fama–French factors. Missing data or unusable fits are explicitly marked unavailable.
- **Exploration and coverage.** Rotate, zoom, reset, enter fullscreen, or switch to keyboard-accessible 2D. WebGL failures switch automatically to 2D. CSV retains all calculated dates; the mesh limits rendered dates and does not span known gaps. Histories use at most 800 provider closes per listing. Benchmark and broad-market histories are fetched before spread proxies so a missing broad-market feed does not trigger unnecessary requests. Twelve Data closes are split-adjusted; Upstox closes are reported without adjustments and require `UPSTOX_ANALYTICS_TOKEN`. Session labels come from the listings’ providers; dates missing from every series cannot be distinguished from market closures, and closing times can differ across exchanges.

## Quantitative Methodologies

QuantPilot incorporates established financial and statistical methodologies.

| Methodology | Application |
|---|---|
| Simple Moving Average | Trend analysis |
| Exponential Moving Average | Trend and momentum analysis |
| Relative Strength Index | Momentum analysis |
| MACD | Trend and momentum signals |
| Bollinger Bands | Volatility analysis |
| Sharpe Ratio | Risk-adjusted returns |
| Sortino Ratio | Downside risk-adjusted returns |
| Value at Risk | Potential portfolio loss estimation |
| Conditional VaR | Expected tail loss |
| Maximum Drawdown | Historical downside measurement |
| CAPM / Beta | Market sensitivity |
| Mean-Variance Optimization | Portfolio allocation |
| Risk Parity | Risk-based asset allocation |
| DCF | Intrinsic valuation modelling |
| Monte Carlo Simulation | Probabilistic scenario analysis |
| Regression Models | Factor exposure and statistical analysis |
| Walk-Forward Testing | Strategy validation |

All model outputs depend on the quality of their input data, assumptions, and selected methodologies.

---

## Data and Security

QuantPilot is designed around server-side market-data access and protected user information.

Key principles:

- API credentials remain server-side.
- Database access is protected by authentication and authorization.
- User-specific portfolio and research data must remain isolated.
- Market data should be cached to reduce unnecessary provider requests.
- Data timestamps and source information should be displayed.
- Missing or unsupported data should be clearly identified.
- Financial models should expose their assumptions and limitations.

Market-data availability, update frequency, and endpoint access depend on the configured provider subscription.

---

## Testing

Run the available project checks:

```bash
npm run lint
```

```bash
npx tsc --noEmit
```

```bash
npm test
```

Run the production build:

```bash
npm run build
```

The test suite should cover financial calculations, API responses, portfolio logic, backtesting, authentication, and data validation.

---

## Project Structure

The application is organized into modular components for its different analytical capabilities.

```text
Quant-Pilot/
│
├── app/
│   ├── dashboard/
│   ├── research/
│   ├── portfolio/
│   ├── strategy-lab/
│   ├── analytics/
│   └── api/
│
├── components/
│   ├── charts/
│   ├── dashboard/
│   ├── portfolio/
│   ├── research/
│   └── strategies/
│
├── lib/
│   ├── market-data/
│   ├── analytics/
│   ├── backtesting/
│   ├── portfolio/
│   ├── risk/
│   └── valuation/
│
├── db/
│   └── schema/
│
├── public/
│
├── drizzle.config.ts
├── package.json
└── README.md
```

*The structure above is a conceptual overview. Adjust directory names to match the actual repository.*

---

## Limitations

- Market data depends on external provider coverage and subscription limits.
- Historical performance does not guarantee future results.
- Forecasting and Monte Carlo simulations depend on model assumptions.
- DCF valuations are sensitive to forecast assumptions.
- Some market breadth, financial statement, and benchmark datasets may require additional data entitlements.
- Backtesting results may differ from live execution because of liquidity, transaction costs, slippage, and market conditions.

---

## Future Scope

Potential future extensions include:

- Additional licensed financial data providers.
- Real-time market streaming.
- More advanced multi-factor models.
- Expanded fixed-income and foreign-exchange analytics.
- Broker integrations with explicit user authorization.
- Advanced portfolio monitoring and alerts.
- More sophisticated research workflows.
- Institutional-grade audit and reporting capabilities.

---

## Disclaimer

QuantPilot is an educational, analytical, and research-oriented financial software platform.

It does not provide guaranteed investment returns, personalized financial advice, or guaranteed trading signals. All investment decisions should involve independent research and appropriate risk assessment.

---

## Author

**Saurodip Chowdhury**

GitHub: [@SourodipC18](https://github.com/SourodipC18)

Project: [QuantPilot](https://github.com/SourodipC18/Quant-Pilot)

---

**QuantPilot — Turning Financial Data into Quantitative Intelligence.**
