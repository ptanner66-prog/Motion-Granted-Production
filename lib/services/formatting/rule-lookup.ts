/**
 * Rule Lookup Service (FMT-01)
 *
 * Singleton service that loads jurisdiction formatting configs from JSON
 * and resolves the override hierarchy:
 *   Federal District > County > State Defaults
 *
 * Key rules:
 * - Federal courts ALWAYS use letter paper (even in Louisiana)
 * - Louisiana is the ONLY state using legal paper for state court
 * - Line numbering is disabled in federal courts if federalOverride is true
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('services-formatting-rule-lookup');
import {
  JurisdictionConfig,
  FederalDistrictOverride,
  FormattingRules,
  RawJurisdictionJSON,
} from './types';

const CONFIGS_DIR = join(process.cwd(), 'data', 'formatting', 'configs', 'states');

const LETTER_PAPER = { widthDXA: 12240, heightDXA: 15840, name: 'letter' as const };
const LEGAL_PAPER = { widthDXA: 12240, heightDXA: 20160, name: 'legal' as const };

const DEFAULT_MARGINS = { topDXA: 1440, bottomDXA: 1440, leftDXA: 1440, rightDXA: 1440 };
const DEFAULT_FONT = { family: 'Times New Roman', sizePoints: 12, lineSpacing: 'double' as const };

/**
 * Convert line spacing descriptor to DXA value.
 * Single = 240, 1.5 = 360, Double = 480.
 * If already a number, return as-is (assumed DXA).
 */
function lineSpacingToDXA(spacing: 'double' | 'single' | '1.5' | number): number {
  if (typeof spacing === 'number') return spacing;
  switch (spacing) {
    case 'single': return 240;
    case '1.5': return 360;
    case 'double': return 480;
    default: return 480;
  }
}

/**
 * Convert inches to DXA (1 inch = 1440 DXA).
 */
function inchesToDXA(inches: number): number {
  return Math.round(inches * 1440);
}

/**
 * Normalize confidence values. If > 1, divide by 100.
 */
function normalizeConfidence(value: number | undefined): number {
  if (value === undefined || value === null) return 0.5;
  return value > 1 ? value / 100 : value;
}

export class RuleLookupService {
  private static instance: RuleLookupService;
  private configs: Map<string, JurisdictionConfig> = new Map();
  private initialized = false;

  private constructor() {}

  static getInstance(): RuleLookupService {
    if (!RuleLookupService.instance) {
      RuleLookupService.instance = new RuleLookupService();
    }
    return RuleLookupService.instance;
  }

  /**
   * Load all JSON configs from data/formatting/configs/states/.
   * Normalizes schema variations and stores in Map keyed by lowercase state code.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const files = await readdir(CONFIGS_DIR);
      const jsonFiles = files.filter((f: string) => f.endsWith('.json'));

      const loadPromises = jsonFiles.map(async (file: string) => {
        try {
          const filePath = join(CONFIGS_DIR, file);
          const raw = await readFile(filePath, 'utf-8');
          const json: RawJurisdictionJSON = JSON.parse(raw);
          const config = this.normalizeConfig(json, file);
          if (config) {
            const key = config.meta.stateCode.toLowerCase();
            this.configs.set(key, config);
          }
        } catch (err) {
          log.error(`[RuleLookup] Failed to load config ${file}:`, err instanceof Error ? err.message : err);
        }
      });

      await Promise.all(loadPromises);
      this.initialized = true;
      log.info(`[RuleLookup] Loaded ${this.configs.size} state configs: ${Array.from(this.configs.keys()).join(', ')}`);
    } catch (err) {
      log.error('[RuleLookup] Failed to read configs directory:', err instanceof Error ? err.message : err);
      this.initialized = true;
    }
  }

  /**
   * O(1) Map lookup. Returns null if state not loaded.
   */
  getConfig(stateCode: string): JurisdictionConfig | null {
    return this.configs.get(stateCode.toLowerCase()) ?? null;
  }

