'use client'

import { cn } from '@/lib/utils'

interface CharacterCounterProps {
  current: number
  minimum: number
  className?: string
}

export function CharacterCounter({ current, minimum, className }: CharacterCounterProps) {
  const getColor = () => {
    if (current < minimum) return 'text-red-500'
    if (current < minimum * 2.5) return 'text-yellow-600'
    return 'text-green-600'
  }

  return (
    <div className={cn('text-right text-sm', getColor(), className)}>
      {current} / {minimum} minimum
    </div>
  )
}
