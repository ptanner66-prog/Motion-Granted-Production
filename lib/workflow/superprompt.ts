/**
 * @deprecated Superseded by lib/workflow/superprompt-engine.ts.
 * Re-exported from lib/workflow/index.ts but no external consumers remain.
 *
 * SUPERPROMPT: Production-Grade Legal Motion Generation
 *
 * This is the core AI instruction system that produces court-ready motions.
 * Each motion type has a carefully crafted prompt that:
 * - Explains the legal standard precisely
 * - Provides the exact structure required
 * - Includes citation requirements with real precedent
 * - Specifies formatting for court filing
 * - Includes quality verification checklist
 *
 * Designed for hands-off production use by lawyers.
 */

import { askClaude, MOTION_MODEL } from '@/lib/automation/claude';
import type { OperationResult } from '@/types/automation';

// ============================================================================
// TYPES
// ============================================================================

export interface CaseContext {
  // Case identifiers
  caseNumber: string;
  caseCaption: string;
  court: string;
  jurisdiction: string; // Federal, state name, etc.
  division?: string;

  // Parties
  plaintiffs: Array<{ name: string; type?: 'individual' | 'corporation' | 'government' }>;
  defendants: Array<{ name: string; type?: 'individual' | 'corporation' | 'government' }>;
  movingParty: 'plaintiff' | 'defendant';

  // Case substance from client
  statementOfFacts: string;
  proceduralHistory: string;
  clientInstructions: string;

  // Extracted from uploaded documents
  documentSummaries: Array<{
    type: string;
    summary: string;
    keyFacts: string[];
    legalIssues: string[];
  }>;

  // Full document text for deep analysis
  fullDocumentText: string;

  // Deadline
  filingDeadline?: string;
}

export interface MotionRequest {
  motionType: MotionType;
  caseContext: CaseContext;
  specificArguments?: string[]; // Optional specific arguments to include
  opposingMotion?: string; // For opposition briefs, the motion being opposed
}

export interface GeneratedMotion {
  fullText: string;
  sections: {
    caption: string;
    introduction: string;
    statementOfFacts: string;
    proceduralHistory?: string;
    legalStandard: string;
    argument: string;
    conclusion: string;
    signatureBlock: string;
    certificateOfService: string;
  };
  citations: Array<{
    citation: string;
    proposition: string;
    location: string; // Where used in the motion
  }>;
  wordCount: number;
  estimatedPages: number;
  qualityChecklist: {
    hasCaption: boolean;
    hasIntroduction: boolean;
    hasFactsSection: boolean;
    hasLegalStandard: boolean;
    hasArgumentSection: boolean;
    hasConclusion: boolean;
    hasSignatureBlock: boolean;
    hasCertificateOfService: boolean;
    meetsCitationMinimum: boolean;
    meetsWordCount: boolean;
    noPlaceholders: boolean;
  };
}

export type MotionType =
  | 'MTD_12B6' // Motion to Dismiss (Failure to State a Claim)
  | 'MTD_12B1' // Motion to Dismiss (Lack of Jurisdiction)
  | 'MTD_12B2' // Motion to Dismiss (Lack of Personal Jurisdiction)
  | 'MTD_12B3' // Motion to Dismiss (Improper Venue)
  | 'MSJ' // Motion for Summary Judgment
  | 'PMSJ' // Partial Motion for Summary Judgment
  | 'MCOMPEL' // Motion to Compel Discovery
  | 'MTC' // Motion to Continue
  | 'MEXT' // Motion for Extension of Time
  | 'MSTRIKE' // Motion to Strike
  | 'MIL' // Motion in Limine
  | 'MTR' // Motion to Reconsider
  | 'MSEAL' // Motion to Seal
  | 'MREMAND' // Motion to Remand
  | 'MPRO_HAC' // Motion for Pro Hac Vice
  | 'OPP_MTD' // Opposition to Motion to Dismiss
  | 'OPP_MSJ' // Opposition to Motion for Summary Judgment
  | 'REPLY_MTD' // Reply in Support of Motion to Dismiss
  | 'REPLY_MSJ'; // Reply in Support of Summary Judgment

// ============================================================================
// CORE LEGAL STANDARDS BY MOTION TYPE
// ============================================================================

