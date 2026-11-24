BEGIN;
CREATE TABLE IF NOT EXISTS paper_orders (user_id text NOT NULL, account_id uuid NOT NULL, id uuid NOT NULL, detail jsonb NOT NULL, PRIMARY KEY(user_id,account_id,id));
ALTER TABLE paper_accounts ADD COLUMN IF NOT EXISTS risk_limits jsonb NOT NULL DEFAULT '{}';
ALTER TABLE paper_executions ADD COLUMN IF NOT EXISTS journal jsonb NOT NULL DEFAULT '{}';
COMMIT;
