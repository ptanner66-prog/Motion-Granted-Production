/**
 * Formatting Engine Integration
 *
 * Glue layer between the Rule Lookup Service and individual generators.
 * Creates complete docx Documents with correct jurisdiction formatting.
 *
 * This module is the primary entry point for generating formatted legal
 * documents. It resolves jurisdiction rules, applies paper size, margins,
 * fonts, line numbering, headers, footers, and first-page special handling.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Header,
  Footer,
  PageNumber,
  AlignmentType,
  NumberFormat,
} from 'docx';
import { RuleLookupService } from '../services/formatting/rule-lookup';
import { FormattingRules } from '../services/formatting/types';

export interface DocumentOptions {
  stateCode: string;
  isFederal: boolean;
  county?: string;
  federalDistrict?: string;
  content: Paragraph[];
  includeHeader?: boolean;
  includeFooter?: boolean;
  documentTitle?: string;
}

/**
 * Create a fully formatted DOCX document with jurisdiction-specific settings.
 */
export async function createFormattedDocument(options: DocumentOptions): Promise<Buffer> {
  const ruleLookup = RuleLookupService.getInstance();
  await ruleLookup.initialize();

  const rules = ruleLookup.getFormattingRules({
    stateCode: options.stateCode,
    isFederal: options.isFederal,
    county: options.county,
    federalDistrict: options.federalDistrict,
  });

  const doc = buildDocument(rules, options);
  return await Packer.toBuffer(doc);
}

/**
 * Get resolved formatting rules without building a document.
 * Useful when you need the rules for generator inputs.
 */
export async function getResolvedRules(options: {
  stateCode: string;
  isFederal: boolean;
  county?: string;
  federalDistrict?: string;
}): Promise<FormattingRules> {
  const ruleLookup = RuleLookupService.getInstance();
  await ruleLookup.initialize();
  return ruleLookup.getFormattingRules(options);
}

function buildDocument(rules: FormattingRules, options: DocumentOptions): Document {
  const sectionProperties = buildSectionProperties(rules);

  // Build header if required
  const headers = buildHeaders(rules, options);

  // Build footer if required
  const footers = buildFooters(rules, options);

  return new Document({
    styles: {
      default: {
        document: {
          run: {
            font: rules.font.family,
            size: rules.font.sizePoints * 2,
          },
          paragraph: {
            spacing: {
              line: rules.font.lineSpacingDXA,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          ...sectionProperties,
          ...(headers ? { headers } : {}),
          ...(footers ? { footers } : {}),
        },
        children: options.content,
      },
    ],
  });
}

function buildSectionProperties(rules: FormattingRules): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    page: {
      size: {
        width: rules.paperSize.widthDXA,
        height: rules.paperSize.heightDXA,
      },
      margin: {
        top: rules.margins.topDXA,
        bottom: rules.margins.bottomDXA,
        left: rules.margins.leftDXA,
        right: rules.margins.rightDXA,
      },
    },
  };

  // Line numbering (CA requirement)
  if (rules.lineNumbering?.enabled) {
    properties.lineNumbers = {
      countBy: 1,
      restart: 'newPage' as const,
    };
  }

  return properties;
}

function buildHeaders(
  rules: FormattingRules,
  options: DocumentOptions
): { default: Header } | undefined {
  if (!rules.header?.required && !options.includeHeader) return undefined;

  const format = rules.header?.format ?? '';
  const headerText = format
    .replace(/\{DOCUMENT_TITLE\}/g, options.documentTitle ?? '')
    .replace(/\{PAGE\}/g, '');

  return {
    default: new Header({
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: headerText,
              font: rules.font.family,
              size: (rules.header?.format ? rules.font.sizePoints : 10) * 2,
            }),
            ...(format.includes('{PAGE}')
              ? [new TextRun({ children: [PageNumber.CURRENT] })]
              : []),
          ],
          alignment: AlignmentType.RIGHT,
        }),
      ],
    }),
  };
}

function buildFooters(
  rules: FormattingRules,
  options: DocumentOptions
): { default: Footer } | undefined {
  if (!rules.footer?.required && !options.includeFooter) return undefined;

  const format = rules.footer?.format ?? 'Page {PAGE}';
  const fontSizePoints = rules.footer?.fontSizePoints ?? rules.font.sizePoints;

  // Split format around {PAGE} and {TOTAL} placeholders
  const parts = format.split(/\{PAGE\}|\{TOTAL\}/);
  const hasPage = format.includes('{PAGE}');
  const hasTotal = format.includes('{TOTAL}');

  const children: (TextRun)[] = [];

  if (parts[0]) {
    const text = parts[0]
      .replace(/\{DOCUMENT_TITLE\}/g, options.documentTitle ?? '');
    children.push(
      new TextRun({
        text,
        font: rules.font.family,
        size: fontSizePoints * 2,
      })
    );
  }

  if (hasPage) {
    children.push(
      new TextRun({
        children: [PageNumber.CURRENT],
        font: rules.font.family,
        size: fontSizePoints * 2,
      })
    );
  }

  if (parts[1]) {
    children.push(
      new TextRun({
        text: parts[1],
        font: rules.font.family,
        size: fontSizePoints * 2,
      })
    );
  }

  if (hasTotal) {
    children.push(
      new TextRun({
        children: [PageNumber.TOTAL_PAGES],
        font: rules.font.family,
        size: fontSizePoints * 2,
      })
    );
  }

  if (parts[2]) {
    children.push(
      new TextRun({
        text: parts[2],
        font: rules.font.family,
        size: fontSizePoints * 2,
      })
    );
  }

  return {
    default: new Footer({
      children: [
        new Paragraph({
          children,
          alignment: AlignmentType.CENTER,
        }),
      ],
    }),
  };
}
