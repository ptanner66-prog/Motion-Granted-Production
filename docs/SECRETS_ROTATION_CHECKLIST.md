# Secrets Rotation Checklist — Motion Granted

> SP-15 Security Compliance | Last Updated: 2026-02-14

## Rotation Schedule

| Frequency | Keys | Reason |
|-----------|------|--------|
| **90 days** | ANTHROPIC_API_KEY, OPENAI_API_KEY, COURTLISTENER_API_KEY | High-value AI/research API keys |
| **180 days** | STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY | Payment and email keys |
| **365 days** | ENCRYPTION_SECRET *(requires re-encryption migration)* | Encryption key — rotation is destructive |
| **On compromise** | ALL keys immediately | Incident response |
| **Never** | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY | Public values (safe to commit) |

---

## Rotation Procedures

### ANTHROPIC_API_KEY

1. Generate new key at https://console.anthropic.com/settings/keys
2. Update in Vercel Environment Variables (Production + Preview)
3. **Verify**: Submit a test order, confirm Phases III and V complete without error
4. Revoke old key in Anthropic dashboard
5. Update rotation log below

### OPENAI_API_KEY

1. Generate new key at https://platform.openai.com/api-keys
2. Update in Vercel Environment Variables (Production + Preview)
3. **Verify**: Run a CIV batch verification to confirm citation checking works
4. Revoke old key in OpenAI dashboard

### COURTLISTENER_API_KEY

1. Generate new key at https://www.courtlistener.com/api/register/
2. Update in Vercel Environment Variables
3. **Verify**: Run a CourtListener search from admin dashboard or CIV test endpoint
4. Deactivate old key

### STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET

1. Create new restricted key in Stripe Dashboard → Developers → API Keys
2. Update `STRIPE_SECRET_KEY` in Vercel
3. Create new webhook endpoint in Stripe Dashboard → Webhooks
   - URL: `https://motiongranted.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`
4. Update `STRIPE_WEBHOOK_SECRET` with the new endpoint's signing secret
5. **Verify**: Process a test payment ($1 charge → refund)
6. Delete old webhook endpoint in Stripe Dashboard
7. Revoke old API key

### SUPABASE_SERVICE_ROLE_KEY

1. Rotate in Supabase Dashboard → Settings → API → Service Role Key
2. Update in Vercel (Production + Preview environments)
3. **NEVER** expose this key client-side (no `NEXT_PUBLIC_` prefix)
4. **Verify**: Admin dashboard loads, workflow creates orders, account deletion works
5. Note: `NEXT_PUBLIC_SUPABASE_ANON_KEY` is public — rotation is optional but can be done similarly

### ENCRYPTION_SECRET

> **CRITICAL**: Rotating this key makes ALL existing encrypted files unreadable.
> You MUST run the re-encryption migration before rotating.

1. Generate new key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
2. **Before rotating**:
   - Set `ENCRYPTION_SECRET_OLD` to the current key
   - Set `ENCRYPTION_SECRET` to the new key
   - Run re-encryption migration: `pnpm tsx scripts/rotate-encryption-key.ts`
   - This decrypts all `.enc` files with old key and re-encrypts with new key
3. Remove `ENCRYPTION_SECRET_OLD` after migration completes
4. **Verify**: Download a document and confirm it decrypts correctly

### INNGEST_SIGNING_KEY + INNGEST_EVENT_KEY

1. Rotate in Inngest Dashboard → Settings → Keys
2. Update **both** keys in Vercel simultaneously
3. **Verify**: Submit a test order, confirm the workflow starts within 30 seconds

### RESEND_API_KEY

1. Rotate in Resend Dashboard → API Keys → Create new key
2. Update in Vercel
3. **Verify**: Trigger a test email (e.g., order confirmation via admin dashboard)
4. Delete old key in Resend Dashboard

### SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN

- DSNs are **not secrets** (safe to commit). No rotation needed.
- If compromised: create a new Sentry project, update DSN in Vercel.
- `SENTRY_AUTH_TOKEN` (used for source map uploads during build) should be rotated every 180 days.

### CRON_SECRET

1. Generate new value: `openssl rand -base64 32`
2. Update in Vercel
3. Update in any external cron service (e.g., Vercel Cron, external scheduler)
4. **Verify**: Check `/api/health` endpoint responds, cron jobs execute on schedule

### PACER_USERNAME + PACER_PASSWORD

1. Update credentials at https://pacer.uscourts.gov/
2. Update in Vercel
3. **Verify**: Run a PACER-dependent citation verification

---

## Post-Rotation Verification Checklist

After **ANY** key rotation, verify all of the following:

- [ ] `pnpm build` passes without errors
- [ ] Submit test order → workflow starts and completes all phases
- [ ] Stripe test payment succeeds (checkout → webhook fires)
- [ ] Email notifications send (order confirmation, draft ready)
- [ ] Admin dashboard loads and shows orders
- [ ] CIV batch verification runs successfully
- [ ] CourtListener search returns results
- [ ] Document upload/download works
- [ ] Account settings page loads
- [ ] Health check endpoint returns 200: `curl https://motiongranted.com/api/health`

---

## Rotation Log

| Date | Key Rotated | Rotated By | Verified |
|------|------------|------------|----------|
| *Example: 2026-03-15* | *ANTHROPIC_API_KEY* | *Porter* | *Yes — test order completed* |
| | | | |
