# Secrets Checklist

This file tracks secret **names only**. Never put real values in this repo.

## How to use this file

- Keep real values in your password manager under one group (for example: `owe-it / secrets`).
- After changing a secret, rotate it in every environment where it is used.
- Check off each item only after you verify it works in production.

## Frontend (Vercel + local `.env`)

- `VITE_SUPABASE_URL`
  - Used in: local dev, Vercel Preview, Vercel Production
  - Needed by: frontend app
- `VITE_SUPABASE_PUBLISHABLE_KEY`
  - Used in: local dev, Vercel Preview, Vercel Production
  - Needed by: frontend app
- `VITE_STRIPE_PUBLISHABLE_KEY`
  - Used in: local dev, Vercel Preview, Vercel Production
  - Needed by: frontend Stripe client
- `VITE_SENTRY_DSN`
  - Used in: local dev (optional), Vercel Preview, Vercel Production
  - Needed by: frontend error reporting
- `VITE_ADMIN_USER_ID`
  - Used in: local dev, Vercel Preview, Vercel Production
  - Needed by: admin viewer logic
- `VITE_ADMIN_EMAIL`
  - Used in: local dev, Vercel Preview, Vercel Production
  - Needed by: admin viewer logic

## Supabase Edge Functions Secrets

- `SUPABASE_URL`
  - Used in: Supabase Edge Functions
  - Needed by: service-side Supabase clients
- `SUPABASE_SERVICE_ROLE_KEY`
  - Used in: Supabase Edge Functions
  - Needed by: privileged DB/service operations
- `SUPABASE_ANON_KEY`
  - Used in: selected Supabase Edge Functions
  - Needed by: anon-key checks/flows where implemented
- `STRIPE_SECRET_KEY`
  - Used in: Supabase Edge Functions
  - Needed by: checkout, webhook handling, settlement jobs
- `STRIPE_WEBHOOK_SECRET`
  - Used in: Supabase `stripe-webhook` function
  - Needed by: webhook signature verification
- `AUTO_EXPIRE_CRON_SECRET`
  - Used in: scheduled settlement/health functions
  - Needed by: cron endpoint protection
- `SETTLEMENT_HEALTH_MAX_STALE_MINUTES`
  - Used in: `settlement-health` function
  - Needed by: stale-run threshold config
- `RESEND_API_KEY`
  - Used in: `submit-feedback` function
  - Needed by: feedback email sending
- `FEEDBACK_TO_EMAIL`
  - Used in: `submit-feedback` function
  - Needed by: feedback destination
- `FEEDBACK_FROM_EMAIL`
  - Used in: `submit-feedback` function
  - Needed by: feedback sender (defaults exist, still track it)
- `ADMIN_USER_ID`
  - Used in: `admin-feedback` function
  - Needed by: admin authorization checks
- `ADMIN_EMAIL`
  - Used in: `admin-feedback` function
  - Needed by: admin authorization checks
- `CORS_ALLOWED_ORIGINS`
  - Used in: shared CORS helper
  - Needed by: function CORS controls
- `BRAINTREE_MERCHANT_ID`
  - Used in: Braintree edge functions
  - Needed by: vault, client token, charges
- `BRAINTREE_PUBLIC_KEY`
  - Used in: Braintree edge functions
  - Needed by: API auth (server only)
- `BRAINTREE_PRIVATE_KEY`
  - Used in: Braintree edge functions
  - Needed by: vault and charges (never put in Vercel / frontend)
- `BRAINTREE_ENVIRONMENT`
  - Used in: Braintree edge functions
  - Needed by: `sandbox` or `production`
- `BRAINTREE_MERCHANT_ACCOUNT_ID`
  - Used in: Braintree charges
  - Needed by: default merchant account
- `BRAINTREE_MERCHANT_ACCOUNT_USD` (and other currencies if used)
  - Used in: Braintree charges per currency
  - Needed by: multi-currency live charges

## Backup/Recovery Secrets (local machine + scheduler)

- `SUPABASE_DB_URL`
  - Used in: Windows scheduled backup task (`daily-db-backup.ps1`)
  - Needed by: `pg_dump` backups and restore flows
  - Note: update this immediately whenever DB password is rotated

## Rotation Log (names only)

- Last DB password rotation:
- Last Stripe key rotation:
- Last Braintree key rotation:
- Last Supabase service role key rotation:
- Last webhook secret rotation:
- Last Sentry DSN review:

## Verification Checklist

- [ ] All listed secrets exist in password manager
- [ ] Vercel Preview has required frontend secrets
- [ ] Vercel Production has required frontend secrets
- [ ] Supabase Edge Functions secrets are set
- [ ] Local `SUPABASE_DB_URL` is current
- [ ] Backup task runs successfully after any secret rotation
