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

// Import handlers
import { handleProtocol5 } from './handlers/protocol-05';
import { handleProtocol7 } from './handlers/protocol-07';
import { handleProtocol11 } from './handlers/protocol-11';
import { handleProtocol15 } from './handlers/protocol-15';
import { handleProtocol16 } from './handlers/protocol-16';
import { handleProtocol20 } from '../citation/protocol-actions/plurality-handler';
import { handleProtocol21 } from '../citation/protocol-actions/dissent-handler';

/**
 * Register all implemented protocol handlers with the dispatcher.
 * Call once at startup. Idempotent — safe to call multiple times.
 */
export function registerAllHandlers(): void {
  // Tier 1: High-priority handlers (PROT-ORC-A execution order)
  registerProtocolHandler(21, handleProtocol21); // Dissent Detection
  registerProtocolHandler(20, handleProtocol20); // Plurality Opinion Detection
  registerProtocolHandler(5, handleProtocol5);   // New Citation Detection (Mini Phase IV)

  // P7 requires supabase for RPC call — wrap to match ProtocolHandler signature
  registerProtocolHandler(7, (ctx: ProtocolContext, supabase?: unknown): Promise<ProtocolResult> =>
    handleProtocol7(ctx, supabase as Parameters<typeof handleProtocol7>[1])
  );

  registerProtocolHandler(11, handleProtocol11); // API Unavailable / Service Failure
  registerProtocolHandler(15, handleProtocol15); // Pinpoint Citation Check
  registerProtocolHandler(16, handleProtocol16); // Required Fields Matrix

  // Protocol 10 is not registered as a dispatch handler — it's triggered
  // directly by Fn1/Fn2 via triggerProtocol10(), not through the per-citation
  // dispatch loop.
}
