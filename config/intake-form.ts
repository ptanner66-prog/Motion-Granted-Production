// Intake Form Configuration
// Motion types, jurisdictions, courts, and party options for the customer intake form

export const MOTION_TYPE_OPTIONS = {
  "Procedural/Administrative": [
    "Motion to Continue",
    "Motion to Extend Deadline",
    "Motion to Withdraw as Counsel",
    "Motion for Admission Pro Hac Vice",
    "Motion to Consolidate",
    "Motion to Sever",
    "Motion for Substitution of Parties",
    "Motion to Compel Discovery",
    "Motion for Protective Order",
    "Motion to Quash Subpoena"
  ],
  "Intermediate": [
    "Declinatory Exception (Louisiana)",
    "Dilatory Exception (Louisiana)",
    "Peremptory Exception — No Cause of Action (Louisiana)",
    "Peremptory Exception — No Right of Action (Louisiana)",
    "Peremptory Exception — Prescription (Louisiana)",
    "Peremptory Exception — Res Judicata (Louisiana)",
    "Motion in Limine — Single Issue",
    "Motion in Limine — Multiple/Complex",
    "Motion to Recuse",
    "Motion for Preliminary Injunction",
    "Motion for TRO"
  ],
  "Complex/Dispositive": [
    "Motion for Summary Judgment — Straightforward",
    "Motion for Summary Judgment — Complex",
    "Opposition to Motion for Summary Judgment",
    "Motion for Partial Summary Judgment",
    "Motion for JNOV",
    "Motion for New Trial",
    "Motion for Remittitur/Additur",
    "Post-Trial Brief",
    "Motion for Sanctions",
    "Other (Custom)"
  ]
} as const;

export const JURISDICTION_OPTIONS = [
  "Federal — 5th Circuit (Louisiana)",
  "Federal — 9th Circuit (California)",
  "California State Court",
  "Louisiana State Court"
] as const;

export const COURT_OPTIONS: Record<string, string[]> = {
  "Federal — 5th Circuit (Louisiana)": [
    "Eastern District of Louisiana (E.D. La.)",
    "Middle District of Louisiana (M.D. La.)",
    "Western District of Louisiana (W.D. La.)"
  ],
  "Federal — 9th Circuit (California)": [
    "Central District of California (C.D. Cal.)",
    "Northern District of California (N.D. Cal.)",
    "Southern District of California (S.D. Cal.)",
    "Eastern District of California (E.D. Cal.)"
  ],
  "California State Court": [
    "Los Angeles County Superior Court",
    "Orange County Superior Court",
    "San Diego County Superior Court",
    "San Francisco County Superior Court",
    "Alameda County Superior Court",
    "Sacramento County Superior Court",
    "Santa Clara County Superior Court",
    "Riverside County Superior Court",
    "San Bernardino County Superior Court",
    "Other California Superior Court (specify)"
  ],
  "Louisiana State Court": [
    "Orleans Parish (Civil District Court)",
    "East Baton Rouge Parish (19th JDC)",
    "Jefferson Parish (24th JDC)",
    "Caddo Parish (1st JDC)",
    "Calcasieu Parish (14th JDC)",
    "Lafayette Parish (15th JDC)",
    "St. Tammany Parish (22nd JDC)",
    "Ouachita Parish (4th JDC)",
    "Rapides Parish (9th JDC)",
    "Other Louisiana Parish (specify)"
  ]
} as const;

export const PARTY_REPRESENTED_OPTIONS = [
  "Plaintiff",
  "Defendant",
  "Cross-Complainant",
  "Cross-Defendant",
  "Petitioner",
  "Respondent",
  "Intervenor",
  "Third-Party Plaintiff",
  "Third-Party Defendant",
  "Other (specify)"
] as const;

export const ACCEPTED_FILE_TYPES = {
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "text/plain": [".txt"],
  "application/rtf": [".rtf"],
  "text/rtf": [".rtf"],
};

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB per file (large legal briefs)
export const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB total

// Helper to get all motion types as a flat array
export function getAllMotionTypes(): string[] {
  return Object.values(MOTION_TYPE_OPTIONS).flat();
}

// Helper to get motion tier from motion type name
export function getMotionTier(motionType: string): number {
  if (MOTION_TYPE_OPTIONS["Procedural/Administrative"].includes(motionType as typeof MOTION_TYPE_OPTIONS["Procedural/Administrative"][number])) {
    return 1;
  }
  if (MOTION_TYPE_OPTIONS["Intermediate"].includes(motionType as typeof MOTION_TYPE_OPTIONS["Intermediate"][number])) {
    return 2;
  }
  if (MOTION_TYPE_OPTIONS["Complex/Dispositive"].includes(motionType as typeof MOTION_TYPE_OPTIONS["Complex/Dispositive"][number])) {
    return 3;
  }
  return 0;
}

// Helper to format bytes to human readable
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
