'use client';

/**
 * StatuteCitationCard
 *
 * Card for displaying statutory citations.
 *
 * Citation Viewer Feature — January 30, 2026
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { BookOpen, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface StatuteCitationCardProps {
  statute: {
    id?: string;
    citation: string;
    name: string;
    purpose?: string;
    relevantText?: string;
  };
  expanded?: boolean;
  onToggleExpand?: () => void;
  className?: string;
}

export function StatuteCitationCard({
  statute,
  expanded: controlledExpanded,
  onToggleExpand,
  className,
}: StatuteCitationCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Use controlled or internal state
  const isExpanded = controlledExpanded ?? internalExpanded;
  const toggleExpand = onToggleExpand ?? (() => setInternalExpanded(!internalExpanded));

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(statute.citation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className={cn('bg-white border-gray-200 overflow-hidden', className)}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 flex-shrink-0">
            <BookOpen className="h-5 w-5 text-gray-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-navy truncate">{statute.citation}</h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={handleCopy}
                aria-label="Copy citation"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-gray-400" />
                )}
              </Button>
            </div>
            <p className="text-sm text-gray-600 mt-0.5">{statute.name}</p>
          </div>
        </div>

        {/* Purpose */}
        {statute.purpose && (
          <div className="mt-3 pl-13">
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-700">Purpose: </span>
              {statute.purpose}
            </p>
          </div>
        )}

        {/* Expandable text */}
        {statute.relevantText && (
          <div className="mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleExpand}
              className="text-teal hover:text-teal-dark w-full justify-start gap-2 pl-0"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Hide Full Text
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Show Full Text
                </>
              )}
            </Button>

            {isExpanded && (
              <div className="mt-2 p-4 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed italic">
                  &quot;{statute.relevantText}&quot;
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
