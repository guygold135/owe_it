# Operations runbook (Owe It)

Quick reference when something breaks in production.

## Monitoring (self-checks)

Run these in **Supabase Dashboard → SQL Editor**.

### 1) Stripe webhook failures (duplicate / retry safety)

```sql
select event_id, event_type, status, last_error, created_at, processed_at
from public.stripe_webhook_events
where status = 'failed'
order by created_at desc
limit 50;
```

If rows appear, open `last_error`, fix the underlying DB/goal issue, then Stripe may redeliver (or replay from Dashboard).

### 2) Recent webhook activity

```sql
select event_id, event_type, status, created_at
from public.stripe_webhook_events
order by created_at desc
limit 30;
```

### 3) Settlement worker health

```sql
select started_at, ended_at, status, error_count, expired_count, processed_count
from public.goal_settlement_runs
order by started_at desc
limit 20;
```

Look for `status = 'partial_failure'` or rising `error_count`.

### 4) Goals stuck in payment retry

```sql
select id, title, payment_status, payment_retry_count, next_payment_retry_at, last_payment_error
from public.goals
where payment_status = 'payment_failed'
order by next_payment_retry_at nulls last
limit 50;
```

---

## Alerts (what you already have)

- **GitHub Actions**: `Settle expired goals (cron)` — you get email on **failed runs only** if personal notifications are enabled (`Settings → Notifications → Actions`).
- **Settlement health**: workflow `Settlement health check` POSTs to `settlement-health` every hour. It fails if no recent row in `goal_settlement_runs` or the last run is older than ~90 minutes (configurable via Supabase secret `SETTLEMENT_HEALTH_MAX_STALE_MINUTES`). Requires GitHub secret `AUTO_EXPIRE_CRON_SECRET` matching Supabase.
- **Sentry** (optional): frontend crashes / `AppErrorBoundary` errors when `VITE_SENTRY_DSN` is set.

---

## Common incidents

### A) User says “money didn’t charge / settle”

1. Check **Stripe Dashboard** → Payments / Payment Intents for the user/time.
2. Check `goals` row: `payment_status`, `payment_intent_id`, `last_payment_error`.
3. If webhook should have updated DB, check `stripe_webhook_events` for failures.
4. If settlement should have run, check `goal_settlement_runs` for errors around that time.

### B) Webhook keeps retrying (Stripe)

1. Open failed rows in `stripe_webhook_events` (`status = 'failed'`).
2. Fix root cause (often missing `goal_id` in metadata or DB write error).
3. After deploy/fix, Stripe can redeliver; duplicates are ignored once the event is stored as processed.

### C) Refunds (manual)

Stripe Dashboard → Payment → **Refund** as needed.  
Then align app state if required (depends on product rules; many flows update via webhook).

### D) Account delete failed

1. Check Edge Function logs for `delete-account` in Supabase.
2. Common block: user is judge on active staked goals for others — message explains next step for the user.

### E) Cron / settlement stopped

1. GitHub → **Actions** → `Settle expired goals (cron)` — last run green?
2. Verify repo secret `AUTO_EXPIRE_CRON_SECRET` matches Supabase secret `AUTO_EXPIRE_CRON_SECRET`.
3. Manually **Run workflow** once and read logs.

---

## Escalation checklist

- [ ] Identify: payments vs auth vs data vs scheduler  
- [ ] Check Supabase function logs (relevant function)  
- [ ] Check Stripe webhook deliveries (last 24h)  
- [ ] Check `stripe_webhook_events` + `goal_settlement_runs`  
- [ ] If code fix needed: deploy function(s) + redeploy frontend if client changed  
