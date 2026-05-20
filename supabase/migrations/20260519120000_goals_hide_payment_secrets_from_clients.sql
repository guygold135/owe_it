-- Payment tokens and Stripe/Braintree IDs must only be readable/writable by server (service_role).
-- The app uses edge functions for payments; judges and browsers must not see vaulted tokens.

REVOKE SELECT (
  payment_intent_id,
  payment_method_id,
  stripe_customer_id,
  braintree_customer_id,
  braintree_payment_method_token,
  braintree_transaction_id,
  braintree_transaction_status
) ON public.goals FROM authenticated;

REVOKE INSERT (
  payment_intent_id,
  payment_method_id,
  stripe_customer_id,
  braintree_customer_id,
  braintree_payment_method_token,
  braintree_transaction_id,
  braintree_transaction_status,
  payment_provider,
  payment_status
) ON public.goals FROM authenticated;

REVOKE UPDATE (
  payment_intent_id,
  payment_method_id,
  stripe_customer_id,
  braintree_customer_id,
  braintree_payment_method_token,
  braintree_transaction_id,
  braintree_transaction_status,
  payment_provider,
  payment_status
) ON public.goals FROM authenticated;

COMMENT ON TABLE public.goals IS
  'Client apps may read/write goal fields except payment secrets (see column privileges). Edge functions use service_role.';
