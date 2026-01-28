'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ArrowLeft,
  DollarSign,
  Clock,
  Save,
  FileText,
  Zap,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { MOTION_TIERS, RUSH_OPTIONS } from '@/config/motion-types'

export default function PricingSettingsPage() {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  // Rush multipliers
  const [rushMultipliers, setRushMultipliers] = useState({
    standard: 1,
    rush_72: 1.25,
    rush_48: 1.5,
  })

  const handleSave = async () => {
    setSaving(true)
    await new Promise(resolve => setTimeout(resolve, 500))
    toast({
      title: 'Settings saved',
      description: 'Pricing configuration has been updated.',
    })
    setSaving(false)
  }

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return 'Quote'
    return `$${amount.toLocaleString()}`
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Back button */}
      <Link
        href="/admin/settings"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-teal mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Settings
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight">Pricing Configuration</h1>
        <p className="text-gray-500 mt-1">Manage motion types and pricing tiers</p>
      </div>

      <div className="space-y-6">
        {/* Rush Multipliers */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-orange-500/20 p-2 rounded-lg">
                <Zap className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-navy">Rush Multipliers</CardTitle>
                <CardDescription className="text-gray-400">Set pricing multipliers for rush orders</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="p-4 bg-gray-50 rounded-lg">
                <Label className="text-gray-600 text-sm">Standard</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    type="number"
                    step="0.05"
                    value={rushMultipliers.standard}
                    onChange={(e) => setRushMultipliers(r => ({ ...r, standard: parseFloat(e.target.value) }))}
                    className="border-gray-200"
                  />
                  <span className="text-gray-500">x</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Base price</p>
              </div>
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <Label className="text-amber-700 text-sm">Rush 72 Hours</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    type="number"
                    step="0.05"
                    value={rushMultipliers.rush_72}
                    onChange={(e) => setRushMultipliers(r => ({ ...r, rush_72: parseFloat(e.target.value) }))}
                    className="border-amber-200"
                  />
                  <span className="text-amber-600">x</span>
                </div>
                <p className="text-xs text-amber-600 mt-1">+{((rushMultipliers.rush_72 - 1) * 100).toFixed(0)}% surcharge</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <Label className="text-red-700 text-sm">Rush 48 Hours</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    type="number"
                    step="0.05"
                    value={rushMultipliers.rush_48}
                    onChange={(e) => setRushMultipliers(r => ({ ...r, rush_48: parseFloat(e.target.value) }))}
                    className="border-red-200"
                  />
                  <span className="text-red-600">x</span>
                </div>
                <p className="text-xs text-red-600 mt-1">+{((rushMultipliers.rush_48 - 1) * 100).toFixed(0)}% surcharge</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tier A Motions */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500/20 p-2 rounded-lg">
                <FileText className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-navy">{MOTION_TIERS.tierA.name}</CardTitle>
                <CardDescription className="text-gray-400">{MOTION_TIERS.tierA.turnaround}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {MOTION_TIERS.tierA.motions.map((motion) => (
                <div key={motion.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-navy font-medium">{motion.name}</span>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-gray-400" />
                    <Input
                      type="number"
                      defaultValue={motion.price || ''}
                      placeholder="Quote"
                      className="w-24 border-gray-200 text-right"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tier B Motions */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/20 p-2 rounded-lg">
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-navy">{MOTION_TIERS.tierB.name}</CardTitle>
                <CardDescription className="text-gray-400">{MOTION_TIERS.tierB.turnaround}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {MOTION_TIERS.tierB.motions.map((motion) => (
                <div key={motion.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-navy font-medium">{motion.name}</span>
                    {'description' in motion && motion.description && (
                      <p className="text-xs text-gray-400">{motion.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-gray-400" />
                    <Input
                      type="number"
                      defaultValue={motion.price || ''}
                      placeholder="Quote"
                      className="w-24 border-gray-200 text-right"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tier C Motions */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-purple-500/20 p-2 rounded-lg">
                <FileText className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-navy">{MOTION_TIERS.tierC.name}</CardTitle>
                <CardDescription className="text-gray-400">{MOTION_TIERS.tierC.turnaround}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {MOTION_TIERS.tierC.motions.map((motion) => (
                <div key={motion.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-navy font-medium">{motion.name}</span>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-gray-400" />
                    <Input
                      type="number"
                      defaultValue={motion.price || ''}
                      placeholder="Quote"
                      className="w-24 border-gray-200 text-right"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="btn-premium gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Pricing'}
          </Button>
        </div>
      </div>
    </div>
  )
}
