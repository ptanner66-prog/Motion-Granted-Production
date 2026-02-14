/**
 * Louisiana Article Selection by Motion Type
 *
 * Maps motion types to relevant Louisiana Code of Civil Procedure articles.
 * Phase II includes these in its output to guide Phase III research.
 *
 * SP-14 TASK-16
 */

export interface ArticleSelection {
  primary: string[];
  secondary: string[];
}

/**
 * Maps motion type codes to relevant La. C.C.P. articles.
 * Primary articles are directly on-point; secondary provide supporting context.
 */
export const LA_MOTION_ARTICLES: Record<string, ArticleSelection> = {
  'MTC': { // Motion to Compel
    primary: ['La. C.C.P. Art. 1461', 'La. C.C.P. Art. 1469', 'La. C.C.P. Art. 1471'],
    secondary: ['La. C.C.P. Art. 1424', 'La. C.C.P. Art. 1462'],
  },
  'motion_to_compel': {
    primary: ['La. C.C.P. Art. 1461', 'La. C.C.P. Art. 1469', 'La. C.C.P. Art. 1471'],
    secondary: ['La. C.C.P. Art. 1424', 'La. C.C.P. Art. 1462'],
  },
  'Motion to Compel Discovery': {
    primary: ['La. C.C.P. Art. 1461', 'La. C.C.P. Art. 1469', 'La. C.C.P. Art. 1471'],
    secondary: ['La. C.C.P. Art. 1424', 'La. C.C.P. Art. 1462'],
  },
  'MTD': { // Motion to Dismiss / Peremptory Exception
    primary: ['La. C.C.P. Art. 927', 'La. C.C.P. Art. 931'],
    secondary: ['La. C.C.P. Art. 934'],
  },
  'motion_to_dismiss': {
    primary: ['La. C.C.P. Art. 927', 'La. C.C.P. Art. 931'],
    secondary: ['La. C.C.P. Art. 934'],
  },
  'Motion to Dismiss': {
    primary: ['La. C.C.P. Art. 927', 'La. C.C.P. Art. 931'],
    secondary: ['La. C.C.P. Art. 934'],
  },
  'MSJ': { // Motion for Summary Judgment
    primary: ['La. C.C.P. Art. 966', 'La. C.C.P. Art. 967'],
    secondary: ['La. C.C.P. Art. 966(D)(1)'],
  },
  'motion_for_summary_judgment': {
    primary: ['La. C.C.P. Art. 966', 'La. C.C.P. Art. 967'],
    secondary: ['La. C.C.P. Art. 966(D)(1)'],
  },
  'Motion for Summary Judgment': {
    primary: ['La. C.C.P. Art. 966', 'La. C.C.P. Art. 967'],
    secondary: ['La. C.C.P. Art. 966(D)(1)'],
  },
  'MSA': { // Motion for Summary Judgment (alternate code)
    primary: ['La. C.C.P. Art. 966', 'La. C.C.P. Art. 967'],
    secondary: ['La. C.C.P. Art. 966(D)(1)'],
  },
  'CONT': { // Motion for Continuance
    primary: ['La. C.C.P. Art. 1601', 'La. C.C.P. Art. 1602'],
    secondary: [],
  },
  'EXT': { // Extension of Time
    primary: ['La. C.C.P. Art. 1001', 'La. C.C.P. Art. 5059'],
    secondary: ['LDCR 9.9'],
  },
  'MPI': { // Motion for Preliminary Injunction
    primary: ['La. C.C.P. Art. 3601', 'La. C.C.P. Art. 3602', 'La. C.C.P. Art. 3609'],
    secondary: ['La. C.C.P. Art. 3603', 'La. C.C. Art. 2292'],
  },
  'MSS': { // Motion to Set for Submission (default)
    primary: [],
    secondary: [],
  },
};

/**
 * Returns relevant Louisiana articles for a given motion type and state.
 * Non-LA jurisdictions return empty arrays. Unknown motion types return empty arrays.
 */
export function getArticlesForMotion(
  motionType: string,
  jurisdiction: string
): ArticleSelection {
  // Only return LA-specific articles for Louisiana jurisdictions
  const isLouisiana = jurisdiction.toUpperCase().includes('LA') ||
    jurisdiction.toLowerCase().includes('louisiana');

  if (!isLouisiana) {
    return { primary: [], secondary: [] };
  }

  return LA_MOTION_ARTICLES[motionType] || { primary: [], secondary: [] };
}