  /**
   * Resolve the full formatting rules for a given jurisdiction context.
   * Override hierarchy: Federal District > County > State Defaults.
   *
   * Federal courts ALWAYS get letter paper, regardless of state defaults.
   */
  getFormattingRules(input: {
    stateCode: string;
    isFederal: boolean;
    county?: string;
    federalDistrict?: string;
  }): FormattingRules {
    const config = this.getConfig(input.stateCode);

    if (!config) {
      return this.getDefaultRules(input.stateCode, input.isFederal);
    }

    // Start with state defaults
    let paperSize = { ...config.paperSize };
    let margins = { ...config.margins };
    let font = { ...config.font };
    let caption = { ...config.caption };
    let jurat = { type: config.jurat.type, language: config.jurat.language };
    let lineNumbering = config.lineNumbering
      ? { enabled: config.lineNumbering.enabled, linesPerPage: config.lineNumbering.linesPerPage }
      : null;
    let footer = config.footer?.required
      ? {
          required: true,
          format: config.footer.format ?? 'Page {PAGE}',
          fontSizePoints: config.footer.minFontSizePoints ?? font.sizePoints,
        }
      : null;
    let header = config.header?.required
      ? { required: true, format: config.header.format ?? '' }
      : null;
    let pageLimit = config.pageLimits?.motion ?? null;
    let wordCountLimit: number | null = config.pageLimits?.wordCountAlternative ?? null;
    const paragraphNumbering = config.paragraphNumbering?.required ?? false;
    const specialRules = config.specialRules ?? null;

    // Apply county overrides if specified
    if (input.county && config.countyOverrides) {
      const countyKey = input.county.toLowerCase().replace(/\s+/g, '_');
      const countyOverride = config.countyOverrides[countyKey] as Partial<JurisdictionConfig> | undefined;
      if (countyOverride) {
        if (countyOverride.margins) {
          margins = { ...margins, ...countyOverride.margins };
        }
        if (countyOverride.caption) {
          caption = { ...caption, ...countyOverride.caption };
        }
        if (countyOverride.font) {
          font = { ...font, ...countyOverride.font };
        }
        if (countyOverride.pageLimits?.motion !== undefined) {
          pageLimit = countyOverride.pageLimits.motion;
        }
      }
    }

    // Apply federal overrides
    if (input.isFederal) {
      // Federal courts ALWAYS use letter paper
      paperSize = { ...LETTER_PAPER };

      // Use federal jurat (28 USC 1746)
      if (config.jurat.federalOverride) {
        jurat = { type: 'declaration', language: config.jurat.federalOverride };
      }

      // Disable line numbering if federal override applies
      if (lineNumbering && config.lineNumbering?.federalOverride) {
        lineNumbering = null;
      }

      // Apply federal district-specific overrides
      if (input.federalDistrict && config.federalDistricts) {
        const districtKey = input.federalDistrict.toLowerCase();
        const districtOverride = config.federalDistricts[districtKey] as FederalDistrictOverride | undefined;
        if (districtOverride) {
          if (districtOverride.margins) {
            margins = {
              topDXA: districtOverride.margins.topDXA ?? margins.topDXA,
              bottomDXA: districtOverride.margins.bottomDXA ?? margins.bottomDXA,
              leftDXA: districtOverride.margins.leftDXA ?? margins.leftDXA,
              rightDXA: districtOverride.margins.rightDXA ?? margins.rightDXA,
            };
          }
          if (districtOverride.font) {
            font = { ...font, ...districtOverride.font };
          }
          if (districtOverride.pageLimits?.motion !== undefined) {
            pageLimit = districtOverride.pageLimits.motion ?? null;
          }
          if (districtOverride.pageLimits?.wordCountAlternative !== undefined) {
            wordCountLimit = (districtOverride.pageLimits.wordCountAlternative ?? null) as number | null;
          }
        }
      }
    }

    return {
      paperSize,
      margins: {
        topDXA: margins.topDXA,
        bottomDXA: margins.bottomDXA,
        leftDXA: margins.leftDXA,
        rightDXA: margins.rightDXA,
      },
      font: {
        family: font.family,
        sizePoints: font.sizePoints,
        lineSpacingDXA: lineSpacingToDXA(font.lineSpacing),
      },
      lineNumbering,
      caption,
      jurat,
      footer,
      header,
      pageLimit,
      wordCountLimit,
      paragraphNumbering,
      specialRules,
    };
  }

  /**
   * Returns array of state codes that were successfully loaded.
   */
  getAllLoadedStates(): string[] {
    return Array.from(this.configs.keys());
  }

