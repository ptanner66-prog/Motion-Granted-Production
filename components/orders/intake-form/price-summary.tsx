'use client'

/**
 * PriceSummary — Client-side price calculation display.
 *
 * SP-C Task 24 (Steps 8.5a + 8.6 / Gap 39)
 *
 * BD-14: Receives pricingMultiplier as prop from intake form.
 * BD-4: Imports from price-calculator-core.ts (NOT price-calculator.ts).
 * Uses calculatePriceSync() — zero server imports.
 */

import { calculatePriceSync, type RushType, type PriceBreakdown } from '@/lib/payments/price-calculator-core'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { DollarSign } from 'lucide-react'

interface PriceSummaryProps {
  motionType: string
  rushType: RushType
  stateCode: string
  pricingMultiplier: number
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function PriceSummary({
  motionType,
  rushType,
  stateCode,
  pricingMultiplier,
}: PriceSummaryProps) {
  if (!motionType) {
    return null
  }

  let breakdown: PriceBreakdown
  try {
    breakdown = calculatePriceSync(motionType, rushType, stateCode, pricingMultiplier)
  } catch {
    return null
  }

  const hasRush = breakdown.rushFee > 0
  const hasMultiplier = breakdown.jurisdictionMultiplier !== 1.0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-teal" />
          Price Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Base Price (Tier {breakdown.tier})</span>
          <span className="font-medium">{formatCurrency(breakdown.basePrice)}</span>
        </div>

        {hasRush && (
          <div className="flex justify-between">
            <span className="text-gray-500">Rush Fee</span>
            <span className="font-medium text-amber-600">+{formatCurrency(breakdown.rushFee)}</span>
          </div>
        )}

        {hasMultiplier && (
          <div className="flex justify-between">
            <span className="text-gray-500">Jurisdiction Adjustment</span>
            <span className="font-medium">
              {breakdown.jurisdictionMultiplier > 1 ? '+' : ''}
              {Math.round((breakdown.jurisdictionMultiplier - 1) * 100)}%
            </span>
          </div>
        )}

        <Separator />

        <div className="flex justify-between text-base font-semibold">
          <span className="text-navy">Total</span>
          <span className="text-navy">{formatCurrency(breakdown.subtotal)}</span>
        </div>
      </CardContent>
    </Card>
  )
}
