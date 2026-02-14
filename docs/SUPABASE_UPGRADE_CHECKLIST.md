# Supabase Upgrade Checklist

**SP-08 Task 8 | Created: 2026-02-14 | Owner: Porter**

Motion Granted is currently on Supabase **Free Tier**. This checklist covers the upgrade to Pro and required security configuration changes.

---

## 1. Upgrade to Pro Plan

- [ ] Go to [Supabase Dashboard](https://supabase.com/dashboard) > Project Settings > Billing
- [ ] Upgrade to **Pro Plan** ($25/month base)
- [ ] Confirm payment method is on file

### Pro Plan Gets You

| Feature | Free | Pro |
|---|---|---|
| Database size | 500 MB | 8 GB |
| Edge function invocations | 500K/month | 2M/month |
| Storage | 1 GB | 100 GB |
| Bandwidth | 2 GB | 250 GB |
| Auth MAUs | 50K | 100K |
| Realtime connections | 200 | 500 |
| Daily backups | No | Yes (7-day PITR) |
| Branching | No | Yes |

---

## 2. Rotate Service Role Key

The `SUPABASE_SERVICE_ROLE_KEY` is currently used in production. After SP-08 code changes reduce its usage, rotate the key:

- [ ] Go to Dashboard > Settings > API
- [ ] Click "Rotate" on the service role key
- [ ] Update the key in Vercel environment variables:
  ```
  SUPABASE_SERVICE_ROLE_KEY=<new-key>
  ```
- [ ] Redeploy the application
- [ ] Verify health endpoint: `GET /api/health`

**IMPORTANT**: After rotation, the old key is immediately invalidated. Do this during a maintenance window.

---

## 3. Apply Security Migrations

Apply these SQL migrations via Supabase SQL Editor (Dashboard > SQL Editor):

### 3a. SECURITY DEFINER Audit

- [ ] Apply `supabase/migrations/20260214_audit_definer_functions.sql`
  - Hardens all SECURITY DEFINER functions with `SET search_path = ''`
  - Downgrades 3 read-only functions to SECURITY INVOKER
  - Verify output: should see "All SECURITY DEFINER functions have SET search_path hardened"

### 3b. Admin RLS Policies

- [ ] Apply `supabase/migrations/20260214_admin_rls_policies.sql`
  - Creates RLS policies that allow admins to read/write all data
  - Required for admin routes that no longer use service_role key
  - **MUST be applied BEFORE deploying SP-08 code changes**

---

## 4. Enable Row Level Security Verification

After applying migrations, verify RLS is enabled on all tables:

```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

All tables should show `rowsecurity = true`.

---

## 5. Configure Auth Settings

### 5a. JWT Secret

- [ ] Verify JWT secret is unique to this project (not the default)
- [ ] Dashboard > Settings > API > JWT Settings

### 5b. Rate Limiting

- [ ] Dashboard > Auth > Rate Limits
- [ ] Set email signup rate limit: 5 per hour per IP
- [ ] Set password reset rate limit: 3 per hour per IP

### 5c. Email Templates

- [ ] Dashboard > Auth > Email Templates
- [ ] Customize confirmation email with Motion Granted branding
- [ ] Customize password reset email with Motion Granted branding

---

## 6. Enable Database Backups

Pro plan includes daily backups. Verify they're enabled:

- [ ] Dashboard > Database > Backups
- [ ] Confirm daily backups are running
- [ ] Consider enabling Point-in-Time Recovery (PITR) for $100/month add-on

---

## 7. Monitoring Setup

- [ ] Dashboard > Reports > Enable database health reports
- [ ] Set up alerts for:
  - Database size > 6 GB (75% of Pro limit)
  - Connection count > 400 (80% of Pro limit)
  - CPU usage > 80%

---

## 8. Post-Upgrade Verification

After upgrade and migration application:

- [ ] Admin dashboard loads correctly (orders visible)
- [ ] Admin can reset stuck orders via Reset Queue
- [ ] Admin can edit phase prompts
- [ ] Admin can restart workflows
- [ ] Client can create new orders
- [ ] Client can view their orders (not others')
- [ ] API health check passes: `GET /api/health`
- [ ] Workflow generation completes successfully

---

## 9. Remove Test Accounts (Optional)

- [ ] Run test account removal script (see `scripts/remove-test-accounts.ts`)
- [ ] Default: DRY RUN mode (shows what would be deleted)
- [ ] Set `DRY_RUN=false` for actual deletion

---

## Deployment Order

1. Apply migrations (3a, 3b) via SQL Editor
2. Deploy SP-08 code changes to Vercel
3. Verify admin dashboard and client flows
4. Rotate service role key
5. Redeploy with new key
6. Final verification
