'use client';

/**
 * CitationList
 *
 * Displays all citations for an order, grouped by type.
 *
 * Citation Viewer Feature — January 30, 2026
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, Search, Scale, BookOpen, Filter, FileText, Library } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CitationChip } from './CitationChip';
import { StatuteCitationCard } from './StatuteCitationCard';
import type { OrderCitation, StatutoryCitation } from '@/types/citations';

export interface CitationListProps {
  orderId: string;
  citations?: OrderCitation[];
  statutoryCitations?: StatutoryCitation[];
  layout?: 'list' | 'grid' | 'inline';
  showStatutes?: boolean;
  showPropositions?: boolean;
  showFilters?: boolean;
  onCitationClick?: (citation: OrderCitation) => void;
  emptyMessage?: string;
  className?: string;
}

type SortOption = 'authority' | 'date' | 'location' | 'name';
type FilterOption = 'all' | 'binding' | 'persuasive' | 'verified' | 'flagged';

export function CitationList({
  orderId,
  citations = [],
  statutoryCitations = [],
  layout = 'list',
  showStatutes = true,
  showPropositions = false,
  showFilters = true,
  onCitationClick,
  emptyMessage = 'No citations found',
  className,
}: CitationListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('authority');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['in-motion', 'research-bank', 'binding', 'persuasive', 'statutory'])
  );

  // Filter and sort citations
  const filteredCitations = useMemo(() => {
    let result = [...citations];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        c =>
          c.citationString.toLowerCase().includes(query) ||
          c.caseName.toLowerCase().includes(query) ||
          c.caseNameShort?.toLowerCase().includes(query) ||
          c.proposition?.toLowerCase().includes(query)
      );
    }

    // Apply type filter
    switch (filterBy) {
      case 'binding':
        result = result.filter(c => c.authorityLevel === 'binding');
        break;
      case 'persuasive':
        result = result.filter(c => c.authorityLevel === 'persuasive');
        break;
      case 'verified':
        result = result.filter(c => c.verificationStatus === 'verified');
        break;
      case 'flagged':
        result = result.filter(c => c.verificationStatus === 'flagged');
        break;
    }

    // Apply sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'authority':
          // Binding first, then persuasive
          if (a.authorityLevel === 'binding' && b.authorityLevel !== 'binding') return -1;
          if (a.authorityLevel !== 'binding' && b.authorityLevel === 'binding') return 1;
          return (a.displayOrder || 0) - (b.displayOrder || 0);
        case 'date':
          return (b.dateFiled || '').localeCompare(a.dateFiled || '');
        case 'location':
          return (a.locationInMotion || '').localeCompare(b.locationInMotion || '');
        case 'name':
          return (a.caseNameShort || a.caseName).localeCompare(b.caseNameShort || b.caseName);
        default:
          return (a.displayOrder || 0) - (b.displayOrder || 0);
      }
    });

    return result;
  }, [citations, searchQuery, sortBy, filterBy]);

  // Filter statutory citations
  const filteredStatutory = useMemo(() => {
    if (!searchQuery.trim()) return statutoryCitations;
    const query = searchQuery.toLowerCase();
    return statutoryCitations.filter(
      s =>
        s.citation.toLowerCase().includes(query) ||
        s.name.toLowerCase().includes(query) ||
        s.purpose?.toLowerCase().includes(query)
    );
  }, [statutoryCitations, searchQuery]);

  // Split by in_draft status
  const hasAnyInDraft = citations.some(c => c.inDraft);
  const inMotionCitations = filteredCitations.filter(c => c.inDraft);
  const researchBankCitations = hasAnyInDraft ? filteredCitations.filter(c => !c.inDraft) : [];

  // Group case citations by authority level (used when no in_draft data exists)
  const bindingCitations = filteredCitations.filter(c => c.authorityLevel === 'binding');
  const persuasiveCitations = filteredCitations.filter(c => c.authorityLevel === 'persuasive');
  const otherCitations = filteredCitations.filter(c => !c.authorityLevel);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const totalCount = citations.length + statutoryCitations.length;

  if (totalCount === 0) {
    return (
      <div className={cn('text-center py-8 text-gray-500', className)}>
        <Scale className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Filters */}
      {showFilters && (
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search citations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Sort */}
          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortOption)}
              className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
              aria-label="Sort by"
            >
              <option value="authority">Sort by Authority</option>
              <option value="date">Sort by Date</option>
              <option value="name">Sort by Name</option>
              <option value="location">Sort by Location</option>
            </select>

            {/* Filter */}
            <select
              value={filterBy}
              onChange={e => setFilterBy(e.target.value as FilterOption)}
              className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
              aria-label="Filter by"
            >
              <option value="all">All Citations</option>
              <option value="binding">Binding Only</option>
              <option value="persuasive">Persuasive Only</option>
              <option value="verified">Verified Only</option>
              <option value="flagged">Flagged Only</option>
            </select>
          </div>
        </div>
      )}

      {/* Results count */}
      <div className="text-sm text-gray-500">
        Showing {filteredCitations.length + filteredStatutory.length} of {totalCount} citations
      </div>

      {/* In Motion / Research Bank split (when in_draft data exists) */}
      {hasAnyInDraft && inMotionCitations.length > 0 && (
        <div className="border border-emerald-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('in-motion')}
            className="w-full flex items-center justify-between p-4 bg-emerald-50 hover:bg-emerald-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-600" />
              <span className="font-medium text-emerald-800">
                In Motion ({inMotionCitations.length})
              </span>
              <span className="text-xs text-emerald-600 font-normal">Citations used in draft</span>
            </div>
            {expandedSections.has('in-motion') ? (
              <ChevronUp className="h-5 w-5 text-gray-500" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-500" />
            )}
          </button>

          {expandedSections.has('in-motion') && (
            <div className="p-4 bg-white">
              <div className={cn(
                layout === 'inline' && 'flex flex-wrap gap-2',
                layout === 'grid' && 'grid grid-cols-2 sm:grid-cols-3 gap-2',
                layout === 'list' && 'space-y-3'
              )}>
                {inMotionCitations.map(citation => (
                  <div key={citation.id} className={cn(layout === 'list' && 'border-b border-gray-100 pb-3 last:border-0 last:pb-0')}>
                    <CitationChip
                      citation={citation}
                      onClick={() => onCitationClick?.(citation)}
                      size={layout === 'inline' ? 'sm' : 'md'}
                    />
                    {showPropositions && citation.proposition && layout === 'list' && (
                      <p className="mt-1 text-sm text-gray-600 ml-7">{citation.proposition}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {hasAnyInDraft && researchBankCitations.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('research-bank')}
            className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Library className="h-5 w-5 text-gray-500" />
              <span className="font-medium text-gray-700">
                Research Bank ({researchBankCitations.length})
              </span>
              <span className="text-xs text-gray-500 font-normal">Not in current draft</span>
            </div>
            {expandedSections.has('research-bank') ? (
              <ChevronUp className="h-5 w-5 text-gray-500" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-500" />
            )}
          </button>

          {expandedSections.has('research-bank') && (
            <div className="p-4 bg-white">
              <div className={cn(
                layout === 'inline' && 'flex flex-wrap gap-2',
                layout === 'grid' && 'grid grid-cols-2 sm:grid-cols-3 gap-2',
                layout === 'list' && 'space-y-3'
              )}>
                {researchBankCitations.map(citation => (
                  <div key={citation.id} className={cn(layout === 'list' && 'border-b border-gray-100 pb-3 last:border-0 last:pb-0')}>
                    <CitationChip
                      citation={citation}
                      onClick={() => onCitationClick?.(citation)}
                      size={layout === 'inline' ? 'sm' : 'md'}
                    />
                    {showPropositions && citation.proposition && layout === 'list' && (
                      <p className="mt-1 text-sm text-gray-600 ml-7">{citation.proposition}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Case Citations - Binding (fallback when no in_draft data) */}
      {!hasAnyInDraft && (bindingCitations.length > 0 || otherCitations.length > 0) && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('binding')}
            className="w-full flex items-center justify-between p-4 bg-blue-50 hover:bg-blue-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-blue-600" />
              <span className="font-medium text-navy">
                Binding Authority ({bindingCitations.length + otherCitations.length})
              </span>
            </div>
            {expandedSections.has('binding') ? (
              <ChevronUp className="h-5 w-5 text-gray-500" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-500" />
            )}
          </button>

          {expandedSections.has('binding') && (
            <div className="p-4 bg-white">
              <div className={cn(
                layout === 'inline' && 'flex flex-wrap gap-2',
                layout === 'grid' && 'grid grid-cols-2 sm:grid-cols-3 gap-2',
                layout === 'list' && 'space-y-3'
              )}>
                {[...bindingCitations, ...otherCitations].map(citation => (
                  <div key={citation.id} className={cn(layout === 'list' && 'border-b border-gray-100 pb-3 last:border-0 last:pb-0')}>
                    <CitationChip
                      citation={citation}
                      onClick={() => onCitationClick?.(citation)}
                      size={layout === 'inline' ? 'sm' : 'md'}
                    />
                    {showPropositions && citation.proposition && layout === 'list' && (
                      <p className="mt-1 text-sm text-gray-600 ml-7">{citation.proposition}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Case Citations - Persuasive (fallback when no in_draft data) */}
      {!hasAnyInDraft && persuasiveCitations.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('persuasive')}
            className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-gray-600" />
              <span className="font-medium text-navy">
                Persuasive Authority ({persuasiveCitations.length})
              </span>
            </div>
            {expandedSections.has('persuasive') ? (
              <ChevronUp className="h-5 w-5 text-gray-500" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-500" />
            )}
          </button>

          {expandedSections.has('persuasive') && (
            <div className="p-4 bg-white">
              <div className={cn(
                layout === 'inline' && 'flex flex-wrap gap-2',
                layout === 'grid' && 'grid grid-cols-2 sm:grid-cols-3 gap-2',
                layout === 'list' && 'space-y-3'
              )}>
                {persuasiveCitations.map(citation => (
                  <div key={citation.id} className={cn(layout === 'list' && 'border-b border-gray-100 pb-3 last:border-0 last:pb-0')}>
                    <CitationChip
                      citation={citation}
                      onClick={() => onCitationClick?.(citation)}
                      size={layout === 'inline' ? 'sm' : 'md'}
                    />
                    {showPropositions && citation.proposition && layout === 'list' && (
                      <p className="mt-1 text-sm text-gray-600 ml-7">{citation.proposition}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Statutory Citations */}
      {showStatutes && filteredStatutory.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('statutory')}
            className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-gray-600" />
              <span className="font-medium text-navy">
                Statutory Citations ({filteredStatutory.length})
              </span>
            </div>
            {expandedSections.has('statutory') ? (
              <ChevronUp className="h-5 w-5 text-gray-500" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-500" />
            )}
          </button>

          {expandedSections.has('statutory') && (
            <div className="p-4 bg-white space-y-3">
              {filteredStatutory.map((statute, index) => (
                <StatuteCitationCard
                  key={statute.id || index}
                  statute={statute}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
