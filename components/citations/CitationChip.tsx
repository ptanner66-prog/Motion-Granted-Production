'use client';

/**
 * CitationChip
 *
 * A small, clickable element displaying a citation.
 * Styled differently based on citation type and verification status.
 *
 * Citation Viewer Feature — January 30, 2026
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle, AlertTriangle, AlertCircle, BookOpen, Scale, Copy } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface CitationChipProps {
  citation: {
    citationString: string;
    caseNameShort?: string;
    caseName?: string;
    courtlistenerOpinionId?: string;
    citationType?: 'case' | 'statute' | 'regulation';
    verificationStatus?: 'verified' | 'unverified' | 'flagged' | 'pending_civ' | 'statutory_presumed';
    authorityLevel?: 'binding' | 'persuasive';
  };
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  showVerificationBadge?: boolean;
  showCopyButton?: boolean;
  className?: string;
}

export function CitationChip({
  citation,
  onClick,
  size = 'md',
  showVerificationBadge = true,
  showCopyButton = false,
  className,
}: CitationChipProps) {
  const {
    citationString,
    caseNameShort,
    caseName,
    citationType = 'case',
    verificationStatus = 'verified',
    authorityLevel,
  } = citation;

  // Determine display text
  const displayText = caseNameShort || citationString;
  const fullText = caseName ? `${caseName}, ${citationString}` : citationString;

  // Handle copy
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(fullText);
  };

  // Size variants
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-sm px-3 py-1 gap-1.5',
    lg: 'text-base px-4 py-1.5 gap-2',
  };

  // Status-based styling
  const getStatusStyles = () => {
    if (citationType === 'statute' || citationType === 'regulation') {
      return 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200';
    }

    switch (verificationStatus) {
      case 'verified':
        return 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200';
      case 'unverified':
        return 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border-yellow-200';
      case 'flagged':
        return 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200';
      default:
        return 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200';
    }
  };

  // Authority level border style
  const getBorderStyle = () => {
    if (!authorityLevel) return 'border-solid';
    return authorityLevel === 'binding' ? 'border-solid border-2' : 'border-dashed';
  };

  // Get icon based on type/status
  const getIcon = () => {
    if (citationType === 'statute' || citationType === 'regulation') {
      return <BookOpen className="h-3 w-3 flex-shrink-0" />;
    }

    switch (verificationStatus) {
      case 'verified':
        return <CheckCircle className="h-3 w-3 flex-shrink-0 text-green-600" />;
      case 'unverified':
        return <AlertTriangle className="h-3 w-3 flex-shrink-0 text-yellow-600" />;
      case 'flagged':
        return <AlertCircle className="h-3 w-3 flex-shrink-0 text-red-600" />;
      default:
        return <Scale className="h-3 w-3 flex-shrink-0" />;
    }
  };

  const chip = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        'border transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal',
        'cursor-pointer',
        sizeClasses[size],
        getStatusStyles(),
        getBorderStyle(),
        onClick && 'hover:shadow-sm hover:-translate-y-0.5',
        className
      )}
      aria-label={`View details for ${fullText}`}
    >
      {showVerificationBadge && getIcon()}
      <span className="truncate max-w-[200px]">{displayText}</span>
      {showCopyButton && (
        <button
          type="button"
          onClick={handleCopy}
          className="ml-1 p-0.5 rounded hover:bg-black/10 transition-colors"
          aria-label="Copy citation"
        >
          <Copy className="h-3 w-3" />
        </button>
      )}
    </button>
  );

  // Wrap with tooltip for full citation
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{chip}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-medium">{fullText}</p>
          {authorityLevel && (
            <p className="text-xs text-gray-500 mt-1">
              {authorityLevel === 'binding' ? 'Binding Authority' : 'Persuasive Authority'}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