const LEGAL_STANDARDS: Record<MotionType, string> = {
  MTD_12B6: `
LEGAL STANDARD: MOTION TO DISMISS UNDER FRCP 12(b)(6)

To survive a motion to dismiss under Rule 12(b)(6), a complaint must contain "enough facts to state a claim to relief that is plausible on its face." Bell Atl. Corp. v. Twombly, 550 U.S. 544, 570 (2007). A claim has facial plausibility when the plaintiff pleads factual content that allows the court to draw the reasonable inference that the defendant is liable for the misconduct alleged. Ashcroft v. Iqbal, 556 U.S. 662, 678 (2009).

The court must:
1. Accept all well-pleaded factual allegations as true
2. Draw all reasonable inferences in plaintiff's favor
3. Disregard conclusory statements and legal conclusions
4. Determine whether the remaining facts state a plausible claim

A complaint that pleads facts that are "merely consistent with" defendant's liability "stops short of the line between possibility and plausibility." Twombly, 550 U.S. at 557.

REQUIRED CITATIONS:
- Ashcroft v. Iqbal, 556 U.S. 662 (2009)
- Bell Atl. Corp. v. Twombly, 550 U.S. 544 (2007)
- Additional circuit-specific authority
`,

  MTD_12B1: `
LEGAL STANDARD: MOTION TO DISMISS FOR LACK OF SUBJECT MATTER JURISDICTION

Under FRCP 12(b)(1), a court must dismiss an action if it lacks subject matter jurisdiction. The plaintiff bears the burden of establishing that jurisdiction exists. Kokkonen v. Guardian Life Ins. Co., 511 U.S. 375, 377 (1994).

Federal courts are courts of limited jurisdiction. They possess only that power authorized by Constitution and statute. Subject matter jurisdiction cannot be waived or consented to by the parties.

Types of challenges:
1. Facial attack: Court accepts allegations as true, examines whether complaint sufficiently alleges jurisdiction
2. Factual attack: Court may consider evidence outside the pleadings

REQUIRED CITATIONS:
- Kokkonen v. Guardian Life Ins. Co., 511 U.S. 375 (1994)
- Steel Co. v. Citizens for a Better Environment, 523 U.S. 83 (1998)
`,

  MTD_12B2: `
LEGAL STANDARD: MOTION TO DISMISS FOR LACK OF PERSONAL JURISDICTION

Under FRCP 12(b)(2), a court must dismiss if it lacks personal jurisdiction over the defendant. The plaintiff bears the burden of establishing jurisdiction. Burger King Corp. v. Rudzewicz, 471 U.S. 462 (1985).

Due process requires:
1. Defendant has "minimum contacts" with the forum state
2. Exercise of jurisdiction comports with "fair play and substantial justice"

Types of personal jurisdiction:
- General jurisdiction: Defendant's contacts are so continuous and systematic as to render it "essentially at home" in the forum. Goodyear Dunlop Tires Operations, S.A. v. Brown, 564 U.S. 915 (2011).
- Specific jurisdiction: Requires (1) purposeful availment, (2) claim arises from forum contacts, (3) exercise is reasonable.

REQUIRED CITATIONS:
- Int'l Shoe Co. v. Washington, 326 U.S. 310 (1945)
- Burger King Corp. v. Rudzewicz, 471 U.S. 462 (1985)
- Goodyear Dunlop Tires v. Brown, 564 U.S. 915 (2011)
- Bristol-Myers Squibb Co. v. Superior Court, 582 U.S. 255 (2017)
`,

  MTD_12B3: `
LEGAL STANDARD: MOTION TO DISMISS FOR IMPROPER VENUE

Under FRCP 12(b)(3), a defendant may move to dismiss for improper venue. Venue is proper under 28 U.S.C. § 1391(b) in:
1. A district where any defendant resides, if all defendants reside in the same state
2. A district where a substantial part of the events or omissions giving rise to the claim occurred
3. If neither applies, any district where any defendant is subject to personal jurisdiction

The plaintiff bears the burden of showing venue is proper. When venue is improper, the court must dismiss or, in the interest of justice, transfer to a proper venue under 28 U.S.C. § 1406(a).

REQUIRED CITATIONS:
- 28 U.S.C. § 1391(b)
- 28 U.S.C. § 1406(a)
- Atlantic Marine Const. Co. v. U.S. Dist. Court, 571 U.S. 49 (2013)
`,

  MSJ: `
LEGAL STANDARD: MOTION FOR SUMMARY JUDGMENT

Summary judgment is appropriate when "the movant shows that there is no genuine dispute as to any material fact and the movant is entitled to judgment as a matter of law." FRCP 56(a).

The moving party bears the initial burden of demonstrating the absence of a genuine dispute of material fact. Celotex Corp. v. Catrett, 477 U.S. 317, 323 (1986).

A fact is "material" if it might affect the outcome of the suit under the governing law. Anderson v. Liberty Lobby, Inc., 477 U.S. 242, 248 (1986).

A dispute is "genuine" if the evidence is such that a reasonable jury could return a verdict for the nonmoving party. Id.

The court must:
1. View evidence in light most favorable to nonmoving party
2. Draw all reasonable inferences in nonmoving party's favor
3. Not weigh evidence or assess credibility
4. Determine only whether there is a genuine issue for trial

If the movant meets its burden, the burden shifts to the nonmoving party to present evidence showing a genuine dispute exists. The nonmoving party "may not rest upon mere allegations" but must set forth specific facts. Matsushita Elec. Indus. Co. v. Zenith Radio Corp., 475 U.S. 574, 586 (1986).

REQUIRED CITATIONS:
- Celotex Corp. v. Catrett, 477 U.S. 317 (1986)
- Anderson v. Liberty Lobby, Inc., 477 U.S. 242 (1986)
- Matsushita Elec. Indus. Co. v. Zenith Radio Corp., 475 U.S. 574 (1986)
- Scott v. Harris, 550 U.S. 372 (2007)
`,

  PMSJ: `
LEGAL STANDARD: PARTIAL MOTION FOR SUMMARY JUDGMENT

Under FRCP 56(a), a party may move for summary judgment on part of a claim or defense. The standard is the same as for full summary judgment: the movant must show no genuine dispute of material fact and entitlement to judgment as a matter of law on the specific claim, defense, or issue.

Partial summary judgment may address:
- One of multiple claims
- One of multiple defenses
- Specific elements of a claim
- Liability only (leaving damages for trial)
- Specific issues of fact or law

REQUIRED CITATIONS:
- Same as Motion for Summary Judgment
- FRCP 56(a), (g)
`,

  MCOMPEL: `
LEGAL STANDARD: MOTION TO COMPEL DISCOVERY

Under FRCP 37(a), a party may move for an order compelling disclosure or discovery if another party fails to make required disclosures or respond to discovery requests.

Scope of Discovery (FRCP 26(b)(1)):
Parties may obtain discovery regarding any nonprivileged matter that is relevant to any party's claim or defense and proportional to the needs of the case, considering:
1. Importance of issues at stake
2. Amount in controversy
3. Parties' relative access to information
4. Parties' resources
5. Importance of discovery in resolving issues
6. Whether burden outweighs likely benefit

MEET AND CONFER REQUIREMENT:
The motion must include a certification that the movant has in good faith conferred or attempted to confer with the party failing to respond. FRCP 37(a)(1).

SANCTIONS:
If the motion is granted, the court must require the party whose conduct necessitated the motion to pay the movant's reasonable expenses including attorney's fees, unless the conduct was substantially justified or other circumstances make an award unjust. FRCP 37(a)(5)(A).

REQUIRED CITATIONS:
- FRCP 26(b)(1) (scope of discovery)
- FRCP 37(a) (motion to compel)
- FRCP 37(a)(5) (expenses and sanctions)
`,

  MTC: `
LEGAL STANDARD: MOTION TO CONTINUE

A motion to continue requests postponement of a scheduled court date. Courts have broad discretion in managing their dockets and granting or denying continuances. Morris v. Slappy, 461 U.S. 1, 11-12 (1983).

Factors courts consider:
1. Good cause for the request
2. Length of the delay requested
3. Impact on the opposing party
4. Impact on witnesses
5. Whether the movant has previously sought continuances
6. Whether the continuance will serve the interests of justice
7. Whether the delay would prejudice the opposing party

Courts disfavor repeated requests for continuances and require increasingly strong showings of good cause.
`,

  MEXT: `
LEGAL STANDARD: MOTION FOR EXTENSION OF TIME

Under FRCP 6(b)(1), the court may extend time for good cause:
- Before the original time expires: extension for good cause
- After the time has expired: extension only if the party failed to act because of excusable neglect

"Excusable neglect" is an equitable determination considering:
1. Danger of prejudice to the opposing party
2. Length of delay and impact on judicial proceedings
3. Reason for the delay, including whether it was within the movant's control
4. Whether the movant acted in good faith

Pioneer Inv. Servs. Co. v. Brunswick Assocs. Ltd. P'ship, 507 U.S. 380 (1993).
`,

  MSTRIKE: `
LEGAL STANDARD: MOTION TO STRIKE

Under FRCP 12(f), the court may strike from a pleading an insufficient defense or any redundant, immaterial, impertinent, or scandalous matter.

Definitions:
- Redundant: Allegations that are needlessly repetitive
- Immaterial: Matter that has no essential or important relationship to the claim
- Impertinent: Statements that do not pertain to the issues in question
- Scandalous: Allegations that improperly cast a cruelly derogatory light on a party

Motions to strike are generally disfavored and should not be granted unless the matter has no possible bearing on the litigation. Courts deny motions to strike unless the allegations are clearly immaterial and would prejudice the movant.
`,

  MIL: `
LEGAL STANDARD: MOTION IN LIMINE

A motion in limine is a pretrial motion asking the court to rule on the admissibility of evidence before trial. The purpose is to prevent the jury from hearing prejudicial or inadmissible evidence.

Federal Rules of Evidence standards apply:
- FRE 401-403: Relevance and exclusion of relevant evidence
- FRE 404-405: Character evidence
- FRE 701-702: Lay and expert witness testimony
- FRE 801-807: Hearsay

Courts have broad discretion in ruling on motions in limine. A ruling in limine is subject to change as the case unfolds.

Luce v. United States, 469 U.S. 38 (1984): To preserve error for appeal, a party must actually offer the excluded evidence at trial.
`,

  MTR: `
LEGAL STANDARD: MOTION TO RECONSIDER

Under FRCP 59(e) (motion to alter or amend judgment) or FRCP 60(b) (relief from judgment), a party may seek reconsideration of a court's ruling.

Grounds for reconsideration:
1. Correct manifest errors of law or fact
2. Present newly discovered evidence
3. Account for an intervening change in controlling law
4. Prevent manifest injustice

Reconsideration is an extraordinary remedy that should be used sparingly. A motion to reconsider is NOT an opportunity to:
- Relitigate old matters
- Raise arguments that could have been raised before
- Present evidence that was previously available
`,

  MSEAL: `
LEGAL STANDARD: MOTION TO SEAL

Courts recognize a common law right of public access to judicial records. Nixon v. Warner Commc'ns, Inc., 435 U.S. 589 (1978).

To overcome this presumption, the party seeking to seal must show:
1. A compelling reason to seal (e.g., trade secrets, privacy, ongoing investigation)
2. The sealing is narrowly tailored
3. No less restrictive means are available

Local rules often impose additional requirements for sealing motions.
`,

  MREMAND: `
LEGAL STANDARD: MOTION TO REMAND

Under 28 U.S.C. § 1447(c), if at any time before final judgment it appears that the district court lacks subject matter jurisdiction, the case shall be remanded.

Removal based on federal question: 28 U.S.C. § 1331
Removal based on diversity: 28 U.S.C. § 1332 (complete diversity, amount in controversy exceeds $75,000)

The removing party bears the burden of establishing federal jurisdiction. Removal statutes are strictly construed, with all doubts resolved in favor of remand.

Timing: A motion to remand on grounds other than lack of subject matter jurisdiction must be made within 30 days after filing of the notice of removal. § 1447(c).
`,

  MPRO_HAC: `
LEGAL STANDARD: MOTION FOR PRO HAC VICE ADMISSION

Pro hac vice admission allows an attorney not admitted in the jurisdiction to appear for a specific case. Requirements vary by jurisdiction but typically include:

1. Good standing in home jurisdiction
2. Association with local counsel
3. Payment of required fees
4. Disclosure of prior pro hac vice admissions
5. Certification of familiarity with local rules

Local court rules govern the specific requirements.
`,

  OPP_MTD: `
LEGAL STANDARD: OPPOSITION TO MOTION TO DISMISS

The opposition must demonstrate that the complaint states a plausible claim for relief under the Twombly/Iqbal standard.

Strategy:
1. Highlight all well-pleaded factual allegations
2. Show how these facts, accepted as true, state each element of the claim
3. Draw all reasonable inferences in plaintiff's favor
4. Distinguish defendant's cited cases
5. If applicable, request leave to amend under FRCP 15(a)

Focus on the complaint's factual allegations, not legal conclusions. The opposition should systematically address each claim defendant seeks to dismiss.
`,

  OPP_MSJ: `
LEGAL STANDARD: OPPOSITION TO MOTION FOR SUMMARY JUDGMENT

The nonmoving party must show that a genuine dispute of material fact exists, making summary judgment inappropriate.

Strategy:
1. Controvert each material fact with specific evidence
2. Present additional facts that create disputes
3. Show that reasonable inferences favor the nonmoving party
4. Demonstrate that credibility determinations are required
5. Highlight evidence that defendant ignores or misconstrues

Evidence must be admissible. Declarations must be based on personal knowledge. Hearsay must fall within an exception.

FRCP 56(d): If the nonmoving party cannot present facts essential to its opposition, it may request additional discovery before the court rules.
`,

  REPLY_MTD: `
LEGAL STANDARD: REPLY IN SUPPORT OF MOTION TO DISMISS

The reply should:
1. Address arguments raised in the opposition
2. Rebut attempts to distinguish cited cases
3. Show why plaintiff's "additional facts" do not cure pleading deficiencies
4. Emphasize that conclusory allegations remain insufficient
5. Address any request for leave to amend (argue futility if applicable)

Do not raise new arguments not presented in the opening motion.
`,

  REPLY_MSJ: `
LEGAL STANDARD: REPLY IN SUPPORT OF SUMMARY JUDGMENT

The reply should:
1. Show that plaintiff's "disputed facts" are not material
2. Demonstrate that plaintiff's evidence is insufficient
3. Address evidentiary objections
4. Rebut any FRCP 56(d) request for additional discovery
5. Confirm entitlement to judgment as a matter of law

Focus on demonstrating that no reasonable jury could find for the nonmoving party.
`,
};