  /**
   * Normalize a raw JSON config into the canonical JurisdictionConfig shape.
   * Handles schema variations between different config file formats.
   */
  private normalizeConfig(raw: RawJurisdictionJSON, filename: string): JurisdictionConfig | null {
    try {
      // Extract metadata - handle "metadata" vs "jurisdiction" + "metadata" patterns
      const meta = this.normalizeMeta(raw, filename);
      if (!meta) return null;

      // Normalize paper size
      const paperSize = this.normalizePaperSize(raw.paperSize);

      // Normalize margins (handle DXA vs inches)
      const margins = this.normalizeMargins(raw.margins);

      // Normalize font
      const font = this.normalizeFont(raw.font);

      // Normalize line numbering
      const lineNumbering = raw.lineNumbering?.enabled
        ? {
            enabled: true,
            linesPerPage: raw.lineNumbering.linesPerPage ?? 28,
            position: 'left' as const,
            federalOverride: raw.lineNumbering.federalOverride ?? false,
          }
        : raw.lineNumbering
          ? {
              enabled: false,
              linesPerPage: raw.lineNumbering.linesPerPage ?? 28,
              position: 'left' as const,
              federalOverride: raw.lineNumbering.federalOverride ?? false,
            }
          : undefined;

      // Normalize caption
      const caption: JurisdictionConfig['caption'] = {
        courtNameFormat: raw.caption?.courtNameFormat ?? '',
        caseNumberLabel: raw.caption?.caseNumberLabel ?? 'Case No.',
        sectionSymbol: raw.caption?.sectionSymbol,
        nextCourtDateRequired: raw.caption?.nextCourtDateRequired,
        sampleTemplate: raw.caption?.sampleTemplate,
      };

      // Normalize jurat
      const jurat: JurisdictionConfig['jurat'] = {
        type: (raw.jurat?.type as 'declaration' | 'affidavit') ?? 'declaration',
        language: raw.jurat?.language ?? '',
        federalOverride: raw.jurat?.federalOverride,
        specialTerminology: raw.jurat?.specialTerminology,
      };

      // Normalize federal districts - handle variant key names
      const rawFederalDistricts = raw.federalDistricts ?? raw.federal_districts ?? raw.federal_courts;
      const federalDistricts = rawFederalDistricts
        ? this.normalizeFederalDistricts(rawFederalDistricts as Record<string, unknown>)
        : undefined;

      // Normalize county overrides - handle variant key names
      const rawCountyOverrides = raw.countyOverrides ?? raw.county_overrides;

      return {
        meta,
        paperSize,
        margins,
        font,
        lineNumbering,
        caption,
        jurat,
        firstPage: raw.firstPage as JurisdictionConfig['firstPage'],
        footer: raw.footer as JurisdictionConfig['footer'],
        header: raw.header as JurisdictionConfig['header'],
        pageLimits: raw.pageLimits as JurisdictionConfig['pageLimits'],
        paragraphNumbering: raw.paragraphNumbering as JurisdictionConfig['paragraphNumbering'],
        eFiling: raw.eFiling as JurisdictionConfig['eFiling'],
        specialRules: raw.specialRules as JurisdictionConfig['specialRules'],
        federalDistricts,
        countyOverrides: rawCountyOverrides as JurisdictionConfig['countyOverrides'],
      };
    } catch (err) {
      log.error(`[RuleLookup] Error normalizing config ${filename}:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  private normalizeMeta(raw: RawJurisdictionJSON, filename: string): JurisdictionConfig['meta'] | null {
    const md = raw.metadata;
    const jur = raw.jurisdiction;

    const stateCode = md?.stateCode ?? jur?.stateCode;
    if (!stateCode) {
      log.error(`[RuleLookup] No stateCode found in ${filename}`);
      return null;
    }

    return {
      stateCode: stateCode.toUpperCase(),
      stateName: md?.stateName ?? jur?.stateName ?? stateCode,
      confidence: normalizeConfidence(md?.confidence),
      lastUpdated: md?.lastUpdated ?? new Date().toISOString().split('T')[0],
      circuit: md?.circuit ?? '',
    };
  }

  private normalizePaperSize(raw: RawJurisdictionJSON['paperSize']): JurisdictionConfig['paperSize'] {
    if (!raw) return { ...LETTER_PAPER };

    let widthDXA = raw.widthDXA;
    let heightDXA = raw.heightDXA;

    // Calculate from inches if DXA not provided
    if (widthDXA === undefined && raw.widthInches !== undefined) {
      widthDXA = inchesToDXA(raw.widthInches);
    }
    if (heightDXA === undefined && raw.heightInches !== undefined) {
      heightDXA = inchesToDXA(raw.heightInches);
    }

    widthDXA = widthDXA ?? LETTER_PAPER.widthDXA;
    heightDXA = heightDXA ?? LETTER_PAPER.heightDXA;

    const name = heightDXA > 16000 ? 'legal' : 'letter';
    return { widthDXA, heightDXA, name };
  }

  private normalizeMargins(raw: RawJurisdictionJSON['margins']): JurisdictionConfig['margins'] {
    if (!raw) return { ...DEFAULT_MARGINS };

    const topDXA = raw.topDXA ?? (raw.topInches !== undefined ? inchesToDXA(raw.topInches) : DEFAULT_MARGINS.topDXA);
    const bottomDXA = raw.bottomDXA ?? (raw.bottomInches !== undefined ? inchesToDXA(raw.bottomInches) : DEFAULT_MARGINS.bottomDXA);
    const leftDXA = raw.leftDXA ?? (raw.leftInches !== undefined ? inchesToDXA(raw.leftInches) : DEFAULT_MARGINS.leftDXA);
    const rightDXA = raw.rightDXA ?? (raw.rightInches !== undefined ? inchesToDXA(raw.rightInches) : DEFAULT_MARGINS.rightDXA);
    const firstPageTopDXA = raw.firstPageTopDXA ?? (raw.firstPageTopInches !== undefined ? inchesToDXA(raw.firstPageTopInches) : undefined);

    return { topDXA, bottomDXA, leftDXA, rightDXA, firstPageTopDXA };
  }

  private normalizeFont(raw: RawJurisdictionJSON['font']): JurisdictionConfig['font'] {
    if (!raw) return { ...DEFAULT_FONT };

    return {
      family: raw.family ?? DEFAULT_FONT.family,
      sizePoints: raw.sizePoints ?? DEFAULT_FONT.sizePoints,
      lineSpacing: (raw.lineSpacing as JurisdictionConfig['font']['lineSpacing']) ?? DEFAULT_FONT.lineSpacing,
    };
  }

  private normalizeFederalDistricts(raw: Record<string, unknown>): Record<string, FederalDistrictOverride> {
    const result: Record<string, FederalDistrictOverride> = {};

    for (const [key, value] of Object.entries(raw)) {
      if (typeof value !== 'object' || value === null) continue;
      const district = value as Record<string, unknown>;

      result[key.toLowerCase()] = {
        name: (district.name as string) ?? key,
        paperSize: district.paperSize as FederalDistrictOverride['paperSize'],
        margins: district.margins as FederalDistrictOverride['margins'],
        font: district.font as FederalDistrictOverride['font'],
        pageLimits: district.pageLimits as FederalDistrictOverride['pageLimits'],
        localRules: district.localRules as string[],
      };
    }

    return result;
  }

  /**
   * Build default formatting rules when no config is loaded for a state.
   */
  private getDefaultRules(stateCode: string, isFederal: boolean): FormattingRules {
    log.warn(`[RuleLookup] No config loaded for ${stateCode}, using defaults`);
    return {
      paperSize: { ...LETTER_PAPER },
      margins: { ...DEFAULT_MARGINS },
      font: { family: 'Times New Roman', sizePoints: 12, lineSpacingDXA: 480 },
      lineNumbering: null,
      caption: { courtNameFormat: '', caseNumberLabel: 'Case No.' },
      jurat: {
        type: 'declaration',
        language: isFederal
          ? 'I declare under penalty of perjury that the foregoing is true and correct. Executed on {DATE}.'
          : `I declare under penalty of perjury under the laws of the State of ${stateCode.toUpperCase()} that the foregoing is true and correct. Executed on {DATE}.`,
      },
      footer: null,
      header: null,
      pageLimit: isFederal ? 25 : null,
      wordCountLimit: null,
      paragraphNumbering: false,
      specialRules: null,
    };
  }
}
