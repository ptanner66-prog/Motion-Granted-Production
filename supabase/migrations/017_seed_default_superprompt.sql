-- Seed Default Superprompt Template
-- This provides the default motion generation template for all motion types

INSERT INTO superprompt_templates (
  name,
  description,
  motion_types,
  template,
  system_prompt,
  max_tokens,
  is_default
) VALUES (
  'Default Motion Template v7.2',
  'Production-grade legal motion generation template with 14-phase workflow',
  ARRAY['*']::TEXT[],
  E'################################################################################
#                     MOTION GRANTED WORKFLOW v7.2                              #
#                  14-PHASE LEGAL MOTION GENERATION                             #
################################################################################

CASE INFORMATION:
=================
Case Number: {{CASE_NUMBER}}
Case Caption: {{CASE_CAPTION}}
Court: {{COURT}}
Jurisdiction: {{JURISDICTION}}
Filing Deadline: {{FILING_DEADLINE}}

CLIENT INFORMATION:
===================
Moving Party: {{MOVING_PARTY}}
Attorney: {{ATTORNEY_NAME}}
Bar Number: {{BAR_NUMBER}}
Firm: {{FIRM_NAME}}
Address: {{FIRM_ADDRESS}}
Phone: {{FIRM_PHONE}}

MOTION TYPE: {{MOTION_TYPE}}
MOTION TIER: {{MOTION_TIER}}

CASE MATERIALS:
===============
Statement of Facts:
{{STATEMENT_OF_FACTS}}

Procedural History:
{{PROCEDURAL_HISTORY}}

Client Instructions:
{{CLIENT_INSTRUCTIONS}}

Document Summaries:
{{DOCUMENT_SUMMARIES}}

================================================================================
                              WORKFLOW EXECUTION
================================================================================

Execute the following 14-phase workflow to produce a court-ready motion:

PHASE I: INTAKE & DOCUMENT PROCESSING
--------------------------------------
- Parse all provided documents and case materials
- Extract key facts, dates, parties, and procedural events
- Identify the motion type and applicable legal standards
- Create structured case data for subsequent phases

PHASE II: LEGAL STANDARDS / MOTION DECONSTRUCTION
--------------------------------------------------
- Identify the precise legal standard for this motion type
- Break down required elements that must be proven
- Determine burden of proof and applicable rules
- Map elements to available facts

PHASE III: EVIDENCE STRATEGY / ISSUE IDENTIFICATION
----------------------------------------------------
- Analyze facts against legal elements
- Identify strengths and weaknesses in the argument
- Flag any jurisdictional or procedural issues
- CHECKPOINT: If issues found, flag for review

PHASE IV: AUTHORITY RESEARCH
----------------------------
- Research applicable case law and statutes
- Prioritize binding authority from this jurisdiction
- Verify all citations for accuracy
- Minimum citations: Tier A=5, Tier B=8, Tier C=15
- CHECKPOINT (CP1): Notify if citation verification issues

PHASE V: DRAFT MOTION
---------------------
- Draft complete motion following court format requirements
- Include all required sections:
  * Caption
  * Introduction/Preliminary Statement
  * Statement of Facts
  * Procedural History (if applicable)
  * Legal Standard
  * Argument (IRAC format)
  * Conclusion with specific relief requested
  * Signature Block
  * Certificate of Service

PHASE V.1: CITATION ACCURACY CHECK
----------------------------------
- Verify each citation format (Bluebook)
- Confirm propositions match holdings
- Flag any questionable citations

PHASE VI: OPPOSITION ANTICIPATION
---------------------------------
- Identify likely counter-arguments
- Draft preemptive responses
- Strengthen weak points
- Extended thinking: 8K tokens for Tier B/C

PHASE VII: JUDICIAL SIMULATION
------------------------------
- Evaluate motion as a skeptical judge would
- Grade A+ through F (B+ minimum to pass)
- Identify specific weaknesses
- Provide revision suggestions if below B+
- Extended thinking: 10K tokens (all tiers)
- CHECKPOINT (CP2): Notify with grade results

PHASE VII.1: REVISION LOOP (if needed)
--------------------------------------
- Apply judge feedback
- Strengthen identified weaknesses
- Re-evaluate (max 3 loops)

PHASE VIII: FINAL POLISH
------------------------
- Ensure consistent tone and style
- Verify word count within limits
- Check formatting compliance
- Extended thinking: 8K tokens for Tier B/C

PHASE VIII.5: AI DISCLOSURE CHECK
---------------------------------
- Check jurisdiction AI disclosure requirements
- Add disclosure if required
- Format appropriately

PHASE IX: FINAL ASSEMBLY
------------------------
- Assemble all components
- Generate table of authorities
- Create certificate of service
- Format for filing

PHASE IX.1: FINAL QA
--------------------
- Run quality checklist
- Verify no placeholders remain
- Confirm all sections present

PHASE X: DELIVERY APPROVAL
--------------------------
- CHECKPOINT (CP3): Blocking - requires admin approval
- Package deliverables
- Prepare for client delivery

================================================================================
                              OUTPUT REQUIREMENTS
================================================================================

Your output must be ONLY the final, court-ready motion document.

DO NOT include:
- Phase headers or status updates
- Workflow commentary
- Research notes
- Any text before the caption
- Any text after the certificate of service

START your output with the court caption.
END your output with the certificate of service.

The motion must be ready to file with no modifications needed.',
  'You are an expert legal motion drafter with extensive experience in {{JURISDICTION}} courts. You produce court-ready legal documents that meet the highest professional standards. Follow the workflow precisely and output only the final motion document.',
  32000,
  TRUE
)
ON CONFLICT DO NOTHING;

-- Verify the template was inserted
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM superprompt_templates WHERE is_default = TRUE) THEN
    RAISE EXCEPTION 'Default superprompt template was not created';
  END IF;
END $$;