// ============================================================================
// MOTION STRUCTURE TEMPLATES
// ============================================================================

const MOTION_STRUCTURES: Record<MotionType, string> = {
  MTD_12B6: `
MOTION STRUCTURE:

I. INTRODUCTION (1-2 paragraphs)
   - State the motion and relief sought
   - Identify which claims should be dismissed
   - Preview the main deficiency

II. STATEMENT OF FACTS (as alleged in complaint)
   - Summarize relevant allegations
   - Note what is NOT alleged

III. LEGAL STANDARD
   - Twombly/Iqbal plausibility standard
   - What plaintiff must plead to state a claim

IV. ARGUMENT
   A. [First Claim] Fails to State a Claim
      1. Elements of the claim
      2. What allegations are missing
      3. Why existing allegations are insufficient
   B. [Second Claim] Fails to State a Claim
      [Same structure]
   [Continue for each claim]

V. CONCLUSION
   - Request dismissal with prejudice (if futility) or without prejudice
   - Alternative: Request more definite statement
`,

  MSJ: `
MOTION STRUCTURE:

I. INTRODUCTION (1-2 paragraphs)
   - State the motion and standard
   - Preview why no genuine dispute exists

II. STATEMENT OF UNDISPUTED MATERIAL FACTS
   - Numbered paragraphs
   - Each fact with citation to evidence
   - Focus on facts material to each element

III. LEGAL STANDARD
   - FRCP 56(a) standard
   - Celotex/Anderson/Matsushita trilogy

IV. ARGUMENT
   A. [Element 1] Is Established Without Genuine Dispute
      1. Legal requirement
      2. Undisputed facts satisfying element
      3. Why any contrary evidence fails
   B. [Element 2] Is Established...
   [Continue for each element]

V. CONCLUSION
   - Request judgment as a matter of law
   - Specify exact relief sought
`,

  MCOMPEL: `
MOTION STRUCTURE:

I. INTRODUCTION
   - Discovery at issue
   - Why motion is necessary

II. MEET AND CONFER STATEMENT
   - Dates and nature of communications
   - Good faith efforts to resolve

III. DISCOVERY REQUESTS AT ISSUE
   - Quote each request
   - Quote objection/response received

IV. ARGUMENT
   A. Request [X] Seeks Relevant Information
      1. Relevance to claims/defenses
      2. Proportionality factors
   B. Objection [Y] Is Improper
      1. Why objection fails
      2. Response to privilege claims

V. CONCLUSION
   - Order compelling responses
   - Request for expenses/sanctions
`,

  MTC: `
MOTION STRUCTURE:

I. INTRODUCTION
   - Current deadline/hearing date
   - Requested new date/timeframe

II. BACKGROUND
   - Procedural posture
   - Reason continuance is needed

III. ARGUMENT
   A. Good Cause Exists
   B. No Prejudice to Opposing Party
   C. Interests of Justice Favor Continuance

IV. CONCLUSION
   - Specific relief requested
`,

  MEXT: `[Similar concise structure]`,
  MSTRIKE: `[Similar structure]`,
  MIL: `[Similar structure]`,
  MTR: `[Similar structure]`,
  MSEAL: `[Similar structure]`,
  MREMAND: `[Similar structure]`,
  MPRO_HAC: `[Similar structure]`,
  MTD_12B1: `[Similar to MTD_12B6 structure]`,
  MTD_12B2: `[Similar to MTD_12B6 structure]`,
  MTD_12B3: `[Similar to MTD_12B6 structure]`,
  PMSJ: `[Similar to MSJ structure]`,
  OPP_MTD: `[Opposition structure]`,
  OPP_MSJ: `[Opposition structure]`,
  REPLY_MTD: `[Reply structure]`,
  REPLY_MSJ: `[Reply structure]`,
};

