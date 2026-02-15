'use client'

/**
 * StateSelect — 50-state jurisdiction dropdown.
 *
 * SP-C Task 21 (Step 8)
 *
 * Fetches enabled states from GET /api/states.
 * On selection, stores stateCode and pricingMultiplier in form state.
 */

import { useEffect, useState } from 'react'
import { useOrderForm } from '@/hooks/use-order-form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

interface StateOption {
  code: string
  name: string
  pricing_multiplier: number
  state_courts_enabled: boolean
  federal_circuits: string[]
  federal_districts: string[]
}

export function StateSelect() {
  const { stateCode, updateField } = useOrderForm()
  const [states, setStates] = useState<StateOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStates() {
      try {
        const res = await fetch('/api/states')
        if (!res.ok) throw new Error('Failed to load states')
        const data = await res.json()
        setStates(data.states || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load states')
      } finally {
        setLoading(false)
      }
    }
    fetchStates()
  }, [])

  function handleChange(code: string) {
    const selected = states.find(s => s.code === code)
    if (!selected) return

    updateField('stateCode', code)
    updateField('pricingMultiplier', selected.pricing_multiplier)

    // Store federal info for downstream selects
    if (selected.federal_districts?.length > 0) {
      // Federal districts available — keep courtType selection open
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>State</Label>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading states...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-2">
        <Label>State</Label>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="state-select">State</Label>
      <Select value={stateCode} onValueChange={handleChange}>
        <SelectTrigger id="state-select">
          <SelectValue placeholder="Select a state" />
        </SelectTrigger>
        <SelectContent>
          {states.map((state) => (
            <SelectItem key={state.code} value={state.code}>
              {state.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
