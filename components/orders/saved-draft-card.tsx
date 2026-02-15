'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileEdit, ChevronRight, Clock } from 'lucide-react'
import { formatMotionType } from '@/config/motion-types'
import { formatRelativeTime } from '@/lib/utils'

interface IntakeDraft {
  id: string
  motion_type: string
  current_step: number
  total_steps: number
  updated_at: string
}

export function SavedDraftCard() {
  const [draft, setDraft] = useState<IntakeDraft | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDraft() {
      try {
        const res = await fetch('/api/intake/draft')
        if (res.ok) {
          const data = await res.json()
          if (data.draft) {
            setDraft(data.draft)
          }
        }
      } catch {
        // No draft or endpoint not available
      } finally {
        setLoading(false)
      }
    }
    fetchDraft()
  }, [])

  if (loading || !draft) return null

  return (
    <Card className="border-0 shadow-sm overflow-hidden ring-2 ring-amber-200 bg-gradient-to-r from-amber-50 to-amber-50/50">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100">
              <FileEdit className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-navy">
                Draft: {formatMotionType(draft.motion_type)}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex gap-0.5">
                  {Array.from({ length: draft.total_steps }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 w-6 rounded-full ${
                        i < draft.current_step ? 'bg-amber-500' : 'bg-amber-200'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(draft.updated_at)}
                </span>
              </div>
            </div>
          </div>
          <Button size="sm" className="gap-1 bg-amber-600 hover:bg-amber-700 text-white" asChild>
            <Link href="/submit">
              Resume
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
