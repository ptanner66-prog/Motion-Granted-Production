'use client'

/**
 * CourtTypeSelect — STATE/FEDERAL toggle.
 *
 * SP-C Task 22 (Step 8)
 *
 * Shown after state is selected. When courtType changes,
 * triggers motion list refresh.
 */

import { useOrderForm } from '@/hooks/use-order-form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'

export function CourtTypeSelect() {
  const { courtType, stateCode, updateField } = useOrderForm()

  if (!stateCode) return null

  function handleChange(value: string) {
    updateField('courtType', value as 'STATE' | 'FEDERAL')
    // Reset federal district when switching court types
    if (value === 'STATE') {
      updateField('federalDistrict', '')
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="court-type-select">Court Type</Label>
      <Select value={courtType} onValueChange={handleChange}>
        <SelectTrigger id="court-type-select">
          <SelectValue placeholder="Select court type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="STATE">State Court</SelectItem>
          <SelectItem value="FEDERAL">Federal Court</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
