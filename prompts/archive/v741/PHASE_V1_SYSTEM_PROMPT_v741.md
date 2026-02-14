# PHASE V.1 SYSTEM PROMPT v7.4.1

## Citation Accuracy Check — 7-Step Verification Pipeline

**Version:** 7.4.1
**Date:** January 27, 2026
**Mode:** CODE MODE
**MAJOR REWRITE:** Complete new architecture from v7.3/v7.4 specs

---

### PHASE OVERVIEW

| Attribute | Value |
|-----------|-------|
| Phase Number | V.1 |
| Purpose | Verify ALL citations via 7-step pipeline |
| Execution Mode | **CODE MODE** (Porter's code orchestrates) |
| Primary Model | OpenAI (see /lib/config/models.ts) |
| Secondary Model | Claude Opus 4.5 (adversarial validation) |
| Batch Size | **2 citations** (memory management) |
| Target Accuracy | ~0.08% undetected error rate per citation |

---

### MODEL CONFIGURATION

**IMPORTANT:** Model strings are centralized in `/lib/config/models.ts`.

```typescript
import { MODELS, getOpenAIParams } from '@/lib/config/models';

// For OpenAI citation verification:
const params = getOpenAIParams();
// Returns appropriate parameters based on model type

// For Opus adversarial validation:
const opusModel = MODELS.OPUS; // "claude-opus-4-5-20250514"
```

DO NOT hardcode model strings in phase executors.

---

### REQUIRED INPUT FROM PRIOR PHASES

Phase V.1 requires the following data from earlier phases:

| Data | Source Phase | Field Path | Purpose |
|------|--------------|------------|---------|
| Citation Bank | Phase IV | `citation_bank[]` | Base citation data with courtlistener_id |
| Proposition types | Phase III | `argument_structure[].propositions[].proposition_type` | HIGH_STAKES classification |
| Proposition types (duplicate) | Phase IV | `citation_bank[].proposition_type` | Carried forward from III |
| Draft with marked citations | Phase V | `documents.memorandum.content` | Citations to verify with [CITE: ID | TYPE] tags |
| Full opinion texts | Phase IV | Cached from CourtListener | For holding/quote verification |

**DATA HANDOFF CHECKLIST:**
- [ ] Phase III outputs proposition_type for each proposition
- [ ] Phase IV carries proposition_type into citation_bank
- [ ] Phase V marks citations with [CITE: {id} | {proposition_type}]
- [ ] V.1 receives all three data sources

---

### EXECUTION MODE: CODE MODE

**CRITICAL:** Phase V.1 runs in CODE MODE, not CHAT MODE.

| Aspect | Code Mode (V.1) |
|--------|-----------------|
| Control | Porter's code orchestrates |
| LLM Role | Tool called with specific prompts |
| Context | Fresh per API call |
| Reliability | 99.9%+ |
| Output | JSON responses |

---

### THE 7-STEP PER-CITATION PIPELINE

Each citation runs through this complete pipeline:

```
STEP 1: EXISTENCE CHECK
        ↓
STEP 2: HOLDING VERIFICATION (Two-Stage)
        ↓
STEP 3: DICTA DETECTION (Protocol 18)
        ↓
STEP 4: QUOTE VERIFICATION
        ↓
STEP 5: BAD LAW CHECK (3-Layer + Protocols 19, 22, 23)
        ↓
STEP 6: FLAGS COMPILATION
        ↓
STEP 7: OUTPUT JSON
```

---

### STEP 1: EXISTENCE CHECK

**Purpose:** Verify citation exists in legal databases.

**Process:**
1. Normalize citation format (via Eyecite)
2. Query CourtListener: `GET /opinions/?citation={normalized}`
3. If NOT_FOUND → Query Case.law fallback
4. If NOT_FOUND in both → EXISTENCE_FAILED (hallucinated citation)
5. If FOUND → Store opinion_id, retrieve full text

**Output:**
```json
{
  "existence": {
    "status": "VERIFIED | NOT_FOUND | VERIFICATION_PENDING",
    "source": "COURTLISTENER | CASE_LAW | NEITHER",
    "opinion_id": "string",
    "full_text_retrieved": true
  }
}
```

**API DOWNTIME HANDLING (Protocol 11)**

If CourtListener returns 429/500/503:
1. Retry with exponential backoff (max 3 attempts)
2. If still failing → Try Case.law fallback
3. If Case.law also failing → Mark citation as VERIFICATION_PENDING
4. Flag for manual verification
5. Continue pipeline for other citations — NEVER block entire V.1 phase

**Output for API failure:**
```json
{
  "existence": {
    "status": "VERIFICATION_PENDING",
    "reason": "API_UNAVAILABLE",
    "apis_tried": ["COURTLISTENER", "CASE_LAW"],
    "retry_recommended": true,
    "manual_verification_required": true
  }
}
```

---

### STEP 2: HOLDING VERIFICATION (Two-Stage)

**Purpose:** Confirm case actually supports the claimed proposition.

**Stage 1 — Primary Model Analysis:**

```typescript
import { MODELS, getOpenAIParams } from '@/lib/config/models';

const params = getOpenAIParams();
// params includes: model, temperature/reasoning_effort, max_tokens

const prompt = `Analyze whether this case supports the claimed proposition.

CASE TEXT: {full_opinion_text}

PROPOSITION CLAIMED: {proposition_from_draft}

Respond in JSON:
{
  "supports_proposition": true/false,
  "confidence": 0-100,
  "classification": "EXACT | CONSISTENT | OVERSTATED | PARTIAL | CONTRARY | DICTA",
  "relevant_passage": "string",
  "reasoning": "string"
}`;
```

**Confidence Thresholds:**

| Confidence | Action |
|------------|--------|
| ≥90% | PASS — proceed to Step 3 |
| 70-89% | → Stage 2 (Opus adversarial) |
| <70% | FAIL — HOLDING_MISMATCH |

**Stage 2 — Opus Adversarial Validation:**

Triggered when: Confidence 70-89% OR citation is HIGH_STAKES

```typescript
const adversarialPrompt = `You are skeptical opposing counsel reviewing this citation.

Primary model concluded: {primary_result}

Identify problems:
1. Does case actually say what's claimed?
2. Is proposition from holding or dicta?
3. Distinguishing facts that weaken citation?
4. Negative treatment missed?

Respond in JSON:
{
  "validates_primary_conclusion": true/false,
  "problems_found": [],
  "revised_classification": "string",
  "recommendation": "APPROVE | MODIFY | FLAG | REJECT"
}`;

// Use MODELS.OPUS for adversarial check
```

**HIGH_STAKES Classification (Rules-Based):**

A citation is HIGH_STAKES if ANY apply:
1. `proposition_type === "PRIMARY_STANDARD"` (first case cited for legal standard)
2. Sole authority for a proposition
3. Establishes jurisdiction or procedure

HIGH_STAKES citations ALWAYS get Stage 2 regardless of Stage 1 confidence.

---

### STEP 3: DICTA DETECTION (Protocol 18)

**Purpose:** Ensure proposition comes from holding, not dicta. Flag only when dicta supports PRIMARY_STANDARD or REQUIRED_ELEMENT.

**PROMPT:**
```
Is this proposition from HOLDING or DICTA?

HOLDING = necessary to decide case outcome
DICTA = commentary not essential to decision

Respond in JSON:
{
  "classification": "HOLDING | DICTA | UNCLEAR",
  "confidence": 0-100,
  "reasoning": "string"
}
```

**Flagging Decision:**

| Classification | Proposition Type | Action |
|----------------|------------------|--------|
| HOLDING | Any | VERIFIED |
| DICTA | PRIMARY_STANDARD | FLAG |
| DICTA | REQUIRED_ELEMENT | FLAG |
| DICTA | SECONDARY/CONTEXT | NOTE (no flag) |
| UNCLEAR | Any | FLAG |

---

### STEP 4: QUOTE VERIFICATION

**Purpose:** Verify quoted text appears verbatim in source.

**Process:**
1. Extract quote from draft
2. Search full opinion for exact match
3. If not found → Search for near-match (90%+ similarity)
4. Classify result

**Classification:**

| Result | Action |
|--------|--------|
| EXACT_MATCH | VERIFIED |
| NEAR_MATCH (90%+) | Auto-correct to actual text |
| NOT_FOUND | Protocol 3 (remove quotes, paraphrase) |

---

### STEP 5: BAD LAW CHECK (3-Layer System)

**Purpose:** Detect if case has been overruled/reversed/invalidated.

**Layer 1 — CourtListener Metadata:**
- Check `cluster.precedential_status`
- Check negative treatment flags

**Layer 2 — Citing Cases Check:**
- Query: `GET /opinions/?cites={opinion_id}&limit=10`
- Analyze: Does any citing case overrule/reverse?

**Layer 3 — Curated Overruled Table:**
- `SELECT * FROM overruled_cases WHERE citation ILIKE '%{cite}%'`

**Additional Protocols (v7.4):**
- Protocol 19: En Banc Overruling Check
- Protocol 22: Cross-reference against Case.law for HIGH_STAKES
- Protocol 23: Amended Opinion Check

**Classification:**

| Status | Action |
|--------|--------|
| GOOD_LAW | VERIFIED |
| OVERRULED | BLOCKED |
| REVERSED_ON_APPEAL | BLOCKED |
| CRITICIZED | FLAG |
| PENDING_REVIEW | FLAG |

---

### STATUTE CITATION HANDLING

Statutes follow an abbreviated pipeline (Steps 3-5 not applicable):

**STEP 1: Existence Check**
- Federal: Verify via Cornell LII or uscode.house.gov
- California: Verify via California Legislative Information
- Louisiana: Verify via Louisiana State Legislature

**STEP 2: Currency Check**
- Confirm statute has not been repealed or amended
- Note effective date if recent amendment

**STEPS 3-5: SKIP** (not applicable to statutes)

**STEP 6: Flags**
- STATUTE_REPEALED → BLOCKING
- STATUTE_AMENDED → FLAG with amendment date
- STATUTE_CURRENT → VERIFIED

**Statute Output:**
```json
{
  "citation_type": "STATUTE",
  "existence": {
    "status": "VERIFIED",
    "source": "CORNELL_LII"
  },
  "currency": {
    "current": true,
    "last_amended": "2024-01-01"
  },
  "flags": {
    "blocking": [],
    "informational": []
  }
}
```

---

### STEP 6: FLAGS COMPILATION

**Flag Categories:**

| Category | Severity | Action |
|----------|----------|--------|
| BLOCKING | Critical | Citation cannot be used |
| ATTORNEY_REVIEW | High | Human decision required |
| INFORMATIONAL | Low | Note for awareness |

**Blocking Flags:**
- EXISTENCE_FAILED
- OVERRULED
- REVERSED
- QUOTE_FROM_DISSENT
- HOLDING_CONTRARY

**Attorney Review Flags:**
- HOLDING_MISMATCH
- DICTA_PRIMARY_STANDARD
- DICTA_REQUIRED_ELEMENT
- PLURALITY_OPINION
- OPUS_FLAGGED_PROBLEMS
- API_VERIFICATION_PENDING

**Informational Flags:**
- PINPOINT_CORRECTED
- QUOTE_AUTO_CORRECTED
- DICTA_SECONDARY

---

### STEP 7: OUTPUT JSON

```json
{
  "citation_number": 1,
  "original_citation": "string",
  "final_citation": "string",
  "existence": {
    "status": "VERIFIED",
    "source": "COURTLISTENER",
    "opinion_id": "string"
  },
  "holding_verification": {
    "stage1_result": "PASS",
    "stage1_confidence": 92,
    "stage1_classification": "CONSISTENT",
    "stage2_performed": false,
    "high_stakes": false,
    "final_status": "VERIFIED"
  },
  "dicta_detection": {
    "classification": "HOLDING",
    "proposition_type": "SECONDARY",
    "action": "VERIFIED"
  },
  "quote_verification": {
    "has_quote": true,
    "status": "EXACT_MATCH",
    "action": "VERIFIED"
  },
  "bad_law_check": {
    "status": "GOOD_LAW",
    "en_banc_check": {
      "performed": true,
      "en_banc_found": false
    },
    "amendment_check": {
      "has_amendment": false
    }
  },
  "flags": {
    "blocking": [],
    "attorney_review": [],
    "informational": []
  },
  "final_status": "VERIFIED",
  "verification_timestamp": "ISO8601"
}
```

---

### REPLACEMENT AUTHORITY PROTOCOL (Protocol 2)

When citation fails and must be replaced:

**Priority Order:**
1. **Binding Authority:** Same jurisdiction higher court → same court level → SCOTUS
2. **Persuasive Authority:** Same circuit different district → sister circuits → analogous state
3. **Secondary Sources:** Restatements → Treatises → Law review

**Process:**
1. Search Citation Bank for verified alternatives
2. If none → Mini Phase IV targeted research
3. Verify replacement through full 7-step pipeline
4. If verified → substitute; if not → FLAG for attorney

---

### BATCH PROCESSING

**Batch Size: 2 citations (HARD LIMIT for V.1)**

Process citations in batches of 2 to prevent memory/context issues. After each batch → checkpoint save to database.

---

### AGGREGATED OUTPUT SCHEMA

```json
{
  "phase": "V.1",
  "status": "COMPLETE",
  "total_citations_verified": 28,
  "verification_summary": {
    "verified": 25,
    "auto_corrected": 2,
    "blocked": 1,
    "flagged_for_review": 0,
    "pending_manual_verification": 0
  },
  "citations": [
    /* array of per-citation results */
  ],
  "blocked_citations": [
    {
      "citation_id": "C015",
      "reason": "EXISTENCE_FAILED",
      "replacement_found": true,
      "replacement_citation": "string"
    }
  ],
  "attorney_review_items": [],
  "case_appendix_generated": true,
  "verification_report_generated": true
}
```

---

### CRITICAL RULES

1. **CODE MODE execution** — Porter's code orchestrates, not chat
2. **Use centralized model config** — import from /lib/config/models.ts
3. **7 steps per citation** — no shortcuts
4. **2-citation batches** — HARD LIMIT for memory management
5. **HIGH_STAKES always get Stage 2** — regardless of Stage 1 confidence
6. **Protocols 18-23 integrated** — dicta, en banc, plurality, etc.
7. **Replacement priority** — Binding > Persuasive > Secondary
8. **Database checkpoint after each batch** — crash recovery
9. **API downtime doesn't block** — mark pending, continue with others
