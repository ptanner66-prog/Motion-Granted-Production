/**
 * Jurisdiction Formatting Types
 *
 * Type definitions for the 50-state jurisdiction formatting system.
 * These interfaces define the contracts between JSON config files,
 * the Rule Lookup Service, and all document generators.
 *
 * Paper sizes in DXA: Letter = 12240x15840, Legal = 12240x20160
 * DXA conversion: 1 inch = 1440 DXA
 */

export interface JurisdictionConfig {
  meta: {
    stateCode: string;
    stateName: string;
    confidence: number;
    lastUpdated: string;
    circuit: string;
  };

  paperSize: {
    widthDXA: number;
    heightDXA: number;
    name: 'letter' | 'legal';
  };

  margins: {
    topDXA: number;
    bottomDXA: number;
    leftDXA: number;
    rightDXA: number;
    firstPageTopDXA?: number;
  };

  font: {
    family: string;
    sizePoints: number;
    lineSpacing: 'double' | 'single' | '1.5' | number;
  };

  lineNumbering?: {
    enabled: boolean;
    linesPerPage: number;
    position: 'left';
    federalOverride: boolean;
  };

  caption: {
    courtNameFormat: string;
    caseNumberLabel: string;
    sectionSymbol?: boolean;
    nextCourtDateRequired?: boolean;
    sampleTemplate?: string;
  };

  jurat: {
    type: 'declaration' | 'affidavit';
    language: string;
    federalOverride?: string;
    specialTerminology?: string;
  };

  firstPage?: {
    topMarginDXA?: number;
    recordingSpace?: {
      widthInches: number;
      heightInches: number;
      position: string;
    };
    clerkStampSpace?: {
      widthInches: number;
      heightInches: number;
      position: string;
    };
  };

  footer?: {
    required: boolean;
    contentBelowLineNumber?: boolean;
    minFontSizePoints?: number;
    includePageNumber: boolean;
    includeDocumentTitle?: boolean;
    format?: string;
  };

  header?: {
    required: boolean;
    format?: string;
  };

  pageLimits?: {
    motion?: number;
    memorandum?: number;
    opposition?: number;
    reply?: number;
    msj?: number;
    msa?: number;
    demurrer?: number;
    wordCountAlternative?: number | null;
    countyOverrides?: Record<string, number>;
  };

  paragraphNumbering?: {
    required: boolean;
    style?: 'arabic' | 'roman';
  };

  eFiling?: {
    required: boolean;
    system?: string;
    format?: 'pdf' | 'docx' | 'both';
    maxFileSizeMB?: number;
  };

  specialRules?: {
    noColoredMarkings?: boolean;
    topMarginBlankSquare?: {
      widthInches: number;
      heightInches: number;
    };
    localRulesPreemption?: 'state' | 'local';
  };

  federalDistricts?: Record<string, FederalDistrictOverride>;
  countyOverrides?: Record<string, Partial<JurisdictionConfig>>;
}

export interface FederalDistrictOverride {
  name: string;
  paperSize?: JurisdictionConfig['paperSize'];
  margins?: Partial<JurisdictionConfig['margins']>;
  font?: Partial<JurisdictionConfig['font']>;
  pageLimits?: JurisdictionConfig['pageLimits'];
  localRules?: string[];
}

export interface FormattingRules {
  paperSize: { widthDXA: number; heightDXA: number; name: string };
  margins: { topDXA: number; bottomDXA: number; leftDXA: number; rightDXA: number };
  font: { family: string; sizePoints: number; lineSpacingDXA: number };
  lineNumbering: { enabled: boolean; linesPerPage: number } | null;
  caption: JurisdictionConfig['caption'];
  jurat: { type: string; language: string };
  footer: { required: boolean; format: string; fontSizePoints: number } | null;
  header: { required: boolean; format: string } | null;
  pageLimit: number | null;
  wordCountLimit: number | null;
  paragraphNumbering: boolean;
  specialRules: JurisdictionConfig['specialRules'] | null;
}

/**
 * Raw JSON shape from config files. Configs may use slightly different
 * key names which the Rule Lookup Service normalizes into JurisdictionConfig.
 */
export interface RawJurisdictionJSON {
  metadata?: {
    stateCode?: string;
    stateName?: string;
    confidence?: number;
    lastUpdated?: string;
    circuit?: string;
    sources?: string[];
  };
  jurisdiction?: {
    stateCode?: string;
    stateName?: string;
  };
  paperSize?: {
    widthDXA?: number;
    heightDXA?: number;
    widthInches?: number;
    heightInches?: number;
    name?: string;
  };
  margins?: {
    topDXA?: number;
    bottomDXA?: number;
    leftDXA?: number;
    rightDXA?: number;
    topInches?: number;
    bottomInches?: number;
    leftInches?: number;
    rightInches?: number;
    firstPageTopDXA?: number;
    firstPageTopInches?: number;
  };
  font?: {
    family?: string;
    sizePoints?: number;
    lineSpacing?: string | number;
  };
  lineNumbering?: {
    enabled?: boolean;
    linesPerPage?: number;
    position?: string;
    federalOverride?: boolean;
  };
  caption?: {
    courtNameFormat?: string;
    caseNumberLabel?: string;
    sectionSymbol?: boolean;
    nextCourtDateRequired?: boolean;
    sampleTemplate?: string;
  };
  jurat?: {
    type?: string;
    language?: string;
    federalOverride?: string;
    specialTerminology?: string;
  };
  firstPage?: {
    topMarginDXA?: number;
    recordingSpace?: {
      widthInches?: number;
      heightInches?: number;
      position?: string;
    };
    clerkStampSpace?: {
      widthInches?: number;
      heightInches?: number;
      position?: string;
    };
  };
  footer?: {
    required?: boolean;
    contentBelowLineNumber?: boolean;
    minFontSizePoints?: number;
    includePageNumber?: boolean;
    includeDocumentTitle?: boolean;
    format?: string;
  };
  header?: {
    required?: boolean;
    format?: string;
  };
  pageLimits?: Record<string, unknown>;
  paragraphNumbering?: {
    required?: boolean;
    style?: string;
  };
  eFiling?: {
    required?: boolean;
    system?: string;
    format?: string;
    maxFileSizeMB?: number;
  };
  specialRules?: Record<string, unknown>;
  federalDistricts?: Record<string, unknown>;
  federal_districts?: Record<string, unknown>;
  federal_courts?: Record<string, unknown>;
  countyOverrides?: Record<string, unknown>;
  county_overrides?: Record<string, unknown>;
}
