'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

export function QueueRefreshButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [countdown, setCountdown] = useState(10)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          startTransition(() => {
            router.refresh()
          })
          return 10
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [autoRefresh, router])

  const handleManualRefresh = () => {
    setCountdown(10)
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded border-gray-300 text-teal focus:ring-teal"
          />
          Auto-refresh
        </label>
        {autoRefresh && (
          <span className="text-xs text-gray-400 tabular-nums">
            ({countdown}s)
          </span>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleManualRefresh}
        disabled={isPending}
        className="gap-2"
      >
        <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
        Refresh
      </Button>
    </div>
  )
}
