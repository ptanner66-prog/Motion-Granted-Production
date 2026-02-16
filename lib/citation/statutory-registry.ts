// ============================================================
// lib/citation/statutory-registry.ts
// Protocol 1 — Statutory source identification patterns
// Source: D9 C-6 | SP-13 AO-6
// ============================================================

export interface StatutorySource {
  codeName: string;
  jurisdiction: string;
  pattern: RegExp;
  currencyCheckUrl?: string;
}

export const STATUTORY_PATTERNS: StatutorySource[] = [
  // Federal statutes
  { codeName: 'USC', jurisdiction: 'federal', pattern: /\d+\s+U\.S\.C\.\s*(?:section|sect\.?|sec\.?)?\s*\d+/i },
  { codeName: 'CFR', jurisdiction: 'federal', pattern: /\d+\s+C\.F\.R\.\s*(?:section|sect\.?|sec\.?)?\s*\d+/i },
  { codeName: 'FRCP', jurisdiction: 'federal', pattern: /Fed\.\s*R\.\s*Civ\.\s*P\.\s*\d+/i },
  { codeName: 'FRAP', jurisdiction: 'federal', pattern: /Fed\.\s*R\.\s*App\.\s*P\.\s*\d+/i },
  { codeName: 'FRE', jurisdiction: 'federal', pattern: /Fed\.\s*R\.\s*Evid\.\s*\d+/i },
  // California statutes
  { codeName: 'CA_CCP', jurisdiction: 'CA', pattern: /Cal\.\s*(?:Code\s*)?Civ\.\s*Proc\.\s*(?:Code\s*)?(?:section|sect\.?|sec\.?)?\s*\d+/i },
  { codeName: 'CA_CIV', jurisdiction: 'CA', pattern: /Cal\.\s*Civ\.\s*Code\s*(?:section|sect\.?|sec\.?)?\s*\d+/i },
  { codeName: 'CA_EVID', jurisdiction: 'CA', pattern: /Cal\.\s*Evid\.\s*Code\s*(?:section|sect\.?|sec\.?)?\s*\d+/i },
  // Louisiana statutes
  { codeName: 'LA_CCP', jurisdiction: 'LA', pattern: /La\.\s*(?:Code\s*)?C\.C\.P\.\s*art\.\s*\d+/i },
  { codeName: 'LA_CC', jurisdiction: 'LA', pattern: /La\.\s*C\.C\.\s*art\.\s*\d+/i },
  // Local rules
  { codeName: 'NDCAL_LR', jurisdiction: 'FED_9TH', pattern: /N\.D\.\s*Cal\.\s*(?:Civil\s*)?L\.R\.\s*\d+/i },
];

export function isStatutoryCitation(citationText: string): StatutorySource | null {
  if (!citationText) return null;
  for (const source of STATUTORY_PATTERNS) {
    try {
      if (source.pattern.test(citationText)) {
        return source;
      }
    } catch {
      // Malformed regex — skip, continue
      continue;
    }
  }
  return null;
}
