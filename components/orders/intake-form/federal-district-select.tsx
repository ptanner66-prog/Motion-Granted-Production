'use client'

/**
 * FederalDistrictSelect — Federal district court picker.
 *
 * SP-C Task 23 (Step 8.5)
 *
 * Only visible when courtType='FEDERAL'.
 * Fetches districts from the state data stored during StateSelect.
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

export function FederalDistrictSelect() {
  const { stateCode, courtType, federalDistrict, updateField } = useOrderForm()
  const [districts, setDistricts] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!stateCode || courtType !== 'FEDERAL') {
      setDistricts([])
      return
    }

    async function fetchDistricts() {
      setLoading(true)
      try {
        const res = await fetch('/api/states')
        if (!res.ok) throw new Error('Failed')
        const data = await res.json()
        const state = data.states?.find((s: { code: string }) => s.code === stateCode)
        setDistricts(state?.federal_districts || [])
      } catch {
        setDistricts([])
      } finally {
        setLoading(false)
      }
    }
    fetchDistricts()
  }, [stateCode, courtType])

  // Only show for federal court
  if (courtType !== 'FEDERAL') return null
  if (!stateCode) return null

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>Federal District</Label>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading districts...
        </div>
      </div>
    )
  }

  if (districts.length === 0) {
    return (
      <div className="space-y-2">
        <Label>Federal District</Label>
        <p className="text-sm text-gray-500">No federal districts configured for this state.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="federal-district-select">Federal District</Label>
      <Select value={federalDistrict} onValueChange={(v) => updateField('federalDistrict', v)}>
        <SelectTrigger id="federal-district-select">
          <SelectValue placeholder="Select federal district" />
        </SelectTrigger>
        <SelectContent>
          {districts.map((dist) => (
            <SelectItem key={dist} value={dist}>
              {dist}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
