'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  MapPin,
  RefreshCw,
  Search,
  Globe,
  Building2,
  DollarSign,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ============================================================================
// Federal circuit lookup — mirrors lib/admin/state-toggle.ts STATE_METADATA
// ============================================================================

const CIRCUIT_MAP: Record<string, { circuit: string; districts: string[] }> = {
  AL: { circuit: '11th', districts: ['N.D. Ala.', 'M.D. Ala.', 'S.D. Ala.'] },
  AK: { circuit: '9th', districts: ['D. Alaska'] },
  AZ: { circuit: '9th', districts: ['D. Ariz.'] },
  AR: { circuit: '8th', districts: ['E.D. Ark.', 'W.D. Ark.'] },
  CA: { circuit: '9th', districts: ['N.D. Cal.', 'E.D. Cal.', 'C.D. Cal.', 'S.D. Cal.'] },
  CO: { circuit: '10th', districts: ['D. Colo.'] },
  CT: { circuit: '2nd', districts: ['D. Conn.'] },
  DE: { circuit: '3rd', districts: ['D. Del.'] },
  DC: { circuit: 'D.C.', districts: ['D.D.C.'] },
  FL: { circuit: '11th', districts: ['N.D. Fla.', 'M.D. Fla.', 'S.D. Fla.'] },
  GA: { circuit: '11th', districts: ['N.D. Ga.', 'M.D. Ga.', 'S.D. Ga.'] },
  HI: { circuit: '9th', districts: ['D. Haw.'] },
  ID: { circuit: '9th', districts: ['D. Idaho'] },
  IL: { circuit: '7th', districts: ['N.D. Ill.', 'C.D. Ill.', 'S.D. Ill.'] },
  IN: { circuit: '7th', districts: ['N.D. Ind.', 'S.D. Ind.'] },
  IA: { circuit: '8th', districts: ['N.D. Iowa', 'S.D. Iowa'] },
  KS: { circuit: '10th', districts: ['D. Kan.'] },
  KY: { circuit: '6th', districts: ['E.D. Ky.', 'W.D. Ky.'] },
  LA: { circuit: '5th', districts: ['E.D. La.', 'M.D. La.', 'W.D. La.'] },
  ME: { circuit: '1st', districts: ['D. Me.'] },
  MD: { circuit: '4th', districts: ['D. Md.'] },
  MA: { circuit: '1st', districts: ['D. Mass.'] },
  MI: { circuit: '6th', districts: ['E.D. Mich.', 'W.D. Mich.'] },
  MN: { circuit: '8th', districts: ['D. Minn.'] },
  MS: { circuit: '5th', districts: ['N.D. Miss.', 'S.D. Miss.'] },
  MO: { circuit: '8th', districts: ['E.D. Mo.', 'W.D. Mo.'] },
  MT: { circuit: '9th', districts: ['D. Mont.'] },
  NE: { circuit: '8th', districts: ['D. Neb.'] },
  NV: { circuit: '9th', districts: ['D. Nev.'] },
  NH: { circuit: '1st', districts: ['D.N.H.'] },
  NJ: { circuit: '3rd', districts: ['D.N.J.'] },
  NM: { circuit: '10th', districts: ['D.N.M.'] },
  NY: { circuit: '2nd', districts: ['N.D.N.Y.', 'S.D.N.Y.', 'E.D.N.Y.', 'W.D.N.Y.'] },
  NC: { circuit: '4th', districts: ['E.D.N.C.', 'M.D.N.C.', 'W.D.N.C.'] },
  ND: { circuit: '8th', districts: ['D.N.D.'] },
  OH: { circuit: '6th', districts: ['N.D. Ohio', 'S.D. Ohio'] },
  OK: { circuit: '10th', districts: ['N.D. Okla.', 'E.D. Okla.', 'W.D. Okla.'] },
  OR: { circuit: '9th', districts: ['D. Or.'] },
  PA: { circuit: '3rd', districts: ['E.D. Pa.', 'M.D. Pa.', 'W.D. Pa.'] },
  RI: { circuit: '1st', districts: ['D.R.I.'] },
  SC: { circuit: '4th', districts: ['D.S.C.'] },
  SD: { circuit: '8th', districts: ['D.S.D.'] },
  TN: { circuit: '6th', districts: ['E.D. Tenn.', 'M.D. Tenn.', 'W.D. Tenn.'] },
  TX: { circuit: '5th', districts: ['N.D. Tex.', 'S.D. Tex.', 'E.D. Tex.', 'W.D. Tex.'] },
  UT: { circuit: '10th', districts: ['D. Utah'] },
  VT: { circuit: '2nd', districts: ['D. Vt.'] },
  VA: { circuit: '4th', districts: ['E.D. Va.', 'W.D. Va.'] },
  WA: { circuit: '9th', districts: ['E.D. Wash.', 'W.D. Wash.'] },
  WV: { circuit: '4th', districts: ['N.D.W. Va.', 'S.D.W. Va.'] },
  WI: { circuit: '7th', districts: ['E.D. Wis.', 'W.D. Wis.'] },
  WY: { circuit: '10th', districts: ['D. Wyo.'] },
}

