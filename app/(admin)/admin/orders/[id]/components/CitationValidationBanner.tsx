// app/(admin)/admin/orders/[id]/components/CitationValidationBanner.tsx
'use client';

import { CheckCircle, XCircle, AlertTriangle, Shield } from 'lucide-react';

export interface CitationValidationProps {
  isValid: boolean;
  authorized: number;
  unauthorized: number;
  warnings: string[];
  strippedCitations: string[];
}

export function CitationValidationBanner({
  isValid,
  authorized,
  unauthorized,
  warnings,
  strippedCitations,
}: CitationValidationProps) {
  // All citations authorized and valid
  if (isValid && unauthorized === 0) {
    return (
      <div className="bg-green-50 border border-green-300 rounded-lg p-4 flex items-start gap-3">
        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
        <div>
          <span className="text-green-700 font-semibold">
            All {authorized} citation{authorized !== 1 ? 's' : ''} verified
          </span>
          {warnings.length > 0 && (
            <div className="mt-2 space-y-1">
              {warnings.map((warning, idx) => (
                <p key={idx} className="text-green-600 text-sm flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {warning}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Validation failed - unauthorized citations found
  return (
    <div className="bg-red-50 border-2 border-red-400 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-red-700 font-bold text-lg flex items-center gap-2">
            <Shield className="w-5 h-5" />
            CITATION VALIDATION FAILED
          </h3>

          <div className="mt-2 flex gap-4 text-sm">
            <span className="text-green-700 font-medium">
              Authorized: {authorized}
            </span>
            <span className="text-red-700 font-medium">
              Unauthorized: {unauthorized}
            </span>
          </div>

          {warnings.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-red-800 font-medium text-sm">Warnings:</p>
              {warnings.map((warning, idx) => (
                <p key={idx} className="text-red-600 text-sm ml-4">&bull; {warning}</p>
              ))}
            </div>
          )}

          {strippedCitations.length > 0 && (
            <div className="mt-3">
              <p className="text-red-800 font-medium text-sm">Stripped Citations:</p>
              <div className="mt-1 space-y-1 ml-4">
                {strippedCitations.map((citation, idx) => (
                  <p key={idx} className="text-red-600 text-sm font-mono bg-red-100 px-2 py-1 rounded">
                    {citation}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CitationValidationMissing() {
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
      <div>
        <span className="text-amber-700 font-semibold">
          Citation validation data not available
        </span>
        <p className="text-amber-600 text-sm mt-1">
          Cannot confirm citation accuracy. Manual review required before delivery.
        </p>
      </div>
    </div>
  );
}
