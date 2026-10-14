# QuantPilot

QuantPilot is a research workbench for source-backed market analysis and paper simulation. The UI searches exchange-qualified instruments and loads historical observations from Twelve Data through a server-side Next.js route.

## Links

- GitHub repository: [SourodipC18/Quant-Pilot](https://github.com/SourodipC18/Quant-Pilot)

## Market data setup

The backend requires the following server-side environment variable:

```bash
TWELVE_DATA_API_KEY=your_twelve_data_api_key
```

`TWELVE_DATA_API_KEY` is read only by `/api/market` and is never exposed to the browser. Do not commit the real key to `.env.example`, Git, or the repository. Configure it in the Vercel project environment variables for Preview and Production, then redeploy or restart the development server.

Optional provider label:

```bash
MARKET_DATA_PROVIDER=twelvedata
```

## API routes

- `GET /api/market?action=status` — confirms server configuration
- `GET /api/market?action=search&q=TSLA` — searches instruments
- `GET /api/market?action=quote&symbol=TSLA` — loads a quote
- `GET /api/market?action=history&symbol=TSLA` — loads daily history

## Local development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and search for an instrument such as `TSLA`.

Market coverage, freshness, rate limits, and entitlements follow the Twelve Data plan associated with the configured key. QuantPilot is a research and paper simulation tool, not financial advice.
