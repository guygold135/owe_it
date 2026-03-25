-- Store payment method/customer for deferred off-session charging at goal failure/expiry.

ALTER TABLE public.goals
ADD COLUMN IF NOT EXISTS payment_method_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
