'use client'

import { useOrderForm } from '@/hooks/use-order-form'
import { MOTION_TIERS } from '@/config/motion-types'
import { formatCurrency } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Info } from 'lucide-react'

export function MotionSelect() {
  const { motionType, otherDescription, basePrice, updateField } = useOrderForm()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-navy">Select Your Motion</h2>
        <p className="mt-1 text-gray-500">
          Choose the type of motion you need drafted
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="motion-type">Motion Type</Label>
          <Select
            value={motionType}
            onValueChange={(value) => updateField('motionType', value)}
          >
            <SelectTrigger id="motion-type" className="w-full">
              <SelectValue placeholder="Select a motion type" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MOTION_TIERS).map(([tierKey, tier]) => (
                <SelectGroup key={tierKey}>
                  <SelectLabel className="text-navy font-semibold py-2">
                    {tier.name}
                    <span className="ml-2 font-normal text-gray-500 text-xs">
                      ({tier.turnaround})
                    </span>
                  </SelectLabel>
                  {tier.motions.map((motion) => (
                    <SelectItem key={motion.id} value={motion.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{motion.name}</span>
                        <span className="ml-4 text-gray-500">
                          {motion.price !== null
                            ? formatCurrency(motion.price)
                            : 'Quote'}
                          {('priceMax' in motion && typeof (motion as Record<string, unknown>).priceMax === 'number') ? (
                            <span> - {formatCurrency((motion as Record<string, unknown>).priceMax as number)}</span>
                          ) : null}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        {motionType === 'other' && (
          <div className="space-y-2">
            <Label htmlFor="other-description">Describe the Motion</Label>
            <Textarea
              id="other-description"
              placeholder="Please describe the motion you need drafted..."
              value={otherDescription}
              onChange={(e) => updateField('otherDescription', e.target.value)}
              rows={4}
            />
          </div>
        )}

        {/* Price Display */}
        {motionType && (
          <Card className="bg-gray-50 border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">Base Price</span>
                </div>
                <span className="text-lg font-semibold text-navy">
                  {basePrice !== null ? formatCurrency(basePrice) : 'Quote Required'}
                </span>
              </div>
              {basePrice !== null && (
                <p className="mt-2 text-xs text-gray-500">
                  Rush delivery available at additional cost (see next step)
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