const LAUNCH_STATES = new Set(['LA', 'CA'])

// ============================================================================
// Types — mapped from API response (lib/admin/state-toggle.ts StateToggleConfig)
// ============================================================================

interface StateDisplay {
  stateCode: string
  stateName: string
  enabled: boolean
  acceptingOrders: boolean
  circuit: string
  districts: string[]
  supportedMotionTypes: string[]
  notes?: string
  enabledAt?: string
  enabledBy?: string
}

export default function AdminStatesPage() {
  const { toast } = useToast()
  const [states, setStates] = useState<StateDisplay[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [updatingStates, setUpdatingStates] = useState<Set<string>>(new Set())

  const fetchStates = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/states')
      if (!response.ok) {
        throw new Error('Failed to fetch states')
      }
      const data = await response.json()
      const apiStates = (data.states || []) as Array<{
        stateCode: string
        stateName: string
        enabled: boolean
        acceptingOrders: boolean
        supportedMotionTypes: string[]
        notes?: string
        enabledAt?: string
        enabledBy?: string
      }>

      // Merge API response with client-side circuit metadata
      const merged: StateDisplay[] = apiStates.map((s) => {
        const meta = CIRCUIT_MAP[s.stateCode]
        return {
          ...s,
          circuit: meta?.circuit || '',
          districts: meta?.districts || [],
        }
      })

      setStates(merged)
    } catch (err) {
      console.error('Error fetching states:', err)
      setError('Failed to load states. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStates()
  }, [fetchStates])

  const handleToggle = async (stateCode: string, enabled: boolean) => {
    setUpdatingStates((prev) => new Set(prev).add(stateCode))

    try {
      const response = await fetch('/api/admin/states', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stateCode, enabled }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'Update failed')
      }

      // Update local state
      setStates((prev) =>
        prev.map((s) =>
          s.stateCode === stateCode
            ? { ...s, enabled, acceptingOrders: enabled }
            : s
        )
      )

      const stateName = states.find((s) => s.stateCode === stateCode)?.stateName ?? stateCode

      toast({
        title: enabled ? 'State Enabled' : 'State Disabled',
        description: enabled
          ? `${stateName} is now accepting orders.`
          : `${stateName} has been disabled.`,
      })
    } catch (err) {
      console.error(`Error updating state ${stateCode}:`, err)
      toast({
        title: 'Error',
        description:
          err instanceof Error ? err.message : 'Failed to update state',
        variant: 'destructive',
      })
    } finally {
      setUpdatingStates((prev) => {
        const next = new Set(prev)
        next.delete(stateCode)
        return next
      })
    }
  }

  // Filter and search
  const filteredStates = states.filter((state) => {
    const searchLower = searchQuery.toLowerCase()
    const matchesSearch =
      state.stateName.toLowerCase().includes(searchLower) ||
      state.stateCode.toLowerCase().includes(searchLower) ||
      state.circuit.toLowerCase().includes(searchLower)

    if (!matchesSearch) return false
    if (filter === 'enabled') return state.enabled
    if (filter === 'disabled') return !state.enabled
    return true
  })

  const enabledCount = states.filter((s) => s.enabled).length
  const disabledCount = states.filter((s) => !s.enabled).length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-teal" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal/10 rounded-lg">
              <MapPin className="w-6 h-6 text-teal" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-navy">State Management</h1>
              <p className="text-gray-500 text-sm">
                Toggle states to enable customer orders from that jurisdiction
              </p>
            </div>
          </div>
          <button
            onClick={fetchStates}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-navy hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-4 mt-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 rounded-full">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700">
              {enabledCount} Enabled
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full">
            <XCircle className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-600">
              {disabledCount} Disabled
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Search and Filter */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by state name, code, or circuit..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
        >
          <option value="all">All States</option>
          <option value="enabled">Enabled Only</option>
          <option value="disabled">Disabled Only</option>
        </select>
      </div>

      {/* States Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                State
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                <div className="flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  Federal Circuit
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                <div className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  Accepting Orders
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                <div className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Multiplier
                </div>
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Enabled
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredStates.map((state) => (
              <StateRow
                key={state.stateCode}
                state={state}
                isUpdating={updatingStates.has(state.stateCode)}
                onToggleEnabled={(enabled) =>
                  handleToggle(state.stateCode, enabled)
                }
              />
            ))}
          </tbody>
        </table>

        {filteredStates.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No states match your search criteria.
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Individual state row
// ============================================================================

interface StateRowProps {
  state: StateDisplay
  isUpdating: boolean
  onToggleEnabled: (enabled: boolean) => Promise<void>
}

function StateRow({ state, isUpdating, onToggleEnabled }: StateRowProps) {
  const isLaunchState = LAUNCH_STATES.has(state.stateCode)

  return (
    <tr
      className={`hover:bg-gray-50 transition-colors ${
        isLaunchState ? 'bg-teal/5' : ''
      }`}
    >
      {/* State Name */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-lg text-xs font-bold text-gray-600">
            {state.stateCode}
          </span>
          <div>
            <div className="font-medium text-navy">
              {state.stateName}
              {isLaunchState && (
                <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold bg-teal text-white rounded">
                  LAUNCH
                </span>
              )}
            </div>
            {state.notes && (
              <div className="text-xs text-gray-400">{state.notes}</div>
            )}
          </div>
        </div>
      </td>

      {/* Federal Circuit */}
      <td className="px-4 py-3">
        <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded">
          {state.circuit} Cir.
        </span>
      </td>

      {/* Accepting Orders */}
      <td className="px-4 py-3">
        {state.enabled ? (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm text-emerald-700">Yes</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-gray-300" />
            <span className="text-sm text-gray-500">No</span>
          </span>
        )}
      </td>

      {/* Pricing Multiplier */}
      <td className="px-4 py-3">
        <span className="px-2 py-1 text-sm font-mono bg-gray-100 text-gray-600 rounded">
          1.00x
        </span>
      </td>

      {/* Enabled Toggle */}
      <td className="px-4 py-3 text-center">
        <button
          onClick={() => onToggleEnabled(!state.enabled)}
          disabled={isUpdating}
          className={`
            relative inline-flex w-12 h-6 rounded-full transition-colors
            ${state.enabled ? 'bg-emerald-500' : 'bg-gray-300'}
            ${isUpdating ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
          `}
        >
          {isUpdating ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            </span>
          ) : (
            <span
              className={`
                absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
                ${state.enabled ? 'translate-x-6' : ''}
              `}
            />
          )}
        </button>
      </td>
    </tr>
  )
}
