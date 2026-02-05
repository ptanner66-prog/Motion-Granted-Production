'use client';

/**
 * GradeDisplay Component
 *
 * v6.3: Displays the judge simulation grade with visual indicators.
 * Highlights whether the motion meets the A- (87%) minimum threshold.
 */

import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface GradeDisplayProps {
  grade: string;
  gradeNumeric: number;
  passed: boolean;
  showDetails?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

// Grade color mapping
const GRADE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'A+': { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  'A': { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  'A-': { bg: 'bg-green-100', text: 'text-green-600', border: 'border-green-300' },
  'B+': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  'B': { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  'B-': { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  'C+': { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  'C': { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  'C-': { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  'D': { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  'F': { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
};

const SIZE_CLASSES = {
  sm: {
    container: 'p-2',
    grade: 'text-2xl',
    label: 'text-xs',
    icon: 'h-4 w-4',
  },
  md: {
    container: 'p-4',
    grade: 'text-4xl',
    label: 'text-sm',
    icon: 'h-5 w-5',
  },
  lg: {
    container: 'p-6',
    grade: 'text-6xl',
    label: 'text-base',
    icon: 'h-6 w-6',
  },
};

export function GradeDisplay({
  grade,
  gradeNumeric,
  passed,
  showDetails = true,
  size = 'md',
}: GradeDisplayProps) {
  const colors = GRADE_COLORS[grade] || GRADE_COLORS['F'];
  const sizeClasses = SIZE_CLASSES[size];
  const percentage = Math.round(gradeNumeric * 100);

  return (
    <div className={cn(
      'rounded-lg border-2',
      colors.bg,
      colors.border,
      sizeClasses.container
    )}>
      <div className="flex items-center justify-between">
        {/* Grade letter */}
        <div className="text-center">
          <div className={cn('font-bold', colors.text, sizeClasses.grade)}>
            {grade}
          </div>
          <div className={cn('text-muted-foreground', sizeClasses.label)}>
            {percentage}%
          </div>
        </div>

        {/* Pass/Fail indicator */}
        <div className="flex flex-col items-center gap-1">
          {passed ? (
            <>
              <CheckCircle2 className={cn('text-green-500', sizeClasses.icon)} />
              <span className={cn('text-green-600 font-medium', sizeClasses.label)}>
                Passed
              </span>
            </>
          ) : (
            <>
              <XCircle className={cn('text-red-500', sizeClasses.icon)} />
              <span className={cn('text-red-600 font-medium', sizeClasses.label)}>
                Below A-
              </span>
            </>
          )}
        </div>
      </div>

      {/* Details section */}
      {showDetails && (
        <div className="mt-4 pt-4 border-t border-current/10">
          <div className="flex items-start gap-2 text-sm">
            {passed ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span className="text-green-700">
                  This motion meets the A- (87%) quality threshold and is ready for delivery.
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                <span className="text-yellow-700">
                  This motion needs revision to meet the A- (87%) minimum threshold.
                  Please request revisions or contact support.
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact grade badge for lists and cards
 */
export function GradeBadge({
  grade,
  passed,
}: {
  grade: string;
  passed: boolean;
}) {
  const colors = GRADE_COLORS[grade] || GRADE_COLORS['F'];

  return (
    <div className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-medium',
      colors.bg,
      colors.text
    )}>
      {passed ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5" />
      )}
      <span>{grade}</span>
    </div>
  );
}

export default GradeDisplay;