// ============================================================================
// THE SUPERPROMPT GENERATOR
// ============================================================================

/**
 * Generate the complete superprompt for producing a motion
 */
export function generateSuperprompt(request: MotionRequest): string {
  const { motionType, caseContext } = request;
  const legalStandard = LEGAL_STANDARDS[motionType];
  const structure = MOTION_STRUCTURES[motionType];

  // Build party lists
  const plaintiffList = caseContext.plaintiffs.map(p => p.name).join(', ');
  const defendantList = caseContext.defendants.map(p => p.name).join(', ');

  // Build document analysis section
  const documentAnalysis = caseContext.documentSummaries.length > 0
    ? caseContext.documentSummaries.map(doc => `
### ${doc.type.toUpperCase()}
Summary: ${doc.summary}
Key Facts:
${doc.keyFacts.map(f => `- ${f}`).join('\n')}
Legal Issues:
${doc.legalIssues.map(i => `- ${i}`).join('\n')}
`).join('\n')
    : 'No documents uploaded.';

  return `
╔══════════════════════════════════════════════════════════════════════════════╗
║                    MOTION GRANTED - LEGAL MOTION GENERATOR                    ║
║                         PRODUCTION SUPERPROMPT v2.0                          ║
╚══════════════════════════════════════════════════════════════════════════════╝

You are an expert federal litigation attorney with 20+ years of experience drafting motions for federal district courts. You draft motions that are:
- Precisely argued with correct legal standards
- Properly cited with verified case law
- Formatted for immediate court filing
- Persuasive but professional in tone

YOUR TASK: Draft a complete, court-ready ${getMotionName(motionType)}

═══════════════════════════════════════════════════════════════════════════════
                               CASE INFORMATION
═══════════════════════════════════════════════════════════════════════════════

CASE CAPTION:
${caseContext.caseCaption}

CASE NUMBER: ${caseContext.caseNumber}
COURT: ${caseContext.court}
JURISDICTION: ${caseContext.jurisdiction}${caseContext.division ? ` - ${caseContext.division}` : ''}

PLAINTIFFS: ${plaintiffList}
DEFENDANTS: ${defendantList}
MOVING PARTY: ${caseContext.movingParty === 'plaintiff' ? 'Plaintiff' : 'Defendant'}

FILING DEADLINE: ${caseContext.filingDeadline || 'Not specified'}

═══════════════════════════════════════════════════════════════════════════════
                          CLIENT-PROVIDED INFORMATION
═══════════════════════════════════════════════════════════════════════════════

STATEMENT OF FACTS (from client):
${caseContext.statementOfFacts || '[None provided - extract from documents]'}

PROCEDURAL HISTORY (from client):
${caseContext.proceduralHistory || '[None provided - extract from documents]'}

CLIENT'S SPECIAL INSTRUCTIONS:
${caseContext.clientInstructions || '[None provided]'}

${request.specificArguments ? `
SPECIFIC ARGUMENTS CLIENT WANTS INCLUDED:
${request.specificArguments.map((a, i) => `${i + 1}. ${a}`).join('\n')}
` : ''}

═══════════════════════════════════════════════════════════════════════════════
                            DOCUMENT ANALYSIS
═══════════════════════════════════════════════════════════════════════════════

${documentAnalysis}

${caseContext.fullDocumentText ? `
FULL DOCUMENT TEXT FOR REFERENCE:
---
${caseContext.fullDocumentText.substring(0, 30000)}
${caseContext.fullDocumentText.length > 30000 ? '\n[Document truncated at 30,000 characters]' : ''}
---
` : ''}

═══════════════════════════════════════════════════════════════════════════════
                              LEGAL STANDARD
═══════════════════════════════════════════════════════════════════════════════

${legalStandard}

═══════════════════════════════════════════════════════════════════════════════
                            REQUIRED STRUCTURE
═══════════════════════════════════════════════════════════════════════════════

${structure}

═══════════════════════════════════════════════════════════════════════════════
                          FORMATTING REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════

1. CAPTION FORMAT:
   - Court name centered and capitalized
   - Parties in standard "v." format
   - Case number on right side
   - Document title centered below parties

2. BODY FORMAT:
   - Use Roman numerals for major sections (I., II., III.)
   - Use capital letters for subsections (A., B., C.)
   - Use numbers for sub-subsections (1., 2., 3.)
   - First-line indent for paragraphs
   - Double-spacing between lines

3. CITATIONS:
   - Bluebook format
   - Include pinpoint cites where possible
   - Use "Id." for immediate repetition
   - Use short form after first full citation

4. SIGNATURE BLOCK:
   - "Respectfully submitted,"
   - Signature line
   - Attorney name, bar number
   - Firm name, address, phone, email
   - "Attorney for [Plaintiff/Defendant]"

5. CERTIFICATE OF SERVICE:
   - Standard CM/ECF certification
   - Date of service

═══════════════════════════════════════════════════════════════════════════════
                           QUALITY REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════

☑ MINIMUM 6 legal citations (cases, statutes, or rules)
☑ ALL citations must be real and accurately quoted
☑ NO placeholder text like [INSERT], [TBD], [CITATION NEEDED]
☑ Minimum 1,500 words for substantive motions
☑ Maximum 25 pages (not including exhibits)
☑ Every factual assertion must be supported by the record or client materials
☑ Every legal assertion must be supported by cited authority
☑ Conclusion must specify EXACT relief requested

═══════════════════════════════════════════════════════════════════════════════
                              TONE GUIDANCE
═══════════════════════════════════════════════════════════════════════════════

- Professional and respectful to the court
- Confident but not arrogant
- Precise and concise - avoid unnecessary words
- Active voice preferred
- Avoid legalese where plain English works
- Maintain formality appropriate for federal court
- Do not disparage opposing counsel or parties personally

═══════════════════════════════════════════════════════════════════════════════
                            OUTPUT INSTRUCTIONS
═══════════════════════════════════════════════════════════════════════════════

Generate the COMPLETE motion document now, starting with the case caption.

Do not include explanatory notes or commentary - output ONLY the motion text that would be filed with the court.

BEGIN MOTION:
`;
}

