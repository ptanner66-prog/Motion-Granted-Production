// app/(admin)/admin/orders/[id]/components/MotionPreview.tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, FileText, AlertTriangle } from 'lucide-react';
import { CitationValidationBanner } from './CitationValidationBanner';

export interface MotionOutput {
  draftMotion?: {
    caption?: string;
    introduction?: string;
    statementOfFacts?: string;
    legalStandard?: string;
    arguments?: string[];
    conclusion?: string;
    certificateOfService?: string;
  };
  citationValidation?: {
    isValid: boolean;
    authorized: number;
    unauthorized: number;
    warnings: string[];
    strippedCitations: string[];
  };
  citationsIncluded?: number;
  citationsSaved?: {
    caseCitations: number;
    statutoryCitations: number;
    total: number;
  };
}

interface MotionPreviewProps {
  motionOutput: MotionOutput | null;
  orderId: string;
  jurisdiction: 'CA_STATE' | 'LA_STATE' | 'FED_5' | 'FED_9' | string;
  rawJson?: string;
}

/**
 * Sanitizes text content to prevent XSS.
 * Escapes HTML entities for safe rendering.
 */
function sanitizeContent(content: string | undefined): string {
  if (!content) return '';
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  return escaped;
}

/**
 * Formats caption based on jurisdiction.
 * California state uses numbered left-margin; others use centered format.
 */
function formatCaption(caption: string, jurisdiction: string) {
  const lines = caption.split('\\n').filter(Boolean);
  const isCaliforniaState = jurisdiction === 'CA_STATE';

  return (
    <div className={`motion-caption ${isCaliforniaState ? 'california-numbered' : ''}`}>
      {lines.map((line, idx) => (
        <div
          key={idx}
          className={`caption-line ${idx < 3 ? 'font-bold text-center' : ''}`}
          style={isCaliforniaState ? { paddingLeft: '3rem' } : {}}
        >
          {sanitizeContent(line)}
        </div>
      ))}
    </div>
  );
}

export function MotionPreview({ motionOutput, orderId, jurisdiction, rawJson }: MotionPreviewProps) {
  const [showRawJson, setShowRawJson] = useState(false);

  // Handle null/missing output
  if (!motionOutput) {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-lg p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <h3 className="text-amber-800 font-semibold text-lg mb-2">Motion Not Yet Generated</h3>
        <p className="text-amber-600 text-sm">
          Use the &quot;Generate Now&quot; button in the sidebar to start the 14-phase workflow.
        </p>
      </div>
    );
  }

  const { draftMotion, citationValidation } = motionOutput;

  // Handle malformed output
  if (!draftMotion) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 inline mr-2" />
          <span className="text-amber-700 font-medium">
            Motion output is incomplete. Some sections may be missing.
          </span>
        </div>
        <button
          onClick={() => setShowRawJson(!showRawJson)}
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          <FileText className="w-4 h-4" />
          Show Raw JSON
          {showRawJson ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showRawJson && rawJson && (
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-auto max-h-96">
            {rawJson}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className="motion-preview space-y-6">
      {/* Citation Validation Summary */}
      {citationValidation && (
        <CitationValidationBanner {...citationValidation} />
      )}

      {/* Motion Document */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
          <h3 className="font-semibold text-slate-700">Motion Preview</h3>
          <p className="text-xs text-slate-500">Order {orderId} &bull; {jurisdiction.replace('_', ' ')}</p>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Caption */}
          {draftMotion.caption && (
            <section className="motion-section">
              <div className="border-2 border-slate-300 p-4 bg-slate-50">
                {formatCaption(draftMotion.caption, jurisdiction)}
              </div>
            </section>
          )}

          {/* Introduction */}
          {draftMotion.introduction && (
            <section className="motion-section">
              <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide mb-2">Introduction</h4>
              <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">
                {sanitizeContent(draftMotion.introduction)}
              </p>
            </section>
          )}

          {/* Statement of Facts */}
          {draftMotion.statementOfFacts && (
            <section className="motion-section">
              <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide mb-2">Statement of Facts</h4>
              <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">
                {sanitizeContent(draftMotion.statementOfFacts)}
              </p>
            </section>
          )}

          {/* Legal Standard */}
          {draftMotion.legalStandard && (
            <section className="motion-section">
              <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide mb-2">Legal Standard</h4>
              <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">
                {sanitizeContent(draftMotion.legalStandard)}
              </p>
            </section>
          )}

          {/* Arguments */}
          {draftMotion.arguments && draftMotion.arguments.length > 0 && (
            <section className="motion-section">
              <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide mb-2">Argument</h4>
              <div className="space-y-4">
                {draftMotion.arguments.map((arg, idx) => (
                  <div key={idx} className="text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {sanitizeContent(arg)}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Conclusion */}
          {draftMotion.conclusion && (
            <section className="motion-section">
              <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide mb-2">Conclusion</h4>
              <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">
                {sanitizeContent(draftMotion.conclusion)}
              </p>
            </section>
          )}

          {/* Certificate of Service */}
          {draftMotion.certificateOfService && (
            <section className="motion-section border-t border-slate-200 pt-6 mt-6">
              <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide mb-2">Certificate of Service</h4>
              <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                {sanitizeContent(draftMotion.certificateOfService)}
              </p>
            </section>
          )}
        </div>
      </div>

      {/* Raw JSON Toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowRawJson(!showRawJson)}
          className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
        >
          <FileText className="w-4 h-4" />
          {showRawJson ? 'Hide' : 'Show'} Raw JSON
          {showRawJson ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {showRawJson && rawJson && (
        <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-auto max-h-96">
          {rawJson}
        </pre>
      )}
    </div>
  );
}
