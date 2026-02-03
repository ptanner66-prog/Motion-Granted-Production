'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MOTION_TIERS, RUSH_OPTIONS } from '@/config/motion-types'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Clock, ArrowRight, Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function PricingTable() {
  const [selectedRush, setSelectedRush] = useState<'standard' | 'rush_72' | 'rush_48'>('standard')

  const rushMultiplier = RUSH_OPTIONS.find(r => r.id === selectedRush)?.multiplier || 1

  const calculatePrice = (price: number | null) => {
    if (price === null) return null
    return Math.round(price * rushMultiplier)
  }

  return (
    <div className="space-y-8">
      {/* Rush options */}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <span className="text-sm font-medium text-gray-700">Turnaround:</span>
        <div className="flex gap-2">
          {RUSH_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => setSelectedRush(option.id as typeof selectedRush)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                selectedRush === option.id
                  ? 'bg-navy text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {option.name}
              {option.multiplier > 1 && (
                <span className="ml-1 text-xs">({option.description})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Pricing tiers */}
      <Tabs defaultValue="tier1" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-8">
          {Object.entries(MOTION_TIERS).map(([key, tier]) => (
            <TabsTrigger key={key} value={key} className="text-xs sm:text-sm">
              {tier.name.split('—')[0].trim()}
            </TabsTrigger>
          ))}
        </TabsList>

        {Object.entries(MOTION_TIERS).map(([key, tier]) => (
          <TabsContent key={key} value={key}>
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              {/* Tier header */}
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-navy">{tier.name}</h3>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                      <Clock className="h-4 w-4" />
                      {tier.turnaround}
                    </div>
                  </div>
                  {selectedRush !== 'standard' && (
                    <Badge variant="warning">
                      Rush pricing applied
                    </Badge>
                  )}
                </div>
              </div>

              {/* Motion list */}
              <div className="divide-y divide-gray-100">
                {tier.motions.map((motion) => (
                  <div
                    key={motion.id}
                    className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-navy">{motion.name}</span>
                        {('description' in motion && motion.description) && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="h-4 w-4 text-gray-400" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{motion.description}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-semibold text-navy">
                        {motion.price !== null ? (
                          <>
                            {formatCurrency(calculatePrice(motion.price)!)}
                            {'priceMax' in motion && motion.priceMax && (
                              <span className="text-gray-500">
                                {' - '}{formatCurrency(calculatePrice(motion.priceMax as number)!)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-500">Contact for quote</span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* CTA */}
      <div className="text-center">
        <Button size="lg" asChild>
          <Link href="/register">
            Start Your Order
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </Button>
        <p className="mt-4 text-sm text-gray-500">
          Questions about pricing?{' '}
          <Link href="/contact" className="text-gold hover:underline">
            Contact us
          </Link>
        </p>
      </div>
    </div>
  )
}