// ============================================================================
// MOTION NAME HELPER
// ============================================================================

function getMotionName(type: MotionType): string {
  const names: Record<MotionType, string> = {
    MTD_12B6: 'Motion to Dismiss for Failure to State a Claim',
    MTD_12B1: 'Motion to Dismiss for Lack of Subject Matter Jurisdiction',
    MTD_12B2: 'Motion to Dismiss for Lack of Personal Jurisdiction',
    MTD_12B3: 'Motion to Dismiss for Improper Venue',
    MSJ: 'Motion for Summary Judgment',
    PMSJ: 'Partial Motion for Summary Judgment',
    MCOMPEL: 'Motion to Compel Discovery',
    MTC: 'Motion to Continue',
    MEXT: 'Motion for Extension of Time',
    MSTRIKE: 'Motion to Strike',
    MIL: 'Motion in Limine',
    MTR: 'Motion to Reconsider',
    MSEAL: 'Motion to Seal',
    MREMAND: 'Motion to Remand',
    MPRO_HAC: 'Motion for Pro Hac Vice Admission',
    OPP_MTD: 'Opposition to Motion to Dismiss',
    OPP_MSJ: 'Opposition to Motion for Summary Judgment',
    REPLY_MTD: 'Reply in Support of Motion to Dismiss',
    REPLY_MSJ: 'Reply in Support of Motion for Summary Judgment',
  };
  return names[type];
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Generate a complete motion using Claude with the superprompt
 */
export async function generateMotion(
  request: MotionRequest
): Promise<OperationResult<GeneratedMotion>> {
  const superprompt = generateSuperprompt(request);

  // Call Claude with the superprompt using Opus 4.5 for best legal reasoning
  const result = await askClaude({
    prompt: superprompt,
    maxTokens: 64000, // Opus max output tokens is 64K
    model: MOTION_MODEL, // Use Opus 4.5 for motion generation
    systemPrompt: `You are an expert federal litigation attorney with extensive experience drafting court filings. You produce precise, well-cited, professionally formatted legal documents. You NEVER use placeholder text - every citation is real and accurate. You follow Bluebook citation format.`,
  });

  if (!result.success || !result.result) {
    return { success: false, error: result.error || 'Failed to generate motion' };
  }

  const motionText = result.result.content;

  // Parse the generated motion into sections
  const sections = parseMotionSections(motionText);

  // Extract citations
  const citations = extractCitationsFromMotion(motionText);

  // Calculate metrics
  const wordCount = motionText.split(/\s+/).length;
  const estimatedPages = Math.ceil(wordCount / 300);

  // Quality checklist
  const qualityChecklist = {
    hasCaption: /UNITED STATES|SUPERIOR COURT|DISTRICT COURT/i.test(motionText),
    hasIntroduction: /INTRODUCTION|PRELIMINARY STATEMENT/i.test(motionText),
    hasFactsSection: /STATEMENT OF FACTS|FACTUAL BACKGROUND/i.test(motionText),
    hasLegalStandard: /LEGAL STANDARD|STANDARD OF REVIEW/i.test(motionText),
    hasArgumentSection: /ARGUMENT/i.test(motionText),
    hasConclusion: /CONCLUSION|WHEREFORE/i.test(motionText),
    hasSignatureBlock: /Respectfully submitted/i.test(motionText),
    hasCertificateOfService: /CERTIFICATE OF SERVICE/i.test(motionText),
    meetsCitationMinimum: citations.length >= 6,
    meetsWordCount: wordCount >= 1500,
    noPlaceholders: !/\[INSERT|TBD|\[.*NEEDED\]|\[PLACEHOLDER\]/i.test(motionText),
  };

  return {
    success: true,
    data: {
      fullText: motionText,
      sections,
      citations,
      wordCount,
      estimatedPages,
      qualityChecklist,
    },
  };
}

/**
 * Parse motion text into sections
 */
function parseMotionSections(text: string): GeneratedMotion['sections'] {
  // Basic section parsing - can be enhanced
  const findSection = (patterns: RegExp[]): string => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1] || match[0];
    }
    return '';
  };

  return {
    caption: findSection([/^(.*?(?:v\.|vs\.).*?\n.*?Case No\..*?\n)/s]),
    introduction: findSection([/INTRODUCTION\s*([\s\S]*?)(?=\n\s*(?:II\.|STATEMENT|BACKGROUND))/i]),
    statementOfFacts: findSection([/STATEMENT OF FACTS\s*([\s\S]*?)(?=\n\s*(?:III\.|IV\.|LEGAL|ARGUMENT))/i]),
    proceduralHistory: findSection([/PROCEDURAL (?:HISTORY|BACKGROUND)\s*([\s\S]*?)(?=\n\s*(?:III\.|IV\.|LEGAL|ARGUMENT))/i]),
    legalStandard: findSection([/LEGAL STANDARD\s*([\s\S]*?)(?=\n\s*(?:IV\.|V\.|ARGUMENT))/i]),
    argument: findSection([/ARGUMENT\s*([\s\S]*?)(?=\n\s*(?:V\.|VI\.|CONCLUSION))/i]),
    conclusion: findSection([/CONCLUSION\s*([\s\S]*?)(?=\n\s*(?:Respectfully|CERTIFICATE))/i]),
    signatureBlock: findSection([/(Respectfully submitted[\s\S]*?)(?=CERTIFICATE|$)/i]),
    certificateOfService: findSection([/CERTIFICATE OF SERVICE([\s\S]*?)$/i]),
  };
}

