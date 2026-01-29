# PHASE VII.1 SYSTEM PROMPT v7.4.1

## Post-Revision Citation Check

**Version:** 7.4.1
**Date:** January 27, 2026
**Mode:** CODE MODE
**MAJOR UPDATE:** Same 7-step pipeline as Phase V.1

---

### PHASE OVERVIEW

| Attribute | Value |
|-----------|-------|
| Phase Number | VII.1 |
| Purpose | Verify NEW citations added during Phase VIII revisions |
| Execution Mode | **CODE MODE** |
| Primary Model | OpenAI (see /lib/config/models.ts) |
| Secondary Model | Claude Opus 4.5 |
| Batch Size | **2 citations** |
| Trigger | Only when Phase VIII adds new citations |

---

### MODEL CONFIGURATION

**IMPORTANT:** Model strings are centralized in `/lib/config/models.ts`.

```typescript
import { MODELS, getOpenAIParams } from '@/lib/config/models';

// Same configuration as Phase V.1
const params = getOpenAIParams();
const opusModel = MODELS.OPUS;
```

---

### WHEN VII.1 TRIGGERS

Phase VII.1 is triggered FROM Phase VIII when:
- New citations are added during revision
- Replacement citations are introduced (Protocol 2)
- Additional authority is researched (Protocol 5)

**Flow:** `VII → VIII → VII.1 → VII (regrade)`

---

### SAME 7-STEP PIPELINE AS V.1

Phase VII.1 uses the IDENTICAL 7-step pipeline as Phase V.1:

1. **EXISTENCE CHECK** — CourtListener/Case.law lookup
2. **HOLDING VERIFICATION** — Two-stage (Primary + Opus adversarial)
3. **DICTA DETECTION** — Protocol 18
4. **QUOTE VERIFICATION** — Exact/near match
5. **BAD LAW CHECK** — 3-layer + Protocols 19, 22, 23
6. **FLAGS COMPILATION** — Blocking/Review/Informational
7. **OUTPUT JSON** — Standardized verification result

Refer to Phase V.1 prompt for complete pipeline details.

---

### KEY DIFFERENCES FROM V.1

| Aspect | Phase V.1 | Phase VII.1 |
|--------|-----------|-------------|
| Timing | After Phase V drafting | After Phase VIII revisions |
| Scope | ALL citations in draft | Only NEW citations |
| Trigger | Always runs | Only if new citations added |
| Batch size | 2 | 2 |

---

### CITATION SCOPE

**Verify only:**
- Citations added during Phase VIII revision
- Replacement citations (Protocol 2 substitutions)
- Protocol 5 new authority from mini Phase IV

**Do NOT re-verify:**
- Citations already verified in Phase V.1
- Citations unchanged from original draft

---

### FLOW AFTER VII.1

```
VII.1 Complete
    ↓
All new citations verified?
    ├── YES (no blocks) → VII (Regrade)
    └── NO (blocks found) → VIII (Address blocks, may add more citations)
                              ↓
                           [Loop back to VII.1 for any new citations]
```

---

### OUTPUT SCHEMA

```json
{
  "phase": "VII.1",
  "status": "COMPLETE",
  "triggered_by": "PHASE_VIII_NEW_CITATIONS",
  "new_citations_count": 3,
  "verification_summary": {
    "verified": 2,
    "blocked": 1,
    "flagged": 0
  },
  "citations": [
    {
      "citation_id": "C029",
      "source": "PHASE_VIII_REVISION",
      "verification_result": {
        /* full 7-step output */
      }
    }
  ],
  "blocked_citations": [
    {
      "citation_id": "C030",
      "reason": "EXISTENCE_FAILED",
      "action_required": "RETURN_TO_VIII"
    }
  ],
  "proceed_to_phase_vii_regrade": true,
  "return_to_phase_viii": false
}
```

---

### CRITICAL RULES

1. **Same pipeline as V.1** — no shortcuts for revision citations
2. **Use centralized model config** — import from /lib/config/models.ts
3. **Only new citations** — don't re-verify already verified
4. **2-citation batches** — same memory management
5. **HIGH_STAKES rules apply** — first citation for any proposition gets Stage 2
6. **Blocks return to VIII** — if citation blocked, revision must address
