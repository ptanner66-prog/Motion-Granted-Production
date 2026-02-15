'use client'

/**
 * MotionTypeSelect — Fetches available motions from state_motion_availability.
 *
 * SP-C Task 22 (Step 8)
 *
 * Fetches from GET /api/states/[code]/motions when state+courtType selected.
 * Falls back to full registry when no state is selected.
 */

import { useEffect, useState } from 'react'
import { useOrderForm } from '@/hooks/use-order-form'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

interface MotionOption {
  motion_type: string
  court_type: string
}

/**
 * Convert slug to display name.
 * e.g. 'motion-to-compel-discovery' → 'Motion to Compel Discovery'
 */
function slugToDisplayName(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function MotionTypeSelect() {
  const { stateCode, courtType, motionType, updateField } = useOrderForm()
  const [motions, setMotions] = useState<MotionOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!stateCode || !courtType) {
      setMotions([])
      return
    }

    async function fetchMotions() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/states/${stateCode}/motions?courtType=${courtType}`)
        if (!res.ok) throw new Error('Failed to load motions')
        const data = await res.json()
        setMotions(data.motions || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load motions')
      } finally {
        setLoading(false)
      }
    }
    fetchMotions()
  }, [stateCode, courtType])

  if (!stateCode || !courtType) {
    return (
      <div className="space-y-2">
        <Label>Motion Type</Label>
        <p className="text-sm text-gray-500">Select a state and court type first.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>Motion Type</Label>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading available motions...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-2">
        <Label>Motion Type</Label>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="motion-type-select">Motion Type</Label>
      <Select value={motionType} onValueChange={(v) => updateField('motionType', v)}>
        <SelectTrigger id="motion-type-select">
          <SelectValue placeholder="Select motion type" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>
              Available Motions ({motions.length})
            </SelectLabel>
            {motions.map((m) => (
              <SelectItem key={m.motion_type} value={m.motion_type}>
                {slugToDisplayName(m.motion_type)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
