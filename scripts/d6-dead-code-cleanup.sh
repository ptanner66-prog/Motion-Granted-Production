#!/bin/bash
# D6 Phase 5: Dead Code Cleanup
# ST-025 [P1] — Identify generateOrderDraft and legacy dead code paths.
# Run AFTER Phases 1-4 are verified working.

echo "=== D6 Phase 5: Dead Code Cleanup ==="

# ST-025: Check for generateOrderDraft (replaced by Inngest workflow)
echo "--- Checking for generateOrderDraft ---"
DRAFT_FILES=$(grep -rln 'generateOrderDraft' --include='*.ts' --include='*.tsx' lib/ app/ 2>/dev/null)
if [ -n "$DRAFT_FILES" ]; then
  echo "Found references in:"
  echo "$DRAFT_FILES"
  echo "ACTION: Delete the function definition and remove all imports/calls."
else
  echo "CLEAN: No generateOrderDraft references found."
fi

# Legacy citation verifier shim
echo "--- Checking for legacy citation-verifier.ts ---"
if [ -f "lib/workflow/citation-verifier.ts" ]; then
  echo "INFO: lib/workflow/citation-verifier.ts exists as re-export shim."
  echo "  Canonical location: lib/citation/citation-verifier.ts"
  echo "  NOTE: Do NOT delete — still imported by frozen workflow-orchestration.ts (SP23)."
else
  echo "CLEAN: No shim file found."
fi

# Dead citations directory (plural — legacy, not canonical lib/citation/)
echo "--- Checking for dead lib/citations/ directory (plural) ---"
if [ -d "lib/citations" ]; then
  echo "ACTION: Delete lib/citations/ (dead code). Canonical is lib/citation/ (singular)."
else
  echo "CLEAN: lib/citations/ already deleted."
fi

# ST-060 phantom migration
echo "--- Checking for ST-060 migration ---"
PHANTOM=$(ls supabase/migrations/*st060* supabase/migrations/*order_workflows_cp3* 2>/dev/null)
if [ -n "$PHANTOM" ]; then
  echo "ACTION: Delete phantom migration: $PHANTOM"
else
  echo "CLEAN: No ST-060 migration found."
fi

# Check for legacy storage bucket references
echo "--- Checking for legacy bucket references ---"
LEGACY_REFS=$(grep -rn "from('motion-deliverables')\|from('deliverables')" \
  --include='*.ts' --include='*.tsx' lib/ app/ 2>/dev/null | grep -v 'LEGACY_BUCKETS')
if [ -n "$LEGACY_REFS" ]; then
  echo "Found legacy bucket references:"
  echo "$LEGACY_REFS"
  echo "ACTION: Migrate to STORAGE_BUCKETS constants from @/lib/config/storage"
else
  echo "CLEAN: No legacy bucket references in active code."
fi

echo "=== Dead Code Cleanup Complete ==="
