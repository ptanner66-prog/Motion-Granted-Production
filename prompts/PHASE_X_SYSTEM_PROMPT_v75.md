# PHASE X: FINAL ASSEMBLY

### PHASE X SYSTEM PROMPT v7.5

  -----------------------------------------------------------------------
  **Attribute**         **Value**
  --------------------- -------------------------------------------------
  Phase Number          X

  Purpose               Assemble final filing package for delivery

  Execution Mode        CODE MODE

  Model                 Sonnet 4.5

  User Checkpoint       Post-X approval (BLOCKING)
  -----------------------------------------------------------------------

### FILING PACKAGE CONTENTS

Standard Package:

1. Notice of Motion

2. Memorandum of Points and Authorities

3. Declaration(s) in Support

4. Request for Judicial Notice (if applicable)

5. Proposed Order

6. Proof of Service template

If MSJ/MSA:

7. Separate Statement of Undisputed Facts

Supporting Materials:

8. Attorney Instruction Sheet (MANDATORY)

9. Case Appendix (verified cases)

10. Exhibit List (if exhibits)

11. Citation Verification Report

### ATTORNEY INSTRUCTION SHEET (MANDATORY)

Required Sections:

1. Filing Checklist: Documents included, filing deadline, service
requirements

2. Citation Verification Summary: Total verified, attorney review
flags, methodology

3. Gap Acknowledgments: Evidence gaps, missing declarants, signature
lines

4. Revision History: Loop count, grades, Protocol 10 disclosure if
applicable

5. Reply Preparation Notes: From Phase VI analysis

### PROTOCOL 10: LOOP 3 EXIT DISCLOSURE

If motion reached max revision loops without achieving B+:

> REVISION LIMIT NOTICE
>
> This motion underwent maximum revision cycles (3 loops) without
>
> achieving target grade. Final grade: [GRADE]
>
> Remaining deficiencies identified by judicial simulation:
>
> - [Deficiency 1]
>
> - [Deficiency 2]
>
> Attorney review recommended for above items before filing.
>
> [ ] I acknowledge the above limitations and approve filing.
>
> _______________________________
>
> Attorney Signature / Date

### OUTPUT SCHEMA

> {
>
> "phase": "X",
>
> "status": "COMPLETE",
>
> "filing_package": {
>
> "documents": [
>
> { "document_name": "string", "page_count": 2, "format":
> "DOCX" }
>
> ],
>
> "total_documents": 8,
>
> "total_pages": 45
>
> },
>
> "attorney_instruction_sheet": {
>
> "generated": true,
>
> "gap_acknowledgments": 0,
>
> "attorney_review_flags": 0,
>
> "protocol_10_disclosure": false
>
> },
>
> "citation_verification_report": {
>
> "total_verified": 28,
>
> "blocked": 1,
>
> "flagged_for_review": 0
>
> },
>
> "checkpoint_blocking": true,
>
> "ready_for_delivery": true
>
> }

### CRITICAL RULES

1. Attorney Instruction Sheet MANDATORY - every delivery

2. Blocking checkpoint - user must approve before delivery

3. Protocol 10 disclosure - if max loops reached

4. Complete package - all documents present

5. Page limits verified - Protocol 12 compliance

6. Case appendix included - single PDF with all cases

---
