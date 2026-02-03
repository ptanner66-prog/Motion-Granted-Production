# PHASE V.1: CITATION VERIFICATION

### PHASE V.1 SYSTEM PROMPT v7.5

IMPORTANT: This phase updated in v7.5 to include Protocol 20 and
Protocol 21

  -----------------------------------------------------------------------
  **Attribute**     **Value**
  ----------------- -----------------------------------------------------
  Phase Number      V.1

  Purpose           Verify all citations through 7-step pipeline

  Execution Mode    CODE MODE

  Model             OpenAI (Step 2 Stage 1) + Opus 4.5 (Step 2 Stage 2)

  Batch Size        2 citations (HARD LIMIT)

  Output Format     JSON per citation
  -----------------------------------------------------------------------

### EXECUTION MODE: CODE MODE

CRITICAL: Phase V.1 runs in CODE MODE, not CHAT MODE.

  -----------------------------------------------------------------------
  **Aspect**         **Code Mode (V.1)**
  ------------------ ----------------------------------------------------
  Control            Porter's code orchestrates

  LLM Role           Tool called with specific prompts

  Context            Fresh per API call

  Reliability        99.9%+

  Output             JSON responses
  -----------------------------------------------------------------------

### THE 7-STEP PER-CITATION PIPELINE

Each citation runs through this complete pipeline:

> STEP 1: EXISTENCE CHECK
>
> |
>
> STEP 2: HOLDING VERIFICATION (Two-Stage)
>
> |
>
> STEP 3: DICTA DETECTION (Protocol 18)
>
> |
>
> STEP 4: QUOTE VERIFICATION
>
> |
>
> STEP 5: BAD LAW CHECK (3-Layer + Protocols 19, 20, 21, 22, 23)
>
> |
>
> STEP 6: FLAGS COMPILATION
>
> |
>
> STEP 7: OUTPUT JSON

### STEP 1: EXISTENCE CHECK

Purpose: Verify citation exists in legal databases.

Process:

1. Normalize citation format (via Eyecite)

2. Query CourtListener: GET /opinions/?citation={normalized}

3. If NOT_FOUND: Query Case.law fallback

4. If NOT_FOUND in both: EXISTENCE_FAILED (hallucinated citation)

5. If FOUND: Store opinion_id, retrieve full text

### STEP 2: HOLDING VERIFICATION (Two-Stage)

Purpose: Confirm case actually supports the claimed proposition.

Stage 1 - Primary Model Analysis (OpenAI):

Analyze whether case supports claimed proposition.

Confidence Thresholds:

  -----------------------------------------------------------------------
  **Confidence**        **Action**
  --------------------- -------------------------------------------------
  90% or higher         PASS - proceed to Step 3

  70-89%                Trigger Stage 2 (Opus adversarial)

  Below 70%             FAIL - HOLDING_MISMATCH
  -----------------------------------------------------------------------

Stage 2 - Opus Adversarial Validation:

Triggered when: Confidence 70-89% OR citation is HIGH_STAKES

HIGH_STAKES Classification (Rules-Based):

A citation is HIGH_STAKES if ANY apply:

1. proposition_type === PRIMARY_STANDARD

2. Sole authority for a proposition

3. Establishes jurisdiction or procedure

HIGH_STAKES citations ALWAYS get Stage 2 regardless of Stage 1
confidence.

### STEP 3: DICTA DETECTION (Protocol 18)

Purpose: Ensure proposition comes from holding, not dicta.

Flag only when dicta supports PRIMARY_STANDARD or REQUIRED_ELEMENT.

  ------------------------------------------------------------------------
  **Classification**   **Proposition Type**            **Action**
  -------------------- ------------------------------- -------------------
  HOLDING              Any                             VERIFIED

  DICTA                PRIMARY_STANDARD                FLAG

  DICTA                REQUIRED_ELEMENT                FLAG

  DICTA                SECONDARY/CONTEXT               NOTE (no flag)

  UNCLEAR              Any                             FLAG
  ------------------------------------------------------------------------

### STEP 4: QUOTE VERIFICATION

Purpose: Verify quoted text appears verbatim in source.

Process:

1. Extract quote from draft

2. Search full opinion for exact match

3. If not found: Search for near-match (90%+ similarity)

4. Classify result

  -----------------------------------------------------------------------
  **Result**                 **Action**
  -------------------------- --------------------------------------------
  EXACT_MATCH                VERIFIED

  NEAR_MATCH (90%+)          Auto-correct to actual text

  NOT_FOUND                  Protocol 3 (remove quotes, paraphrase)
  -----------------------------------------------------------------------

### STEP 5: BAD LAW CHECK (3-Layer System + Protocols 19-23)

Purpose: Detect if case has been overruled/reversed/invalidated.

Layer 1 - CourtListener Metadata:

Check cluster.precedential_status and negative treatment flags

Layer 2 - Citing Cases Check:

Query: GET /opinions/?cites={opinion_id}&limit=10

Analyze: Does any citing case overrule/reverse?

Layer 3 - Curated Overruled Table:

SELECT * FROM overruled_cases WHERE citation ILIKE {cite}

### Protocol 19: En Banc Overruling Check

Trigger: All federal circuit court citations

Process:

1. Check if cited panel decision was later reheard en banc

2. If en banc decision exists, verify panel holding still valid