/**
 * Extract citations from motion text
 */
function extractCitationsFromMotion(text: string): GeneratedMotion['citations'] {
  const citations: GeneratedMotion['citations'] = [];

  // Case citation pattern: Name v. Name, Volume Reporter Page (Court Year)
  const casePattern = /([A-Z][a-zA-Z''\-]+(?:\s+[A-Z][a-zA-Z''\-]+)*)\s+v\.\s+([A-Z][a-zA-Z''\-]+(?:\s+[A-Z][a-zA-Z''\-]+)*),\s*(\d+)\s+([A-Z][a-zA-Z.]+(?:\s+\d*d*)?)\s+(\d+)(?:,\s*(\d+))?\s*\(([^)]+)\)/g;

  let match;
  while ((match = casePattern.exec(text)) !== null) {
    const fullCitation = match[0];
    // Find surrounding context
    const start = Math.max(0, match.index - 100);
    const end = Math.min(text.length, match.index + fullCitation.length + 100);
    const context = text.substring(start, end);

    citations.push({
      citation: fullCitation,
      proposition: context.replace(fullCitation, '[CITATION]').trim(),
      location: `Character ${match.index}`,
    });
  }

  // Statute pattern: Title U.S.C. § Section
  const statutePattern = /\d+\s+U\.S\.C\.\s+§+\s*\d+[a-z]?(?:\([a-z0-9]+\))?/g;

  while ((match = statutePattern.exec(text)) !== null) {
    citations.push({
      citation: match[0],
      proposition: 'Statutory authority',
      location: `Character ${match.index}`,
    });
  }

  // FRCP pattern
  const frcpPattern = /(?:Fed\.\s*R\.\s*Civ\.\s*P\.|FRCP|Rule)\s+\d+(?:\([a-z]\))?/gi;

  while ((match = frcpPattern.exec(text)) !== null) {
    citations.push({
      citation: match[0],
      proposition: 'Procedural rule',
      location: `Character ${match.index}`,
    });
  }

  return citations;
}

