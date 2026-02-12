#!/bin/bash

OUT="STATUS_$(date +%Y-%m-%d).md"

echo "# MOTION GRANTED — CODEBASE STATUS" > "$OUT"
echo "**Generated:** $(date)" >> "$OUT"
echo "" >> "$OUT"

# ═══════════════════════════════════════════
# 1. FILE STRUCTURE
# ═══════════════════════════════════════════

echo "## 1. File Structure (lib/)" >> "$OUT"
echo '```' >> "$OUT"
find lib/ -name "*.ts" -o -name "*.tsx" | sort >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

echo "## 2. File Structure (app/api/)" >> "$OUT"
echo '```' >> "$OUT"
find app/api/ -name "*.ts" 2>/dev/null | sort >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

echo "## 3. Prompt Files" >> "$OUT"
echo '```' >> "$OUT"
ls -la prompts/ 2>/dev/null >> "$OUT" || echo "No prompts/ directory found" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

# ═══════════════════════════════════════════
# 2. PHASE EXECUTORS — WHAT'S ACTUALLY RUNNING
# ═══════════════════════════════════════════

echo "## 4. Phase Executors — Imports" >> "$OUT"
echo '```typescript' >> "$OUT"
head -60 lib/workflow/phase-executors.ts 2>/dev/null >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

echo "## 5. Phase Executors — Model Selection (if local function exists)" >> "$OUT"
echo '```typescript' >> "$OUT"
grep -n -A 20 "getModelForPhase\|getModel\|modelFor" lib/workflow/phase-executors.ts 2>/dev/null | head -40 >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

echo "## 6. Phase Executors — What prompts are used" >> "$OUT"
echo '```' >> "$OUT"
grep -n "PHASE_PROMPTS\|system:" lib/workflow/phase-executors.ts 2>/dev/null | head -30 >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

# ═══════════════════════════════════════════
# 3. CONFIG — SINGLE SOURCE OF TRUTH CHECK
# ═══════════════════════════════════════════

echo "## 7. Model Routing Definitions (all files)" >> "$OUT"
echo '```' >> "$OUT"
grep -rn "getModelForPhase\|MODEL_ROUTING\|modelRouting" --include="*.ts" . 2>/dev/null | grep -v node_modules | grep -v ".next" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

echo "## 8. Quality Thresholds (all files)" >> "$OUT"
echo '```' >> "$OUT"
grep -rn "MINIMUM_PASSING\|QUALITY_PASSING\|minGrade\|0\.87\|0\.83\|gradePasses" --include="*.ts" . 2>/dev/null | grep -v node_modules | grep -v ".next" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

echo "## 9. Extended Thinking Budgets" >> "$OUT"
echo '```' >> "$OUT"
grep -rn "extendedThinking\|extended_thinking\|thinking_budget\|thinkingBudget\|128000\|10000" --include="*.ts" . 2>/dev/null | grep -v node_modules | grep -v ".next" | head -30 >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

# ═══════════════════════════════════════════
# 4. DEAD CODE CHECK
# ═══════════════════════════════════════════

echo "## 10. Dead Code Indicators" >> "$OUT"
echo "" >> "$OUT"

echo "### superprompt-builder.ts exists?" >> "$OUT"
test -f lib/workflow/superprompt-builder.ts && echo "YES — still exists" >> "$OUT" || echo "DELETED — gone" >> "$OUT"
echo "" >> "$OUT"

echo "### superprompt-builder imports:" >> "$OUT"
echo '```' >> "$OUT"
grep -rn "superprompt-builder" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules >> "$OUT" || echo "NONE — dead code confirmed" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

