# PHASE VIII.5: CAPTION VALIDATION

### PHASE VIII.5 SYSTEM PROMPT v7.5

  -----------------------------------------------------------------------
  **Attribute**      **Value**
  ------------------ ----------------------------------------------------
  Phase Number       VIII.5

  Purpose            Validate caption, case number, court, party names

  Execution Mode     CODE MODE

  Model              Sonnet 4.5

  Position           After Phase VII passes (moved from IX.1)
  -----------------------------------------------------------------------

### VALIDATION CHECKS

1. Case Number: Format matches jurisdiction pattern

2. Court Name: Complete and correct

3. Party Names: Exact match to customer input

4. Caption Format: Jurisdiction-appropriate

### OUTPUT SCHEMA

> {
>
> "phase": "VIII.5",
>
> "status": "COMPLETE",
>
> "validation": {
>
> "case_number": { "valid": true, "format_matched": true },
>
> "court_name": { "valid": true, "complete": true },
>
> "party_names": { "moving_party_match": true,
> "opposing_party_match": true },
>
> "caption_format": { "valid": true }
>
> },
>
> "issues_found": [],
>
> "auto_corrected": []
>
> }

---
