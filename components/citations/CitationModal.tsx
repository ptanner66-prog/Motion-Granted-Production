'use client';

/**
 * CitationModal
 *
 * Full-screen modal showing complete case details.
 *
 * Citation Viewer Feature — January 30, 2026
 */

import React, { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ExternalLink,
  FileText,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Scale,
  Calendar,
  Building,
  Link2,
  Flag,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import type { OrderCitation, CitationDetails } from '@/types/citations';
import { extractCaseName, extractCourtName } from '@/lib/citations/extract-case-name';

export interface CitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  opinionId?: string;
  citation?: OrderCitation;
  onVerificationChange?: (citationId: string, status: 'verified' | 'flagged') => void;
  mode?: 'client' | 'admin';
}

export function CitationModal({
  isOpen,
  onClose,
  opinionId,
  citation,
  onVerificationChange,
  mode = 'client',
}: CitationModalProps) {
  const [details, setDetails] = useState<CitationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFullOpinion, setShowFullOpinion] = useState(false);
  const [isLoadingText, setIsLoadingText] = useState(false);
  const [copied, setCopied] = useState(false);

  // Effective opinion ID
  const effectiveOpinionId = opinionId || citation?.courtlistenerOpinionId;

  // Fetch citation details
  const fetchDetails = useCallback(async (refresh = false) => {
    if (!effectiveOpinionId) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (refresh) params.set('refresh', 'true');

      const response = await fetch(`/api/citations/${effectiveOpinionId}?${params}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch citation details');
      }

      setDetails(data.data);
    } catch (err) {
      console.error('Error fetching citation:', err);
      setError(err instanceof Error ? err.message : 'Failed to load citation');
    } finally {
      setIsLoading(false);
    }
  }, [effectiveOpinionId]);

  // Fetch full opinion text
  const fetchOpinionText = async () => {
    if (!effectiveOpinionId || details?.opinionText) return;

    setIsLoadingText(true);
    try {
      const response = await fetch(`/api/citations/${effectiveOpinionId}?includeText=true`);
      const data = await response.json();

      if (data.success && data.data) {
        setDetails(data.data);
      }
    } catch (err) {
      console.error('Error fetching opinion text:', err);
    } finally {
      setIsLoadingText(false);
    }
  };

  // Load details when modal opens
  useEffect(() => {
    if (isOpen && effectiveOpinionId) {
      fetchDetails();
    }
    // Reset state when modal closes
    if (!isOpen) {
      setDetails(null);
      setError(null);
      setShowFullOpinion(false);
    }
  }, [isOpen, effectiveOpinionId, fetchDetails]);

  // Handle copy citation
  const handleCopy = async () => {
    let text: string;
    if (details) {
      const name = details.caseName && details.caseName !== 'Unknown Case'
        ? details.caseName
        : extractCaseName(details.citation || citation?.citationString);
      text = `${name}, ${details.citation}`;
    } else if (citation) {
      const name = citation.caseName && citation.caseName !== 'Unknown Case'
        ? citation.caseName
        : extractCaseName(citation.citationString);
      text = `${name}, ${citation.citationString}`;
    } else {
      text = '';
    }

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Render loading skeleton
  const renderSkeleton = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-6 w-28" />
      </div>
      <Separator />
      <div className="space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );

  // Render error state
  const renderError = () => (
    <div className="text-center py-8">
      <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
      <h3 className="text-lg font-semibold text-navy mb-2">Failed to Load Citation</h3>
      <p className="text-gray-600 mb-4">{error}</p>
      <Button onClick={() => fetchDetails(true)} variant="outline" className="gap-2">
        <RefreshCw className="h-4 w-4" />
        Retry
      </Button>
    </div>
  );

  // Render content
  const renderContent = () => {
    if (!details) return null;

    // Resolve display name — extraction fallback when CourtListener returned 'Unknown Case'
    const displayCaseName =
      details.caseName && details.caseName !== 'Unknown Case'
        ? details.caseName
        : (citation?.caseName && citation.caseName !== 'Unknown Case'
            ? citation.caseName
            : extractCaseName(details.citation || citation?.citationString));

    const displayCourt =
      details.courtShort && details.courtShort !== 'Unknown Court'
        ? details.courtShort
        : (citation?.courtShort && citation.courtShort !== 'Unknown Court'
            ? citation.courtShort
            : extractCourtName(undefined, details.citation || citation?.citationString));

    return (
      <div className="space-y-6">
        {/* Case Header */}
        <div>
          <h2 className="text-xl font-bold text-navy uppercase tracking-wide">
            {displayCaseName}
          </h2>
          <p className="text-lg text-gray-600 mt-1">
            {details.citation} ({displayCourt} {details.dateFiledDisplay || details.dateFiled?.split('-')[0]})
          </p>
        </div>

        {/* Status Badges */}
        <div className="flex flex-wrap gap-2">
          {/* Verification Status */}
          {citation?.verificationStatus === 'verified' && (
            <Badge variant="success" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              Verified
            </Badge>
          )}
          {citation?.verificationStatus === 'flagged' && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              Flagged
            </Badge>
          )}
          {citation?.verificationStatus === 'unverified' && (
            <Badge variant="warning" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Unverified
            </Badge>
          )}

          {/* Authority Level */}
          {citation?.authorityLevel && (
            <Badge variant={citation.authorityLevel === 'binding' ? 'default' : 'secondary'}>
              {citation.authorityLevel === 'binding' ? 'Binding Authority' : 'Persuasive Authority'}
            </Badge>
          )}

          {/* Cited By Count */}
          {details.citedByCount > 0 && (
            <Badge variant="outline">
              Cited {details.citedByCount} times
            </Badge>
          )}

          {/* Good Law Status */}
          {details.treatment && (
            <Badge variant={details.treatment.isGoodLaw ? 'success' : 'destructive'}>
              {details.treatment.isGoodLaw ? 'Good Law' : 'Caution: Negative Treatment'}
            </Badge>
          )}
        </div>

        {/* Proposition */}
        {citation?.proposition && (
          <>
            <Separator />
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Proposition in Your Motion
              </h3>
              <p className="text-gray-700 bg-blue-50 p-3 rounded-lg border-l-4 border-blue-400">
                &quot;{citation.proposition}&quot;
              </p>
            </div>
          </>
        )}

        {/* Case Summary */}
        {(details.syllabus || details.headnotes) && (
          <>
            <Separator />
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Case Summary
              </h3>
              {details.syllabus && (
                <p className="text-gray-700 whitespace-pre-wrap">{details.syllabus}</p>
              )}
              {details.headnotes && details.headnotes.length > 0 && (
                <div className="mt-2 space-y-2">
                  {details.headnotes.map((headnote, i) => (
                    <p key={i} className="text-gray-600 text-sm pl-4 border-l-2 border-gray-200">
                      {headnote}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Full Opinion */}
        <Separator />
        <div>
          <Button
            variant="outline"
            onClick={() => {
              if (!showFullOpinion && !details.opinionText) {
                fetchOpinionText();
              }
              setShowFullOpinion(!showFullOpinion);
            }}
            className="w-full justify-between"
            disabled={isLoadingText}
          >
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {showFullOpinion ? 'Hide Full Opinion' : 'View Full Opinion'}
            </span>
            {isLoadingText ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : showFullOpinion ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          {showFullOpinion && details.opinionText && (
            <div className="mt-4 max-h-96 overflow-y-auto p-4 bg-gray-50 rounded-lg border">
              {details.opinionTextType === 'html' ? (
                <div
                  className="prose prose-sm max-w-none"
                  // SP-15: Sanitize CourtListener HTML to prevent XSS (defense-in-depth)
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(details.opinionText) }}
                />
              ) : (
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-serif">
                  {details.opinionText}
                </pre>
              )}
            </div>
          )}

          {showFullOpinion && !details.opinionText && !isLoadingText && (
            <p className="mt-4 text-sm text-gray-500 text-center">
              Opinion text not available. View on CourtListener for full text.
            </p>
          )}
        </div>

        {/* External Links */}
        <Separator />
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            External Links
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              asChild
              className="gap-2"
            >
              <a
                href={details.courtlistenerUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Link2 className="h-4 w-4" />
                CourtListener
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>

            {details.pdfUrl && (
              <Button
                variant="outline"
                size="sm"
                asChild
                className="gap-2"
              >
                <a
                  href={details.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileText className="h-4 w-4" />
                  PDF
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              asChild
              className="gap-2"
            >
              <a
                href={`https://scholar.google.com/scholar?q=${encodeURIComponent(details.citation || details.caseName)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Scale className="h-4 w-4" />
                Google Scholar
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-2"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? 'Copied!' : 'Copy Citation'}
            </Button>
          </div>
        </div>

        {/* Treatment History */}
        {details.treatment && (
          <>
            <Separator />
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Treatment History
              </h3>
              <div className="space-y-2">
                {details.treatment.overruledBy && details.treatment.overruledBy.length > 0 && (
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    <span>Overruled by: {details.treatment.overruledBy.length} cases</span>
                  </div>
                )}
                {details.treatment.distinguishedBy && details.treatment.distinguishedBy.length > 0 && (
                  <div className="flex items-center gap-2 text-yellow-600">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Distinguished by: {details.treatment.distinguishedBy.length} cases</span>
                  </div>
                )}
                {details.treatment.followedBy && details.treatment.followedBy.length > 0 && (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span>Followed by: {details.treatment.followedBy.length} cases</span>
                  </div>
                )}
                {details.citedByCount > 0 && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Link2 className="h-4 w-4" />
                    <span>Cited by: {details.citedByCount} cases</span>
                  </div>
                )}
                {details.treatment.isGoodLaw && (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span>Not overruled</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Admin Actions */}
        {mode === 'admin' && citation && onVerificationChange && (
          <>
            <Separator />
            <div className="flex gap-2">
              {citation.verificationStatus !== 'verified' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onVerificationChange(citation.id, 'verified')}
                  className="gap-2 text-green-600 hover:text-green-700"
                >
                  <CheckCircle className="h-4 w-4" />
                  Mark Verified
                </Button>
              )}
              {citation.verificationStatus !== 'flagged' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onVerificationChange(citation.id, 'flagged')}
                  className="gap-2 text-red-600 hover:text-red-700"
                >
                  <Flag className="h-4 w-4" />
                  Flag Citation
                </Button>
              )}
            </div>
          </>
        )}

        {/* Cache info */}
        {details.cachedAt && (
          <div className="text-xs text-gray-400 text-right">
            {details.source === 'cache' && (
              <>Cached on {new Date(details.cachedAt).toLocaleDateString()}</>
            )}
            {details.source === 'live' && <>Fetched live from CourtListener</>}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-teal" />
            Citation Details
          </DialogTitle>
          <DialogDescription>
            View full case information and verify citation accuracy
          </DialogDescription>
        </DialogHeader>

        {isLoading && renderSkeleton()}
        {error && renderError()}
        {!isLoading && !error && details && renderContent()}
        {!isLoading && !error && !details && !effectiveOpinionId && citation && (
          <div className="space-y-6">
            {/* Fallback: Show citation info from DB when no CourtListener ID */}
            <div>
              <h2 className="text-xl font-bold text-navy uppercase tracking-wide">
                {citation.caseName && citation.caseName !== 'Unknown Case'
                  ? citation.caseName
                  : extractCaseName(citation.citationString)}
              </h2>
              <p className="text-lg text-gray-600 mt-1">
                {citation.citationString}
                {' '}({citation.court && citation.court !== 'Unknown Court'
                  ? (citation.courtShort || citation.court)
                  : extractCourtName(undefined, citation.citationString)})
              </p>
            </div>

            {/* Status Badges */}
            <div className="flex flex-wrap gap-2">
              {citation.verificationStatus === 'verified' && (
                <Badge variant="success" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Verified
                </Badge>
              )}
              {citation.verificationStatus === 'flagged' && (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Flagged
                </Badge>
              )}
              {citation.verificationStatus === 'unverified' && (
                <Badge variant="warning" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Unverified
                </Badge>
              )}
              {citation.authorityLevel && (
                <Badge variant={citation.authorityLevel === 'binding' ? 'default' : 'secondary'}>
                  {citation.authorityLevel === 'binding' ? 'Binding Authority' : 'Persuasive Authority'}
                </Badge>
              )}
              {citation.citationType && citation.citationType !== 'case' && (
                <Badge variant="outline">
                  {citation.citationType === 'statute' ? 'Statute' : 'Regulation'}
                </Badge>
              )}
            </div>

            {/* Proposition */}
            {citation.proposition && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Proposition in Your Motion
                  </h3>
                  <p className="text-gray-700 bg-blue-50 p-3 rounded-lg border-l-4 border-blue-400">
                    &quot;{citation.proposition}&quot;
                  </p>
                </div>
              </>
            )}

            {/* CourtListener link if URL stored in DB */}
            {citation.courtlistenerUrl && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    External Links
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild className="gap-2">
                      <a href={citation.courtlistenerUrl} target="_blank" rel="noopener noreferrer">
                        <Link2 className="h-4 w-4" />
                        CourtListener
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
                      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                      {copied ? 'Copied!' : 'Copy Citation'}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {!citation.courtlistenerUrl && (
              <>
                <Separator />
                <p className="text-sm text-gray-500 text-center">
                  CourtListener details not available for this citation.
                </p>
              </>
            )}

            {/* Admin Actions */}
            {mode === 'admin' && onVerificationChange && (
              <>
                <Separator />
                <div className="flex gap-2">
                  {citation.verificationStatus !== 'verified' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onVerificationChange(citation.id, 'verified')}
                      className="gap-2 text-green-600 hover:text-green-700"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Mark Verified
                    </Button>
                  )}
                  {citation.verificationStatus !== 'flagged' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onVerificationChange(citation.id, 'flagged')}
                      className="gap-2 text-red-600 hover:text-red-700"
                    >
                      <Flag className="h-4 w-4" />
                      Flag Citation
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {!isLoading && !error && !details && !effectiveOpinionId && !citation && (
          <div className="text-center py-8 text-gray-500">
            <Scale className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No citation data available</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
