'use client';

import { cn } from '@/lib/utils';
import {
  type LetterGrade,
  type JudgeSimulationResult,
  GRADE_VALUES,
  MINIMUM_PASSING_GRADE,
  MAX_REVISION_LOOPS,
  gradePasses,
} from '@/types/workflow';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Scale,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * JudgeSimulationCard Component
 *
 * Displays Phase VII judge simulation results:
 * - Letter grade (A+ through F)
 * - Pass/fail status (B+ minimum)
 * - Strengths and weaknesses
 * - Revision suggestions
 * - Loop counter (max 3)
 */

interface JudgeSimulationCardProps {
  result?: JudgeSimulationResult;
  isLoading?: boolean;
  className?: string;
}

const GRADE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'A+': { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  'A': { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },
  'A-': { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  'B+': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  'B': { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  'B-': { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  'C+': { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  'C': { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  'D': { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  'F': { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-400' },
};

function GradeBadge({ grade }: { grade: LetterGrade }) {
  const colors = GRADE_COLORS[grade] || GRADE_COLORS['F'];
  const passes = gradePasses(grade);

  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'flex items-center justify-center w-16 h-16 rounded-xl border-2 font-bold text-2xl',
          colors.bg,
          colors.text,
          colors.border
        )}
      >
        {grade}
      </div>
      <div className="flex flex-col">
        <span className="text-sm text-gray-500">
          {GRADE_VALUES[grade].toFixed(1)} / 4.3
        </span>
        {passes ? (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Passes
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <XCircle className="w-3 h-3 mr-1" />
            Below A-
          </Badge>
        )}
      </div>
    </div>
  );
}

export function JudgeSimulationCard({
  result,
  isLoading = false,
  className,
}: JudgeSimulationCardProps) {
  if (isLoading) {
    return (
      <Card className={cn('', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Scale className="w-5 h-5 text-gray-400" />
            Judge Simulation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm text-gray-500">Simulating judicial review...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card className={cn('', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Scale className="w-5 h-5 text-gray-400" />
            Judge Simulation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-gray-400">
            <p className="text-sm">Awaiting Phase VII completion</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Scale className="w-5 h-5 text-gray-400" />
            Judge Simulation
          </CardTitle>
          {result.loopNumber > 1 && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              <RefreshCw className="w-3 h-3 mr-1" />
              Loop {result.loopNumber} / {MAX_REVISION_LOOPS}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Grade display */}
        <GradeBadge grade={result.grade} />

        {/* Pass/Fail message */}
        {result.passes ? (
          <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <p className="font-medium text-green-800">Ready for Final Assembly</p>
              <p className="text-sm text-green-600">
                Motion meets minimum A- standard for delivery.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">Revision Required</p>
              <p className="text-sm text-amber-600">
                Motion needs improvement to meet A- standard.
                {result.loopNumber >= MAX_REVISION_LOOPS && (
                  <span className="block mt-1 text-red-600 font-medium">
                    Maximum revisions reached. Will deliver with enhanced disclosure.
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Strengths */}
        {result.strengths.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
              <ThumbsUp className="w-4 h-4 text-green-500" />
              Strengths
            </h4>
            <ul className="space-y-1">
              {result.strengths.map((strength, i) => (
                <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                  <span className="text-green-500 mt-1">•</span>
                  {strength}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Weaknesses */}
        {result.weaknesses.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
              <ThumbsDown className="w-4 h-4 text-red-500" />
              Areas for Improvement
            </h4>
            <ul className="space-y-1">
              {result.weaknesses.map((weakness, i) => (
                <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                  <span className="text-red-500 mt-1">•</span>
                  {weakness}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Specific Feedback */}
        {result.specificFeedback && (
          <div className="pt-3 border-t">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              Detailed Feedback
            </h4>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">
              {result.specificFeedback}
            </p>
          </div>
        )}

        {/* Revision suggestions (if not passing) */}
        {!result.passes && result.revisionSuggestions && result.revisionSuggestions.length > 0 && (
          <div className="pt-3 border-t">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              Suggested Revisions
            </h4>
            <ol className="space-y-1 list-decimal list-inside">
              {result.revisionSuggestions.map((suggestion, i) => (
                <li key={i} className="text-sm text-gray-600">
                  {suggestion}
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default JudgeSimulationCard;
