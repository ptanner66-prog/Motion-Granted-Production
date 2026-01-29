// /components/admin/conflict-queue-page.tsx
// Admin page wrapper for conflict queue
// Task 39 — P1
// VERSION: 1.0 — January 28, 2026

'use client';

import React, { useState } from 'react';
import { ConflictQueue } from './conflict-queue';

/**
 * Conflict Queue Page - Full admin page with filters and stats
 */
export function ConflictQueuePage() {
  const [showAll, setShowAll] = useState(false);
  const [resolvedCount, setResolvedCount] = useState(0);

  function handleResolve(conflictId: string, resolution: 'approved' | 'rejected') {
    setResolvedCount(prev => prev + 1);
    console.log(`[ConflictQueue] Resolved ${conflictId} as ${resolution}`);
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Conflict Check Queue</h1>
        <p className="text-gray-600 mt-1">
          Review potential conflicts between orders before processing.
        </p>
      </div>

      {/* Stats Bar */}
      {resolvedCount > 0 && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800">
            {resolvedCount} conflict{resolvedCount !== 1 ? 's' : ''} resolved this session
          </p>
        </div>
      )}

      {/* Filter Toggle */}
      <div className="mb-4 flex items-center space-x-4">
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!showAll}
            onChange={() => setShowAll(!showAll)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Show pending only</span>
        </label>
      </div>

      {/* Queue */}
      <ConflictQueue
        pendingOnly={!showAll}
        limit={100}
        onResolve={handleResolve}
      />

      {/* Help Text */}
      <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h3 className="font-medium text-gray-900 mb-2">Conflict Resolution Guide</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li><strong>Case Number Match:</strong> Same case number from different clients may indicate adverse parties.</li>
          <li><strong>Party Name Match:</strong> Similar party names could indicate same case or related matters.</li>
          <li><strong>Same Firm:</strong> Multiple orders from same law firm on same case - usually OK.</li>
          <li><strong>Attorney Match:</strong> Same attorney on both sides - potential ethics issue.</li>
        </ul>
        <p className="mt-3 text-sm text-gray-500">
          When in doubt, contact the attorneys before proceeding.
        </p>
      </div>
    </div>
  );
}

export default ConflictQueuePage;
