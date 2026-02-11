'use client';

/**
 * CitationViewer
 *
 * Container component that combines CitationList and CitationModal.
 * Manages state for modal, fetching, caching.
 *
 * Usage:
 *   // In user dashboard
 *   <CitationViewer orderId={order.id} mode="client" />
 *
 *   // In admin dashboard
 *   <CitationViewer orderId={order.id} mode="admin" />
 *
 * Citation Viewer Feature — January 30, 2026
 */

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Scale, CheckCircle, AlertTriangle, Loader2, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CitationList } from './CitationList';
import { CitationModal } from './CitationModal';
import { CitationChip } from './CitationChip';
import type { OrderCitation, StatutoryCitation } from '@/types/citations';

export interface CitationViewerProps {
  orderId: string;
  mode: 'client' | 'admin';
  initialCitations?: OrderCitation[];
  initialStatutoryCitations?: StatutoryCitation[];
  compact?: boolean;
  showTitle?: boolean;
  className?: string;
}

export function CitationViewer({
  orderId,
  mode,
  initialCitations,
  initialStatutoryCitations,
  compact = false,
  showTitle = true,
  className,
}: CitationViewerProps) {
  const [citations, setCitations] = useState<OrderCitation[]>(initialCitations || []);
  const [statutoryCitations, setStatutoryCitations] = useState<StatutoryCitation[]>(
    initialStatutoryCitations || []
  );
  const [isLoading, setIsLoading] = useState(!initialCitations);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!compact);

  // Modal state
  const [selectedCitation, setSelectedCitation] = useState<OrderCitation | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Fetch citations
  const fetchCitations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/orders/${orderId}/citations`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch citations');
      }

      setCitations(data.data.caseCitations || []);
      setStatutoryCitations(data.data.statutoryCitations || []);
    } catch (err) {
      console.error('Error fetching citations:', err);
      setError(err instanceof Error ? err.message : 'Failed to load citations');
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  // Load citations on mount if not provided
  useEffect(() => {
    if (!initialCitations) {
      fetchCitations();
    }
  }, [initialCitations, fetchCitations]);

  // Handle citation click
  const handleCitationClick = (citation: OrderCitation) => {
    setSelectedCitation(citation);
    setIsModalOpen(true);
  };

  // Handle verification change (admin only)
  const handleVerificationChange = async (citationId: string, status: 'verified' | 'flagged') => {
    try {
      // Update local state optimistically
      setCitations(prev =>
        prev.map(c =>
          c.id === citationId ? { ...c, verificationStatus: status } : c
        )
      );

      await fetch(`/api/citations/${citationId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      console.error('Error updating verification:', err);
      // Revert on error
      fetchCitations();
    }
  };

  // Calculate stats
  const totalCitations = citations.length + statutoryCitations.length;
  const verifiedCount = citations.filter(c => c.verificationStatus === 'verified').length;
  const flaggedCount = citations.filter(c => c.verificationStatus === 'flagged').length;
  const allVerified = flaggedCount === 0 && citations.length > 0;

  // Render loading state
  if (isLoading) {
    return (
      <Card className={cn('bg-white border-gray-200', className)}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading citations...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render error state
  if (error) {
    return (
      <Card className={cn('bg-white border-gray-200', className)}>
        <CardContent className="p-6">
          <div className="text-center text-gray-500">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
            <p>{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchCitations}
              className="mt-3"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render empty state
  if (totalCitations === 0) {
    return (
      <Card className={cn('bg-white border-gray-200', className)}>
        <CardContent className="p-6">
          <div className="text-center text-gray-500">
            <Scale className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p>No citations available for this order</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Compact view - just chips
  if (compact && !expanded) {
    return (
      <Card className={cn('bg-white border-gray-200', className)}>
        {showTitle && (
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Scale className="h-5 w-5 text-teal" />
                Citations ({totalCitations})
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(true)}
                className="text-teal"
              >
                See All
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
        )}
        <CardContent className={cn(showTitle ? 'pt-2' : 'p-6')}>
          {/* Verification badge */}
          <div className="mb-3 p-2 bg-teal/5 border border-teal/20 rounded-lg text-sm text-gray-600">
            {allVerified ? (
              <span className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                All citations verified against CourtListener
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                {flaggedCount} citation{flaggedCount !== 1 ? 's' : ''} flagged for review
              </span>
            )}
          </div>

          {/* Case citations as chips */}
          <div className="space-y-3">
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase">
                Case Citations ({citations.length})
              </span>
              <div className="flex flex-wrap gap-2 mt-2">
                {citations.slice(0, 6).map(citation => (
                  <CitationChip
                    key={citation.id}
                    citation={citation}
                    onClick={() => handleCitationClick(citation)}
                    size="sm"
                  />
                ))}
                {citations.length > 6 && (
                  <Badge variant="secondary">+{citations.length - 6} more</Badge>
                )}
              </div>
            </div>

            {statutoryCitations.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase">
                  Statutory Citations ({statutoryCitations.length})
                </span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {statutoryCitations.slice(0, 4).map((statute, i) => (
                    <Badge key={i} variant="outline" className="text-gray-600">
                      {statute.citation}
                    </Badge>
                  ))}
                  {statutoryCitations.length > 4 && (
                    <Badge variant="secondary">+{statutoryCitations.length - 4} more</Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>

        {/* Modal */}
        <CitationModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedCitation(null);
          }}
          opinionId={selectedCitation?.courtlistenerOpinionId}
          citation={selectedCitation || undefined}
          onVerificationChange={mode === 'admin' ? handleVerificationChange : undefined}
          mode={mode}
        />
      </Card>
    );
  }

  // Full view
  return (
    <Card className={cn('bg-white border-gray-200', className)}>
      {showTitle && (
        <CardHeader className="border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Scale className="h-5 w-5 text-teal" />
                Citations ({totalCitations})
              </CardTitle>
              <CardDescription className="mt-1">
                {allVerified ? (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    All citations verified against CourtListener
                  </span>
                ) : (
                  <span className="text-gray-500">
                    Click any citation to view full case details
                  </span>
                )}
              </CardDescription>
            </div>
            {compact && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(false)}
                className="text-gray-500"
              >
                Collapse
                <ChevronUp className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </CardHeader>
      )}

      <CardContent className="p-6">
        {/* Admin warning banner */}
        {mode === 'admin' && flaggedCount > 0 && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center gap-2 text-yellow-700">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">
                {flaggedCount} citation{flaggedCount !== 1 ? 's' : ''} flagged for review
              </span>
            </div>
            <p className="text-sm text-yellow-600 mt-1">
              Click each flagged citation to review and verify accuracy.
            </p>
          </div>
        )}

        <CitationList
          orderId={orderId}
          citations={citations}
          statutoryCitations={statutoryCitations}
          layout="list"
          showStatutes={true}
          showPropositions={mode === 'admin'}
          showFilters={true}
          onCitationClick={handleCitationClick}
        />
      </CardContent>

      {/* Modal */}
      <CitationModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedCitation(null);
        }}
        opinionId={selectedCitation?.courtlistenerOpinionId}
        citation={selectedCitation || undefined}
        onVerificationChange={mode === 'admin' ? handleVerificationChange : undefined}
        mode={mode}
      />
    </Card>
  );
}
