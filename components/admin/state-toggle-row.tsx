'use client'

import { useState } from 'react'
import { AlertTriangle, Settings, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { MOTION_TIERS } from '@/config/motion-types'

export interface StateData {
  code: string
  name: string
  circuit: string
  enabled: boolean
  orderCount: number
  supportedMotionTypes: string[]
  hasConfig: boolean
}

interface StateToggleRowProps {
  state: StateData
  onToggle: (stateCode: string, enabled: boolean, motionTypes?: string[]) => Promise<void>
  className?: string
}

const ALL_MOTION_TYPE_IDS = [
  ...MOTION_TIERS.tierA.motions.map((m) => m.id),
  ...MOTION_TIERS.tierB.motions.map((m) => m.id),
  ...MOTION_TIERS.tierC.motions.map((m) => m.id),
]

function getMotionName(id: string): string {
  for (const tier of Object.values(MOTION_TIERS)) {
    const motion = tier.motions.find((m) => m.id === id)
    if (motion) return motion.name
  }
  return id
}

export function StateToggleRow({
  state,
  onToggle,
  className,
}: StateToggleRowProps) {
  const [isEnableDialogOpen, setIsEnableDialogOpen] = useState(false)
  const [isManageOpen, setIsManageOpen] = useState(false)
  const [selectedMotionTypes, setSelectedMotionTypes] = useState<string[]>(
    state.supportedMotionTypes
  )
  const [isLoading, setIsLoading] = useState(false)

  const handleToggle = async (checked: boolean) => {
    if (checked && !state.enabled) {
      // Opening enable dialog - pre-select all motion types
      setSelectedMotionTypes(ALL_MOTION_TYPE_IDS)
      setIsEnableDialogOpen(true)
      return
    }

    if (!checked && state.enabled) {
      // Disable state
      setIsLoading(true)
      try {
        await onToggle(state.code, false)
      } finally {
        setIsLoading(false)
      }
    }
  }

  const handleConfirmEnable = async () => {
    if (selectedMotionTypes.length === 0) return

    setIsLoading(true)
    try {
      await onToggle(state.code, true, selectedMotionTypes)
      setIsEnableDialogOpen(false)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleMotionType = (id: string) => {
    setSelectedMotionTypes((prev) =>
      prev.includes(id)
        ? prev.filter((t) => t !== id)
        : [...prev, id]
    )
  }

  return (
    <>
      <tr className={cn('border-b border-gray-100 hover:bg-gray-50/50 transition-colors', className)}>
        {/* State */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                state.enabled ? 'bg-emerald-500' : 'bg-gray-300'
              )}
            />
            <span className="font-semibold text-sm text-navy">{state.code}</span>
            <span className="text-sm text-gray-500">{state.name}</span>
            {!state.hasConfig && (
              <span title="Configuration file missing">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              </span>
            )}
          </div>
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          {state.enabled ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="secondary">Disabled</Badge>
          )}
        </td>

        {/* Circuit */}
        <td className="px-4 py-3 text-sm text-gray-600">{state.circuit}</td>

        {/* Orders */}
        <td className="px-4 py-3 text-sm text-gray-600">
          {state.enabled ? state.orderCount : '\u2014'}
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={state.enabled}
              onCheckedChange={handleToggle}
              disabled={isLoading}
            />
            {state.enabled && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsManageOpen(!isManageOpen)}
                className="gap-1"
              >
                <Settings className="h-3.5 w-3.5" />
                Manage
                <ChevronDown
                  className={cn(
                    'h-3 w-3 transition-transform',
                    isManageOpen && 'rotate-180'
                  )}
                />
              </Button>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded manage row */}
      {isManageOpen && state.enabled && (
        <tr className="border-b border-gray-100 bg-gray-50/50">
          <td colSpan={5} className="px-4 py-4">
            <div className="pl-7">
              <p className="text-xs font-medium text-gray-500 mb-2">
                Supported Motion Types ({state.supportedMotionTypes.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {state.supportedMotionTypes.map((typeId) => (
                  <Badge key={typeId} variant="outline" className="text-[10px]">
                    {getMotionName(typeId)}
                  </Badge>
                ))}
                {state.supportedMotionTypes.length === 0 && (
                  <span className="text-xs text-gray-400">
                    No motion types configured
                  </span>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}

      {/* Enable dialog */}
      <Dialog open={isEnableDialogOpen} onOpenChange={setIsEnableDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Enable {state.name} ({state.code})
            </DialogTitle>
            <DialogDescription>
              Select which motion types to support for {state.name}. Orders from
              this jurisdiction will begin being accepted.
            </DialogDescription>
          </DialogHeader>

          {!state.hasConfig && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Formatting configuration file is missing for this state. Some
              formatting features may not work correctly.
            </div>
          )}

          <div className="space-y-4">
            {Object.entries(MOTION_TIERS).map(([tierId, tier]) => {
              if (tierId === 'other') return null
              const tierLabel = tierId === 'tierA' ? 'Tier A' : tierId === 'tierB' ? 'Tier B' : 'Tier C'

              return (
                <div key={tierId}>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">
                    {tierLabel} &mdash; {tier.name.split(' \u2014 ')[1] ?? tier.name}
                  </p>
                  <div className="space-y-1">
                    {tier.motions.map((motion) => (
                      <label
                        key={motion.id}
                        className="flex items-center gap-2 rounded px-2 py-1 hover:bg-gray-100 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedMotionTypes.includes(motion.id)}
                          onCheckedChange={() => toggleMotionType(motion.id)}
                        />
                        <span className="text-sm text-gray-700">{motion.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEnableDialogOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmEnable}
              disabled={isLoading || selectedMotionTypes.length === 0}
              className="gap-2"
            >
              {isLoading ? 'Enabling...' : `Enable ${state.code}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
