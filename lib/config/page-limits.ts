// ============================================================
// lib/config/page-limits.ts
// Protocol 12 — Court-specific page limits
// Source: D9 C-7 | SP-13 AO-7
// ============================================================

import { createLogger } from '../logging/logger';

const logger = createLogger('protocol-12');

export interface PageLimit {
  court: string;
  courtCode: string;
  motionMemorandum: number;
  replyMemorandum: number;
  localRuleAuthority: string;
}

export const PAGE_LIMITS: PageLimit[] = [
  // 9th Circuit federal districts
  { court: 'N.D. Cal.', courtCode: 'NDCAL', motionMemorandum: 25, replyMemorandum: 15, localRuleAuthority: 'N.D. Cal. Civ. L.R. 7-2' },
  { court: 'C.D. Cal.', courtCode: 'CDCAL', motionMemorandum: 25, replyMemorandum: 15, localRuleAuthority: 'C.D. Cal. L.R. 11-6' },
  { court: 'S.D. Cal.', courtCode: 'SDCAL', motionMemorandum: 25, replyMemorandum: 15, localRuleAuthority: 'S.D. Cal. CivLR 7.1(h)' },
  { court: 'E.D. Cal.', courtCode: 'EDCAL', motionMemorandum: 25, replyMemorandum: 15, localRuleAuthority: 'E.D. Cal. L.R. 230(b)' },
  // CA State
  { court: 'CA Superior Court', courtCode: 'CASTATE', motionMemorandum: 15, replyMemorandum: 10, localRuleAuthority: 'CRC 3.1113(d)' },
  // 5th Circuit federal districts
  { court: 'E.D. La.', courtCode: 'EDLA', motionMemorandum: 25, replyMemorandum: 15, localRuleAuthority: 'E.D. La. L.R. 7.4' },
  { court: 'M.D. La.', courtCode: 'MDLA', motionMemorandum: 25, replyMemorandum: 15, localRuleAuthority: 'M.D. La. L.R. 7(f)' },
  { court: 'W.D. La.', courtCode: 'WDLA', motionMemorandum: 25, replyMemorandum: 15, localRuleAuthority: 'W.D. La. L.R. 10.1' },
  // LA State
  { court: 'LA State Court', courtCode: 'LASTATE', motionMemorandum: 30, replyMemorandum: 15, localRuleAuthority: 'La. D.C.R. (varies by district)' },
];

export function getPageLimit(courtCode: string): PageLimit | null {
  if (!courtCode) {
    logger.warn('protocol.p12.empty_court_code');
    return null;
  }
  const match = PAGE_LIMITS.find(pl => pl.courtCode === courtCode.toUpperCase());
  if (!match) {
    logger.warn('protocol.p12.unknown_court', { courtCode });
    return null;
  }
  return match;
}
