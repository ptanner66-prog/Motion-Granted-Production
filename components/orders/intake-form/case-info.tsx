'use client'

import { useOrderForm } from '@/hooks/use-order-form'
import { JURISDICTIONS } from '@/config/motion-types'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function CaseInfo() {
  const {
    jurisdiction,
    jurisdictionOther,
    courtDivision,
    caseNumber,
    caseCaption,
    updateField,
  } = useOrderForm()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-navy">Case Information</h2>
        <p className="mt-1 text-gray-500">
          Provide details about the case
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="jurisdiction">Jurisdiction *</Label>
          <Select
            value={jurisdiction}
            onValueChange={(value) => updateField('jurisdiction', value)}
          >
            <SelectTrigger id="jurisdiction">
              <SelectValue placeholder="Select jurisdiction" />
            </SelectTrigger>
            <SelectContent>
              {JURISDICTIONS.map((j) => (
                <SelectItem key={j.id} value={j.id}>
                  {j.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {jurisdiction === 'other' && (
          <div className="space-y-2">
            <Label htmlFor="jurisdiction-other">Specify Jurisdiction *</Label>
            <Input
              id="jurisdiction-other"
              placeholder="Enter jurisdiction..."
              value={jurisdictionOther}
              onChange={(e) => updateField('jurisdictionOther', e.target.value)}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="court-division">Court / Division</Label>
          <Input
            id="court-division"
            placeholder="e.g., 19th Judicial District Court"
            value={courtDivision}
            onChange={(e) => updateField('courtDivision', e.target.value)}
          />
          <p className="text-xs text-gray-500">
            Specify the court or division if applicable
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="case-number">Case Number *</Label>
          <Input
            id="case-number"
            placeholder="e.g., 2024-12345"
            value={caseNumber}
            onChange={(e) => updateField('caseNumber', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="case-caption">Case Caption *</Label>
          <Input
            id="case-caption"
            placeholder="e.g., Smith v. Jones"
            value={caseCaption}
            onChange={(e) => updateField('caseCaption', e.target.value)}
          />
          <p className="text-xs text-gray-500">
            Full case caption as it appears in court filings
          </p>
        </div>
      </div>
    </div>
  )
}