// ============================================================================
// CONVENIENCE FUNCTION FOR DIRECT API USE
// ============================================================================

/**
 * Generate a motion directly from order data
 * This is the main entry point for the automation flow
 */
export async function generateMotionFromOrder(
  orderId: string,
  motionType: MotionType
): Promise<OperationResult<GeneratedMotion>> {
  // Import here to avoid circular dependency
  const { gatherOrderContext } = await import('./orchestrator');

  const contextResult = await gatherOrderContext(orderId);
  if (!contextResult.success || !contextResult.data) {
    return { success: false, error: contextResult.error };
  }

  const ctx = contextResult.data;

  // Build case context from order context
  const caseContext: CaseContext = {
    caseNumber: ctx.caseNumber,
    caseCaption: ctx.caseCaption,
    court: ctx.jurisdiction,
    jurisdiction: ctx.jurisdiction,
    division: ctx.courtDivision || undefined,
    plaintiffs: ctx.parties
      .filter(p => p.role === 'plaintiff')
      .map(p => ({ name: p.name })),
    defendants: ctx.parties
      .filter(p => p.role === 'defendant')
      .map(p => ({ name: p.name })),
    movingParty: 'defendant', // Default, could be parameterized
    statementOfFacts: ctx.statementOfFacts,
    proceduralHistory: ctx.proceduralHistory,
    clientInstructions: ctx.instructions,
    documentSummaries: ctx.documents.parsed.map(d => ({
      type: d.documentType,
      summary: d.summary,
      keyFacts: (d.keyFacts as Array<{ fact: string }>).map(f => f.fact),
      legalIssues: (d.legalIssues as Array<{ issue: string }>).map(i => i.issue),
    })),
    fullDocumentText: ctx.documents.raw,
    filingDeadline: ctx.filingDeadline || undefined,
  };

  return generateMotion({
    motionType,
    caseContext,
  });
}
