CREATE TABLE IF NOT EXISTS paper_accounts (
  user_id text PRIMARY KEY,
  id uuid NOT NULL UNIQUE,
  cash_cents bigint NOT NULL DEFAULT 500000000 CHECK (cash_cents >= 0),
  realized_cents bigint NOT NULL DEFAULT 0,
  commission_bps integer NOT NULL DEFAULT 0 CHECK (commission_bps BETWEEN 0 AND 100),
  slippage_bps integer NOT NULL DEFAULT 0 CHECK (slippage_bps BETWEEN 0 AND 100),
  opened_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS paper_positions (
  user_id text NOT NULL,
  account_id uuid NOT NULL,
  symbol text NOT NULL,
  units bigint NOT NULL CHECK (units > 0),
  basis_cents bigint NOT NULL CHECK (basis_cents >= 0),
  mark_micros bigint NOT NULL CHECK (mark_micros > 0),
  mark_date text NOT NULL,
  PRIMARY KEY (user_id, account_id, symbol)
);
CREATE TABLE IF NOT EXISTS paper_executions (
  user_id text NOT NULL,
  account_id uuid NOT NULL,
  id uuid NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  units bigint NOT NULL CHECK (units > 0),
  reference_micros bigint NOT NULL CHECK (reference_micros > 0),
  fill_micros bigint NOT NULL CHECK (fill_micros > 0),
  notional_cents bigint NOT NULL CHECK (notional_cents > 0),
  commission_cents bigint NOT NULL CHECK (commission_cents >= 0),
  slippage_bps integer NOT NULL,
  realized_cents bigint,
  mark_date text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, account_id, id)
);
CREATE TABLE IF NOT EXISTS paper_cash_ledger (
  user_id text NOT NULL,
  account_id uuid NOT NULL,
  id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('funding', 'fill')),
  delta_cents bigint NOT NULL,
  cash_cents bigint NOT NULL CHECK (cash_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, account_id, id)
);
CREATE TABLE IF NOT EXISTS paper_equity_snapshots (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  account_id uuid NOT NULL,
  cash_cents bigint NOT NULL,
  market_value_cents bigint NOT NULL,
  unrealized_cents bigint NOT NULL,
  realized_cents bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS paper_executions_recent_idx ON paper_executions (user_id, account_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS paper_equity_recent_idx ON paper_equity_snapshots (user_id, account_id, id DESC);
