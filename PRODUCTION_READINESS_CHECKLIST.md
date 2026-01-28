# Motion Granted v7.2 - Production Readiness Checklist

## Pre-Launch Verification Guide
**Last Updated:** January 2026
**System Version:** v7.2 with Citation Integrity Verification (CIV)

---

## 1. Environment Variables & API Keys

### Required Keys (Admin Settings → API Keys)
- [ ] **Anthropic API Key** - Claude AI for motion generation
  - Get from: https://console.anthropic.com/settings/keys
  - Test: Click "Test" button in admin settings

- [ ] **CourtListener API Token** - Primary citation verification
  - Get from: https://www.courtlistener.com/help/api/rest/#permissions
  - Free tier available, token recommended for rate limits
  - Test: Click "Test" button in admin settings

- [ ] **Case.law API Key** - Secondary citation verification
  - Get from: https://case.law/user/register/
  - Free tier available
  - Test: Click "Test" button in admin settings

### Environment Variables (.env.local / Vercel)
```bash
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Encryption (Required for API key storage)
ENCRYPTION_SECRET=  # Generate: openssl rand -base64 32

# Stripe (Required for payments)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Inngest (Required for background jobs)
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Optional - can be set in Admin Settings instead
ANTHROPIC_API_KEY=
COURTLISTENER_API_KEY=
CASELAW_API_KEY=
```

---

## 2. Database Migrations

### Run in Supabase SQL Editor (in order):
- [ ] `001_automation_tables.sql` - Base automation tables
- [ ] `002_...` through `017_...` - Previous migrations
- [ ] `018_verified_precedent_index.sql` - VPI schema (8 tables)
- [ ] `019_hold_response_columns.sql` - HOLD checkpoint columns

### Verify Tables Exist:
```sql
-- VPI Tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'verified_citations',
  'proposition_verifications',
  'good_law_checks',
  'authority_strength_assessments',
  'citation_relationships',
  'civ_verification_runs',
  'curated_overruled_cases',
  'civ_cache_hits'
);

-- HOLD columns on order_workflows
SELECT column_name FROM information_schema.columns
WHERE table_name = 'order_workflows'
AND column_name LIKE 'hold_%';
```

---

## 3. Workflow Engine Verification

### 14-Phase Workflow (Path A)
| Phase | Name | Checkpoint | Verify |
|-------|------|------------|--------|
| I | Order Intake | - | Order created in DB |
| II | Document Parsing | - | Documents parsed |
| III | Research & Citation Bank | CP1 | Citations gathered |
| IV | Context Assembly | - | Superprompt built |
| V | Initial Draft | - | Draft generated |
| V.1 | **CIV Verification** | - | Citations verified |
| VI | Human Review | CP2 | QA checkpoint |
| VII | Revision Loop | - | Revisions applied |
| VII.1 | **CIV Re-verification** | - | New citations checked |
| VIII | Final Polish | - | Document finalized |
| IX | Delivery | CP3 | Client notified |

### Test Workflow:
1. [ ] Create test order with known citation
2. [ ] Run workflow via Generate button
3. [ ] Verify CIV runs at Phase V.1
4. [ ] Check VPI tables populated
5. [ ] Verify HOLD triggers on bad citations

---

## 4. Citation Integrity Verification (CIV) Testing

### 7-Step Pipeline Test Cases:

#### Step 1: Existence Check
```
✓ Valid: "Brown v. Board of Education, 347 U.S. 483 (1954)"
✗ Invalid: "Smith v. Jones, 999 F.3d 1234 (9th Cir. 2025)" (hallucinated)
```

#### Step 2: Holding Verification
- Proposition must match actual case holding
- Two-stage: Sonnet primary, Opus adversarial if uncertain

#### Step 3: Dicta Detection
- Flag citations used for dicta, not holdings
- Adjust treatment based on proposition type

#### Step 4: Quote Verification
- 90%+ fuzzy match required for quoted text
- Flag misquotes

#### Step 5: Bad Law Check
- Layer 1: CourtListener treatment signals
- Layer 2: AI pattern detection
- Layer 3: Curated overruled list

#### Step 6: Authority Strength
- Case age, citation count, trend analysis
- Stability classification: LANDMARK → DECLINING

#### Step 7: Output Compilation
- Composite confidence score
- Binding decision: VERIFIED, FLAGGED, REJECTED, BLOCKED