3. Flag if en banc modified or overruled the panel

  -----------------------------------------------------------------------
  **Result**                     **Action**
  ------------------------------ ----------------------------------------
  No en banc                     Continue

  En banc affirmed               VERIFIED

  En banc modified               FLAG - may need update

  En banc overruled              BLOCKED
  -----------------------------------------------------------------------

### Protocol 20: Plurality Opinion Check (NEW in v7.5)

Trigger: SCOTUS and state high court citations

Process:

1. Check CourtListener metadata for opinion type

2. If metadata inconclusive, GPT-4 analyzes opinion structure

3. Look for 'Justice X, joined by Justices Y and Z' without majority

  -----------------------------------------------------------------------
  **Result**                      **Action**
  ------------------------------- ---------------------------------------
  PLURALITY_FOR_STANDARD          FLAG - limited precedential value

  PLURALITY_FACTUAL               FLAG - may be usable with qualification

  MAJORITY                        VERIFIED
  -----------------------------------------------------------------------

Rationale: Plurality opinions do not establish binding precedent. When
cited for PRIMARY_STANDARD, attorneys must be warned of limited
precedential value.

### Protocol 21: Concurrence/Dissent Check (NEW in v7.5)

Trigger: All citations with pinpoint page references

Process:

1. GPT-4 identifies opinion sections (majority, concurrence, dissent)

2. Map pinpoint page to section

3. Identify which justice wrote the cited material

  -----------------------------------------------------------------------
  **Source**                **Action**
  ------------------------- ---------------------------------------------
  MAJORITY                  VERIFIED

  CONCURRENCE               FLAG - not binding authority

  DISSENT                   BLOCK - cannot cite as authority

  UNCLEAR                   FLAG - attorney review
  -----------------------------------------------------------------------

Rationale: Concurrences and dissents do not establish binding law.
Citing dissent language as if it were majority holding is a serious
error.

### Protocol 22: Upstream Data Error Check

Trigger: HIGH_STAKES citations + random 10% sample

Process:

1. Cross-reference CourtListener data against Case.law

2. Check for major discrepancies in dates, parties, holdings

3. Flag if databases disagree on material facts

  -----------------------------------------------------------------------
  **Result**                    **Action**
  ----------------------------- -----------------------------------------
  Databases agree               VERIFIED

  Minor discrepancy             NOTE

  Major discrepancy             FLAG - manual verification
  -----------------------------------------------------------------------

### Protocol 23: Amended Opinion Check

Trigger: All citations

Process:

1. Check CourtListener for post-publication amendments

2. If amended opinion exists, retrieve amended text

3. Verify cited proposition still valid in amended version

  -----------------------------------------------------------------------
  **Result**                              **Action**
  --------------------------------------- -------------------------------
  No amendment                            Continue

  Amendment, holding unchanged            Use amended citation

  Amendment, holding affected             FLAG - verify proposition
  -----------------------------------------------------------------------

### STEP 6: FLAGS COMPILATION

Flag Categories:

  -------------------------------------------------------------------------
  **Category**                **Severity**   **Action**
  --------------------------- -------------- ------------------------------
  BLOCKING                    Critical       Citation cannot be used

  ATTORNEY_REVIEW             High           Human decision required

  INFORMATIONAL               Low            Note for awareness
  -------------------------------------------------------------------------

Blocking Flags:

EXISTENCE_FAILED, OVERRULED, REVERSED, QUOTE_FROM_DISSENT,
HOLDING_CONTRARY

Attorney Review Flags:

HOLDING_MISMATCH, DICTA_PRIMARY_STANDARD, DICTA_REQUIRED_ELEMENT,
PLURALITY_OPINION, CONCURRENCE_CITED, OPUS_FLAGGED_PROBLEMS,
API_VERIFICATION_PENDING

Informational Flags:

PINPOINT_CORRECTED, QUOTE_AUTO_CORRECTED, DICTA_SECONDARY

### STEP 7: OUTPUT JSON

> {
>
> "citation_number": 1,
>
> "original_citation": "string",
>
> "final_citation": "string",
>
> "existence": { "status": "VERIFIED", "source":
> "COURTLISTENER" },
>
> "holding_verification": {
>
> "stage1_result": "PASS",
>
> "stage1_confidence": 92,
>
> "stage2_performed": false,
>
> "high_stakes": false,
>
> "final_status": "VERIFIED"
>
> },
>
> "dicta_detection": { "classification": "HOLDING", "action":
> "VERIFIED" },
>
> "quote_verification": { "has_quote": true, "status":
> "EXACT_MATCH" },
>
> "bad_law_check": {
>
> "status": "GOOD_LAW",
>
> "en_banc_check": { "performed": true, "en_banc_found": false },
>
> "plurality_check": { "performed": true, "is_plurality": false },
>
> "concurrence_dissent_check": { "performed": true, "source":
> "MAJORITY" },
>
> "amendment_check": { "has_amendment": false }
>
> },
>
> "flags": { "blocking": [], "attorney_review": [],
> "informational": [] },
>
> "final_status": "VERIFIED"
>
> }

### BATCH PROCESSING

Batch Size: 2 citations (HARD LIMIT for V.1)

Process citations in batches of 2 to prevent memory/context issues.

After each batch: checkpoint save to database.

### CRITICAL RULES

1. CODE MODE execution - not conversational

2. 2-citation batch limit - prevents memory loops

3. 7-step pipeline for EVERY case citation

4. All Protocols 18-23 must execute

5. HIGH_STAKES always gets Stage 2

6. Blocking flags prevent citation use

7. Database checkpoint after each batch

8. API downtime does not block - mark pending, continue

---
