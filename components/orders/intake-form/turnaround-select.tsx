'use client'

import { useOrderForm } from '@/hooks/use-order-form'
import { RUSH_OPTIONS, getMotionById } from '@/config/motion-types'
import { formatCurrency } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { CalendarIcon, Clock, AlertTriangle } from 'lucide-react'
import { format, addDays, isBefore, startOfDay } from 'date-fns'
import { cn } from '@/lib/utils'

export function TurnaroundSelect() {
  const {
    motionType,
    turnaround,
    filingDeadline,
    basePrice,
    rushSurcharge,
    totalPrice,
    updateField,
  } = useOrderForm()

  const motion = motionType ? getMotionById(motionType) : null
  const minDate = startOfDay(addDays(new Date(), 3)) // Minimum 3 days from now

  const handleDateSelect = (date: Date | undefined) => {
    updateField('filingDeadline', date || null)
  }

  const isTurnaroundFeasible = (option: string) => {
    if (!filingDeadline) return true

    const daysNeeded =
      option === 'rush_48' ? 2 : option === 'rush_72' ? 3 : 7

    const deadline = new Date(filingDeadline)
    const needed = addDays(new Date(), daysNeeded)

    return !isBefore(deadline, needed)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-navy">Turnaround & Deadline</h2>
        <p className="mt-1 text-gray-500">
          Select your turnaround time and filing deadline
        </p>
      </div>

      <div className="space-y-6">
        {/* Filing Deadline */}
        <div className="space-y-2">
          <Label>Filing Deadline *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal',
                  !filingDeadline && 'text-gray-400'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filingDeadline ? format(filingDeadline, 'PPP') : 'Select deadline'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filingDeadline || undefined}
                onSelect={handleDateSelect}
                disabled={(date) => isBefore(date, minDate)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <p className="text-xs text-gray-500">
            When must this motion be filed with the court?
          </p>
        </div>

        {/* Turnaround Selection */}
        <div className="space-y-2">
          <Label>Turnaround Time</Label>
          <RadioGroup
            value={turnaround}
            onValueChange={(value) =>
              updateField('turnaround', value as typeof turnaround)
            }
            className="space-y-3"
          >
            {RUSH_OPTIONS.map((option) => {
              const feasible = isTurnaroundFeasible(option.id)
              const price =
                basePrice !== null
                  ? Math.round(basePrice * option.multiplier)
                  : null

              return (
                <div key={option.id}>
                  <label
                    htmlFor={option.id}
                    className={cn(
                      'flex items-center justify-between rounded-lg border p-4 cursor-pointer transition-colors',
                      turnaround === option.id
                        ? 'border-teal bg-teal/5'
                        : 'border-gray-200 hover:border-gray-300',
                      !feasible && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <RadioGroupItem
                        value={option.id}
                        id={option.id}
                        disabled={!feasible}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-navy">
                            {option.name}
                          </span>
                          {option.multiplier > 1 && (
                            <span className="text-xs text-orange-600 font-medium">
                              {option.description}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {option.id === 'standard'
                            ? motion?.tierTurnaround || 'Standard processing'
                            : option.id === 'rush_72'
                            ? '72-hour delivery'
                            : '48-hour delivery'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {price !== null ? (
                        <span className="font-semibold text-navy">
                          {formatCurrency(price)}
                        </span>
                      ) : (
                        <span className="text-gray-500">Quote</span>
                      )}
                    </div>
                  </label>
                  {!feasible && filingDeadline && (
                    <div className="flex items-center gap-2 mt-1 ml-4 text-xs text-amber-600">
                      <AlertTriangle className="h-3 w-3" />
                      Not available for your deadline
                    </div>
                  )}
                </div>
              )
            })}
          </RadioGroup>
        </div>

        {/* Price Summary */}
        {basePrice !== null && (
          <Card className="bg-gray-50 border-gray-200">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Base Price</span>
                <span>{formatCurrency(basePrice)}</span>
              </div>
              {rushSurcharge > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Rush Surcharge</span>
                  <span className="text-orange-600">
                    +{formatCurrency(rushSurcharge)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <span className="font-semibold text-navy">Total</span>
                <span className="text-lg font-semibold text-navy">
                  {formatCurrency(totalPrice)}
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