echo "### Duplicate realtime hooks:" >> "$OUT"
echo '```' >> "$OUT"
ls -la hooks/*ealtime* hooks/*Realtime* 2>/dev/null >> "$OUT" || echo "No duplicate hooks found" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

echo "### workflow.ts MODEL_ROUTING exists?" >> "$OUT"
echo '```' >> "$OUT"
grep -n "MODEL_ROUTING" types/workflow.ts 2>/dev/null >> "$OUT" || echo "NOT FOUND — already removed" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

# ═══════════════════════════════════════════
# 5. CURRENT ISSUES — WHAT MIGHT STILL BE BROKEN
# ═══════════════════════════════════════════

echo "## 11. Potential Issues" >> "$OUT"
echo "" >> "$OUT"

echo "### gradePasses default:" >> "$OUT"
echo '```' >> "$OUT"
grep -n "gradePasses" lib/workflow/phase-config.ts 2>/dev/null >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

echo "### Phase completion requirements:" >> "$OUT"
echo '```' >> "$OUT"
grep -A 20 "PHASE_COMPLETION_REQUIREMENTS" lib/workflow/phase-gates.ts 2>/dev/null | head -25 >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

echo "### Citation verifier — api_error handling:" >> "$OUT"
echo '```' >> "$OUT"
grep -n "api_error" lib/workflow/citation-verifier.ts 2>/dev/null >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

echo "### HOLD enforcement mode:" >> "$OUT"
echo '```' >> "$OUT"
grep -rn "HOLD_ENFORCEMENT\|DEADLINE_VALIDATION" --include="*.ts" --include="*.env*" . 2>/dev/null | grep -v node_modules | grep -v ".next" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

echo "### Payment-order linking:" >> "$OUT"
echo '```' >> "$OUT"
grep -n "order_id\|metadata" app/api/webhooks/stripe/route.ts 2>/dev/null | head -15 >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

# ═══════════════════════════════════════════
# 6. HEALTH METRICS
# ═══════════════════════════════════════════

echo "## 12. Codebase Health Metrics" >> "$OUT"
echo "" >> "$OUT"
echo "| Metric | Count |" >> "$OUT"
echo "|--------|-------|" >> "$OUT"
echo "| Total .ts files | $(find . -name '*.ts' -not -path '*/node_modules/*' -not -path '*/.next/*' | wc -l) |" >> "$OUT"
echo "| Total .tsx files | $(find . -name '*.tsx' -not -path '*/node_modules/*' -not -path '*/.next/*' | wc -l) |" >> "$OUT"
echo "| \`as any\` count | $(grep -rn 'as any' --include='*.ts' . 2>/dev/null | grep -v node_modules | grep -v '.next' | wc -l) |" >> "$OUT"
echo "| console.log in lib/ | $(grep -rn 'console.log' --include='*.ts' lib/ 2>/dev/null | wc -l) |" >> "$OUT"
echo "| TODO/FIXME/HACK | $(grep -rnE 'TODO|FIXME|HACK' --include='*.ts' . 2>/dev/null | grep -v node_modules | grep -v '.next' | wc -l) |" >> "$OUT"
echo "| @ts-ignore | $(grep -rnE '@ts-ignore|@ts-expect-error' --include='*.ts' . 2>/dev/null | grep -v node_modules | wc -l) |" >> "$OUT"
echo "" >> "$OUT"

# ═══════════════════════════════════════════
# 7. TYPESCRIPT STATUS
# ═══════════════════════════════════════════

echo "## 13. TypeScript Build Status" >> "$OUT"
echo '```' >> "$OUT"
npx tsc --noEmit 2>&1 | tail -10 >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

# ═══════════════════════════════════════════
# 8. RECENT GIT ACTIVITY
# ═══════════════════════════════════════════

echo "## 14. Last 20 Commits" >> "$OUT"
echo '```' >> "$OUT"
git log --oneline -20 2>/dev/null >> "$OUT" || echo "Not a git repo or no commits" >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

echo "## 15. Files Changed in Last 3 Days" >> "$OUT"
echo '```' >> "$OUT"
git log --since="3 days ago" --name-only --pretty=format:"" 2>/dev/null | sort -u | grep -v "^$" >> "$OUT" || echo "N/A" >> "$OUT"
echo '```' >> "$OUT"

echo ""
echo "✅ Status dump saved to: $OUT"
echo "Upload this file to your Claude project knowledge."
