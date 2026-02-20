// ============================================================
// lib/protocols/register-handlers.ts
// Registers all protocol handlers with the dispatcher
// Source: SP-13 AO-10, AN-1
//
// Import this module once at application startup (e.g., in the
// Inngest workflow orchestrator) to populate the handler registry.
// ============================================================

import { registerProtocolHandler } from './dispatcher';
import type { ProtocolContext, ProtocolResult } from './types';

// Import handlers — all 21 dispatch-eligible protocols
import { handleProtocol1 } from './handlers/protocol-01';
import { handleProtocol2 } from './handlers/protocol-02';
import { handleProtocol3 } from './handlers/protocol-03';
import { handleProtocol4 } from './handlers/protocol-04';
import { handleProtocol5 } from './handlers/protocol-05';
import { handleProtocol6 } from './handlers/protocol-06';
import { handleProtocol7 } from './handlers/protocol-07';
import { handleProtocol8 } from './handlers/protocol-08';
import { handleProtocol9 } from './handlers/protocol-09';
import { handleProtocol11 } from './handlers/protocol-11';
import { handleProtocol12 } from './handlers/protocol-12';
import { handleProtocol13 } from './handlers/protocol-13';
import { handleProtocol14 } from './handlers/protocol-14';
import { handleProtocol15 } from './handlers/protocol-15';
import { handleProtocol16 } from './handlers/protocol-16';
import { handleProtocol17 } from './handlers/protocol-17';
import { handleProtocol18 } from './handlers/protocol-18';
import { handleProtocol19 } from './handlers/protocol-19';
import { handleProtocol20 } from '../citation/protocol-actions/plurality-handler';
import { handleProtocol21 } from '../citation/protocol-actions/dissent-handler';
import { handleProtocol22 } from './handlers/protocol-22';
import { handleProtocol23 } from './handlers/protocol-23';

/**
 * Register all implemented protocol handlers with the dispatcher.
 * Call once at startup. Idempotent — safe to call multiple times.
 */
export function registerAllHandlers(): void {
  // === Citation Quality Protocols ===
  registerProtocolHandler(1, handleProtocol1);   // Statutory Source Identification
  registerProtocolHandler(2, handleProtocol2);   // Court Level Verification
  registerProtocolHandler(3, handleProtocol3);   // Jurisdiction Match Check
  registerProtocolHandler(4, handleProtocol4);   // Parallel Citation Check
  registerProtocolHandler(5, handleProtocol5);   // New Citation Detection (Mini Phase IV)
  registerProtocolHandler(6, handleProtocol6);   // Subsequent History Check

  // P7 requires supabase for RPC call — wrap to match ProtocolHandler signature
  registerProtocolHandler(7, (ctx: ProtocolContext, supabase?: unknown): Promise<ProtocolResult> =>
    handleProtocol7(ctx, supabase as Parameters<typeof handleProtocol7>[1])
  );

  registerProtocolHandler(8, handleProtocol8);   // Quotation Accuracy Verification
  registerProtocolHandler(9, handleProtocol9);   // Date Verification

  // Protocol 10 is not registered as a dispatch handler — it's triggered
  // directly by Fn1/Fn2 via triggerProtocol10(), not through the per-citation
  // dispatch loop.

  registerProtocolHandler(11, handleProtocol11); // API Unavailable / Service Failure
  registerProtocolHandler(12, handleProtocol12); // Holding vs Dicta Classification
  registerProtocolHandler(13, handleProtocol13); // Authority Weight Assessment
  registerProtocolHandler(14, handleProtocol14); // Citation Format Validation
  registerProtocolHandler(15, handleProtocol15); // Pinpoint Citation Check
  registerProtocolHandler(16, handleProtocol16); // Required Fields Matrix

  // === Workflow & Quality Protocols ===
  registerProtocolHandler(17, handleProtocol17); // Cross-Citation Consistency
  registerProtocolHandler(18, handleProtocol18); // Confidence Score Calibration
  registerProtocolHandler(19, handleProtocol19); // Verification Timeout Handler

  // === Advanced Analysis Protocols ===
  registerProtocolHandler(20, handleProtocol20); // Plurality Opinion Detection
  registerProtocolHandler(21, handleProtocol21); // Dissent Detection
  registerProtocolHandler(22, handleProtocol22); // Upstream Authority Check
  registerProtocolHandler(23, handleProtocol23); // Amended Opinion Detection
}
