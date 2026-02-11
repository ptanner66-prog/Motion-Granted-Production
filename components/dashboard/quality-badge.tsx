import { cn } from '@/lib/utils'

interface QualityBadgeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const GRADE_THRESHOLDS = [
  { min: 0.97, grade: 'A+', colorKey: 'green' },
  { min: 0.93, grade: 'A', colorKey: 'green' },
  { min: 0.90, grade: 'A-', colorKey: 'green' },
  { min: 0.87, grade: 'B+', colorKey: 'blue' },
  { min: 0.83, grade: 'B', colorKey: 'yellow' },
  { min: 0, grade: 'C', colorKey: 'red' },
] as const

const COLOR_STYLES = {
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  yellow: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
} as const

const SIZE_STYLES = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
  lg: 'text-base px-3 py-1.5 font-bold',
} as const

/**
 * Converts a 0.0-1.0 quality score to a letter grade + color.
 * Score thresholds: A+ (>=0.97), A (>=0.93), A- (>=0.90), B+ (>=0.87), B (>=0.83), C (<0.83)
 */
export function scoreToLetterGrade(score: number): string {
  const match = GRADE_THRESHOLDS.find((t) => score >= t.min)
  return match?.grade ?? 'C'
}

function resolveGrade(score: number) {
  const match = GRADE_THRESHOLDS.find((t) => score >= t.min)
  return {
    grade: match?.grade ?? 'C',
    colorKey: (match?.colorKey ?? 'red') as keyof typeof COLOR_STYLES,
  }
}

/**
 * Displays a quality score as a letter grade badge.
 * Never exposes the raw decimal score to attorneys.
 */
export function QualityBadge({ score, size = 'md', className }: QualityBadgeProps) {
  const { grade, colorKey } = resolveGrade(score)
  const styles = COLOR_STYLES[colorKey]

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-semibold',
        styles.bg,
        styles.text,
        styles.border,
        SIZE_STYLES[size],
        className
      )}
    >
      {grade}
    </span>
  )
}
