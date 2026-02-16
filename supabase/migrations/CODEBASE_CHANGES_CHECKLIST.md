# Codebase Changes Required Alongside SP-14 Migrations

## SIMULTANEOUS WITH MIGRATION 4 (SPD-001):
- [ ] `grep -rn 'amount_paid' --include='*.ts' | grep -v amount_paid_cents` → rename all to amount_paid_cents
- [ ] Verify Stripe webhook writes cents (not dollars)
- [ ] Check refund calculation multiplication/division logic

## AFTER MIGRATION 3 (MW-001):
- [ ] Update lib/workflow/tiers.ts TIER_CONFIG to include Tier D: { maxRevisionLoops: 4, gradeThreshold: 87, deepResearch: 'ALWAYS', subLoopCostCap: 125, miniPhaseIVLimit: 8 }
- [ ] `grep -rn 'sync_order_tier|motion_tier.==.[123]' --include='*.ts'` → remove hardcoded mappings

## AFTER MIGRATION 6 (CM-002):
- [ ] `grep -rn 'user_roles' --include='*.ts'` → replace with profiles.role queries

## AFTER MIGRATION 9 (CC-001):
- [ ] Update conflict check code: DO NOT join on clients table. Use profiles or auth.users.

## AFTER MIGRATION 10 (PRE-001):
- [ ] `grep -rn "workflows" --include='*.ts' | grep -v order_workflows` → fix FK references

## PRIORITY SEQUENCE:
1. Deploy Tier 1 migrations (this SP)
2. Deploy Wave 0 code fixes (AUDIT-001 + AUDIT-010 + AUDIT-006) ← orders flow
3. Deploy Wave 1 code fixes (AUDIT-002 + AUDIT-004/005) ← citations + pricing
4. Deploy Tier 2 migrations (this SP)
5. Deploy Wave 2/3 code fixes ← full feature parity