### Run CIV Test:
```bash
# Via API
curl -X POST http://localhost:3000/api/civ/verify \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "test-order-id",
    "citations": [{
      "citationString": "Brown v. Board of Education, 347 U.S. 483 (1954)",
      "proposition": "Separate educational facilities are inherently unequal",
      "propositionType": "PRIMARY_STANDARD"
    }]
  }'
```

---

## 5. HOLD Checkpoint (Protocol 8) Testing

### Trigger Conditions:
- [ ] Citation fails existence check
- [ ] Holding confidence < 80%
- [ ] Bad law detected (overruled/superseded)
- [ ] Quote mismatch > 10%

### Customer Response Options:
1. **PROVIDE_EVIDENCE** - Upload supporting documents
2. **PROCEED_WITH_ACKNOWLEDGMENT** - Accept risk with written acknowledgment
3. **CANCEL** - Cancel the order

### Test HOLD Flow:
1. [ ] Submit order with known-bad citation
2. [ ] Verify workflow pauses at HOLD
3. [ ] Check customer notification sent
4. [ ] Test each response option
5. [ ] Verify workflow resumes correctly

---

## 6. Admin Dashboard Verification

### Settings Page
- [ ] API Keys tab shows all 5 key types
- [ ] Test buttons work for each key
- [ ] Keys save and encrypt properly
- [ ] Keys retrieve correctly (check logs)

### Order Management
- [ ] Generate button shows "14-Phase Workflow"
- [ ] Resume button appears for failed workflows
- [ ] Order status updates correctly
- [ ] CIV report accessible per order

### Analytics
- [ ] VPI cache hit rate displayed
- [ ] CIV verification stats shown
- [ ] Cost estimates accurate

---

## 7. Performance & Rate Limits

### API Rate Limits
| Service | Limit | Notes |
|---------|-------|-------|
| CourtListener | 5000/day free | Token increases limit |
| Case.law | 500/hour | Authenticated |
| Anthropic | Per plan | Monitor usage |

### Recommended Settings:
```typescript
// lib/civ/types.ts - DEFAULT_CIV_CONFIG
maxConcurrentVerifications: 3,  // Parallel citations
delayBetweenApiCalls: 500,      // 500ms between calls
cacheEnabled: true,             // Use VPI cache
```

### Monitor:
- [ ] Set up Anthropic usage alerts
- [ ] Monitor CourtListener rate limit headers
- [ ] Track VPI cache hit rate (target: >30%)

---

## 8. Security Checklist

### API Key Security
- [ ] Keys stored with AES-256-GCM encryption
- [ ] ENCRYPTION_SECRET set and secure
- [ ] Keys never logged in plaintext
- [ ] Admin-only access to settings

### Database Security
- [ ] RLS policies enabled on all VPI tables
- [ ] Service role key not exposed to client
- [ ] Supabase security rules reviewed

### Input Validation
- [ ] Citation strings sanitized
- [ ] File uploads validated
- [ ] SQL injection prevented (parameterized queries)

---

## 9. Monitoring & Logging

### Set Up Alerts For:
- [ ] Workflow failures (`generation_failed` status)
- [ ] High HOLD trigger rate (>10%)
- [ ] API key errors (401/403)
- [ ] Rate limit warnings (429)

### Log Locations:
- `automation_logs` table - All workflow actions
- `civ_verification_runs` table - CIV audit trail
- Vercel/server logs - API errors

### Key Metrics to Track:
- Orders completed per day
- Average workflow duration
- CIV pass rate
- VPI cache hit rate
- HOLD trigger frequency

---

## 10. Final Production Deployment

### Pre-Deploy:
- [ ] All environment variables set in Vercel
- [ ] Database migrations applied to production
- [ ] API keys tested in production environment
- [ ] Stripe webhooks configured for production URL

### Deploy:
```bash
# Build check
npm run build

# Deploy to Vercel
vercel --prod
```

### Post-Deploy Verification:
- [ ] Homepage loads
- [ ] Admin login works
- [ ] API keys show as configured
- [ ] Create test order
- [ ] Run workflow end-to-end
- [ ] Verify CIV results in VPI tables
- [ ] Check Stripe payment flow
- [ ] Verify email notifications

---

## 11. Rollback Plan

### If Issues Occur:
1. Vercel: Instant rollback to previous deployment
2. Database: Keep migration rollback scripts ready
3. API Keys: Can revert to env vars if DB issues

### Emergency Contacts:
- Anthropic Support: support@anthropic.com
- CourtListener: https://free.law/contact/
- Supabase: Dashboard support chat

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| QA | | | |
| Product Owner | | | |

---

**System is PRODUCTION READY when all checkboxes are complete.**
