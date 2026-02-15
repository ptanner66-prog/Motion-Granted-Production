'use client';

import { cn } from '@/lib/utils';
import { type MotionTier, TIER_DESCRIPTIONS } from '@/types/workflow';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * TierBadge Component
 *
 * Displays motion tier with correct v7.2 styling:
 * - Tier A (Gray): Procedural/Administrative - Simple procedural motions
 * - Tier B (Blue): Intermediate - Standard motions with moderate complexity
 * - Tier C (Purple): Complex/Dispositive - MSJ, MSA, PI, TRO
 */

interface TierBadgeProps {
  tier: MotionTier | string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showTooltip?: boolean;
  className?: string;
}

const TIER_STYLES: Record<MotionTier, {
  bg: string;
  text: string;
  border: string;
  tooltip: string;
}> = {
  A: {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    border: 'border-gray-200',
    tooltip: 'Procedural/Administrative - Simple procedural motions',
  },
  B: {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-200',
    tooltip: 'Intermediate - Standard motions with moderate complexity',
  },
  C: {
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    border: 'border-purple-200',
    tooltip: 'Complex/Dispositive - MSJ, MSA, PI, TRO',
  },
  D: {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    border: 'border-amber-200',
    tooltip: 'Specialized/Enterprise - Multi-party, cross-border, enterprise-scale',
  },
};

const SIZE_STYLES = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
  lg: 'text-base px-3 py-1.5',
};

export function TierBadge({
  tier,
  size = 'md',
  showLabel = false,
  showTooltip = true,
  className,
}: TierBadgeProps) {
  // Normalize tier to uppercase and validate
  const normalizedTier = (tier?.toString().toUpperCase() as MotionTier) || 'A';
  const validTier: MotionTier = ['A', 'B', 'C'].includes(normalizedTier) ? normalizedTier : 'A';

  const styles = TIER_STYLES[validTier];
  const description = TIER_DESCRIPTIONS[validTier];

  const badge = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-semibold rounded-md border',
        styles.bg,
        styles.text,
        styles.border,
        SIZE_STYLES[size],
        className
      )}
    >
      <span>Tier {validTier}</span>
      {showLabel && (
        <span className="font-normal opacity-80">
          — {description.name}
        </span>
      )}
    </span>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold">{description.name}</p>
            <p className="text-sm text-muted-foreground">{description.description}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Get tier color for use in other components
 */
export function getTierColor(tier: MotionTier | string): {
  bg: string;
  text: string;
  border: string;
} {
  const normalizedTier = (tier?.toString().toUpperCase() as MotionTier) || 'A';
  const validTier: MotionTier = ['A', 'B', 'C'].includes(normalizedTier) ? normalizedTier : 'A';
  return TIER_STYLES[validTier];
}

export default TierBadge;
