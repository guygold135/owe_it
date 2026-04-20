# Deployment Playbook (Owe It)

This file is the exact checklist to deploy the app safely.

Use this order:
1) Prepare accounts and tools
2) Configure Supabase Auth/DB/Storage
3) Deploy Supabase Edge Functions + secrets
4) Configure Stripe webhook
5) Deploy frontend (Vercel)
6) Configure settlement scheduler
7) Run launch smoke tests

---

## 0) Prerequisites

You need:
- A Supabase project (production)
- A Stripe account (live mode)
- A Vercel project
- Node.js installed
- Supabase CLI installed

Check tools:

```bash
node -v
npm -v
supabase --version
```

---

## 1) Local app env (frontend only)

Create `.env` in repo root (do not commit it):

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_ANON_KEY
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

Optional (recommended for production): add **`VITE_SENTRY_DSN`** from [Sentry](https://sentry.io/) so browser errors are reported. Omit locally if you do not use it.

To run **Playwright** smoke tests locally once:

```bash
npx playwright install
npm run test:e2e
```

---

## Operations and monitoring

See **`RUNBOOK.md`** for SQL health checks, incident triage, and links to GitHub / Stripe / Supabase logs.

---

## 2) Supabase project setup

### 2.1 Link CLI to the production project

From repo root:

```bash
supabase login
supabase link --project-ref lngepgvviuqanzlslqhf
```

### 2.2 Apply database migrations

```bash
supabase db push
```

### 2.3 Ensure avatars storage bucket exists

Run `supabase/scripts/create_avatars_bucket.sql` in Supabase SQL Editor.

Notes:
- It is safe to run multiple times.
- This creates/updates the `avatars` bucket and storage policies.

### 2.4 Auth provider setup

In Supabase Dashboard:
- Enable Email provider
- Enable Google provider (if you want Google sign-in in production)
- Add production site URL + redirect URLs

Recommended redirect URLs include:
- `https://YOUR_DOMAIN/`
- `https://YOUR_DOMAIN/auth`

---

## 3) Edge functions and secrets

Deploy these functions:
- `create-checkout`
- `resolve-goal-direct`
- `resolve-goal`
- `settle-expired-goal-payments`
- `stripe-webhook`
- `submit-feedback`
- `admin-feedback`
- `delete-account`

### 3.1 Set function secrets

Set all required secrets:

```bash
supabase secrets set SUPABASE_URL=https://lngepgvviuqanzlslqhf.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
supabase secrets set SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set AUTO_EXPIRE_CRON_SECRET=LONG_RANDOM_STRING
supabase secrets set ADMIN_USER_ID=UUID_OF_ADMIN_USER
supabase secrets set ADMIN_EMAIL=admin@yourdomain.com
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set FEEDBACK_TO_EMAIL=feedback@yourdomain.com
supabase secrets set FEEDBACK_FROM_EMAIL=feedback@yourdomain.com
supabase secrets set CORS_ALLOWED_ORIGINS=https://oweit.site,https://www.oweit.site,http://localhost:8080,http://localhost:5173
```

Tip: use a long random value for `AUTO_EXPIRE_CRON_SECRET` (at least 32 chars).
Tip: set `CORS_ALLOWED_ORIGINS` to a comma-separated list of trusted web app origins only.

### 3.2 Deploy functions

```bash
supabase functions deploy create-checkout
supabase functions deploy resolve-goal-direct
supabase functions deploy resolve-goal
supabase functions deploy settle-expired-goal-payments
supabase functions deploy stripe-webhook
supabase functions deploy submit-feedback
supabase functions deploy admin-feedback
supabase functions deploy delete-account
supabase functions deploy settlement-health
```

### 3.2a CI Playwright (optional)

For the **E2E smoke** job to run green, add these **GitHub Actions secrets** (same values as Vercel / local `.env` public keys):

- `CI_VITE_SUPABASE_URL`
- `CI_VITE_SUPABASE_PUBLISHABLE_KEY`
- `CI_VITE_STRIPE_PUBLISHABLE_KEY`

The E2E job is configured with `continue-on-error: true` until secrets exist.

### 3.2b Settlement staleness alert (GitHub)

Workflow **Settlement health check** (`.github/workflows/settlement-health.yml`) runs hourly. Add repository secret:

- `AUTO_EXPIRE_CRON_SECRET` — must match the Supabase secret of the same name

### 3.3 Quick function health checks

Use these endpoint formats:
- `https://lngepgvviuqanzlslqhf.functions.supabase.co/stripe-webhook`
- `https://lngepgvviuqanzlslqhf.functions.supabase.co/settle-expired-goal-payments`

---

## 4) Stripe setup

### 4.1 Product mode

Make sure you are using **live** keys for production:
- `pk_live_...` on frontend
- `sk_live_...` in Supabase secrets

### 4.2 Webhook endpoint

In Stripe Dashboard > Webhooks:
- Add endpoint: `https://lngepgvviuqanzlslqhf.functions.supabase.co/stripe-webhook`
- Subscribe to at least:
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
- Copy webhook signing secret and set it as `STRIPE_WEBHOOK_SECRET`

---

## 5) Frontend deploy (Vercel)

This project already has SPA rewrite config in `vercel.json`.

In Vercel project settings, set env vars:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_STRIPE_PUBLISHABLE_KEY`

Then deploy:

```bash
npm install
npm run build
```

Push to your connected branch (or run Vercel CLI deploy flow).

---

## 6) Scheduler setup (critical)

`settle-expired-goal-payments` requires a scheduled POST call with `x-cron-secret`.

Target URL:
- `https://lngepgvviuqanzlslqhf.functions.supabase.co/settle-expired-goal-payments`

Method:
- `POST`

Headers:
- `Content-Type: application/json`
- `x-cron-secret: <same value as AUTO_EXPIRE_CRON_SECRET>`

Body (example):

```json
{
  "batchSize": 100
}
```

Schedule:
- Every 5-15 minutes (start with every 10 minutes)

Any scheduler is fine (GitHub Actions, cron-job.org, EasyCron, etc.) as long as it can send the header.

### GitHub Actions option (already added in this repo)

This repo now includes `.github/workflows/settle-expired-goals-cron.yml` that runs every 10 minutes.

To make it work:
- In GitHub repo settings, add secret `AUTO_EXPIRE_CRON_SECRET`
- Use the same value as your Supabase secret `AUTO_EXPIRE_CRON_SECRET`
- Optionally run the workflow manually once using `workflow_dispatch`

---

## 7) Launch smoke test checklist

Do these in production after deploy:

1. Sign up with email
2. Sign in with Google (if enabled)
3. Create a goal with stake
4. Confirm checkout flow works
5. Resolve a goal manually and verify payment status update
6. Trigger a Stripe webhook test event and verify DB update
7. Trigger `settle-expired-goal-payments` manually with the cron secret
8. Submit feedback form and verify email delivery
9. Verify account deletion flow

---

## CI quality gate

This repo includes `.github/workflows/ci.yml`.

It runs on pull requests and pushes to `main`, and checks:
- `npm run lint`
- `npm run test`
- `npm run build`

Before launch, ensure this workflow is green.

---

## 8) Rollback quick plan

If deployment breaks:

1. Revert frontend deployment in Vercel to last healthy deployment
2. Re-deploy previous known-good function versions
3. If migration caused issue, pause writes and restore from Supabase backup / apply corrective migration
4. Disable scheduler temporarily to stop repeated failures while fixing

---

## 9) Ownership checklist (fill before launch)

- [ ] Frontend owner assigned
- [ ] Supabase owner assigned
- [ ] Stripe owner assigned
- [ ] Scheduler owner assigned
- [ ] Support inbox owner assigned
- [ ] On-call alert destination defined

