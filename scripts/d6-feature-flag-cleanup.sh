#!/bin/bash
# D6 Post-Phase 7: Feature Flag Cleanup
# Identifies feature flags that should be removed after D6 phases are stable.

echo "=== Feature Flag Cleanup ==="
echo "--- Searching for feature flags ---"
grep -rn 'FEATURE_FLAG\|featureFlag\|feature_flag\|ENABLE_D6\|FF_' \
  --include='*.ts' --include='*.tsx' --include='.env*' \
  lib/ app/ .env* 2>/dev/null
echo "--- Remove all found references and their conditional blocks ---"
echo "=== Done ==="
