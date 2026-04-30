ALTER TABLE public.goals
ADD COLUMN IF NOT EXISTS payment_provider TEXT,
ADD COLUMN IF NOT EXISTS braintree_customer_id TEXT,
ADD COLUMN IF NOT EXISTS braintree_payment_method_token TEXT,
ADD COLUMN IF NOT EXISTS braintree_transaction_id TEXT,
ADD COLUMN IF NOT EXISTS braintree_transaction_status TEXT;

COMMENT ON COLUMN public.goals.payment_provider IS
'Payment processor used for this goal (e.g. stripe, braintree).';
