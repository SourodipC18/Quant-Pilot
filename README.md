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
- Twelve Data API integration
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

BETTER_AUTH_SECRET=your_auth_secret
BETTER_AUTH_URL=http://localhost:3000
```

Additional environment variables may be required depending on the configured AI provider and deployment setup.

**Important:** Never commit `.env` files or expose API keys in client-side code.

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
