'use client'

import { useState, useMemo } from 'react'
import { Search, Filter, ArrowUpDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { StateToggleRow, type StateData } from '@/components/admin/state-toggle-row'
import { useToast } from '@/hooks/use-toast'

// ==========================================================================
// US States + DC with Federal Circuit assignments
// ==========================================================================

const US_STATES: Omit<StateData, 'enabled' | 'orderCount' | 'supportedMotionTypes' | 'hasConfig'>[] = [
  { code: 'AL', name: 'Alabama', circuit: '11th' },
  { code: 'AK', name: 'Alaska', circuit: '9th' },
  { code: 'AZ', name: 'Arizona', circuit: '9th' },
  { code: 'AR', name: 'Arkansas', circuit: '8th' },
  { code: 'CA', name: 'California', circuit: '9th' },
  { code: 'CO', name: 'Colorado', circuit: '10th' },
  { code: 'CT', name: 'Connecticut', circuit: '2nd' },
  { code: 'DE', name: 'Delaware', circuit: '3rd' },
  { code: 'DC', name: 'District of Columbia', circuit: 'DC' },
  { code: 'FL', name: 'Florida', circuit: '11th' },
  { code: 'GA', name: 'Georgia', circuit: '11th' },
  { code: 'HI', name: 'Hawaii', circuit: '9th' },
  { code: 'ID', name: 'Idaho', circuit: '9th' },
  { code: 'IL', name: 'Illinois', circuit: '7th' },
  { code: 'IN', name: 'Indiana', circuit: '7th' },
  { code: 'IA', name: 'Iowa', circuit: '8th' },
  { code: 'KS', name: 'Kansas', circuit: '10th' },
  { code: 'KY', name: 'Kentucky', circuit: '6th' },
  { code: 'LA', name: 'Louisiana', circuit: '5th' },
  { code: 'ME', name: 'Maine', circuit: '1st' },
  { code: 'MD', name: 'Maryland', circuit: '4th' },
  { code: 'MA', name: 'Massachusetts', circuit: '1st' },
  { code: 'MI', name: 'Michigan', circuit: '6th' },
  { code: 'MN', name: 'Minnesota', circuit: '8th' },
  { code: 'MS', name: 'Mississippi', circuit: '5th' },
  { code: 'MO', name: 'Missouri', circuit: '8th' },
  { code: 'MT', name: 'Montana', circuit: '9th' },
  { code: 'NE', name: 'Nebraska', circuit: '8th' },
  { code: 'NV', name: 'Nevada', circuit: '9th' },
  { code: 'NH', name: 'New Hampshire', circuit: '1st' },
  { code: 'NJ', name: 'New Jersey', circuit: '3rd' },
  { code: 'NM', name: 'New Mexico', circuit: '10th' },
  { code: 'NY', name: 'New York', circuit: '2nd' },
  { code: 'NC', name: 'North Carolina', circuit: '4th' },
  { code: 'ND', name: 'North Dakota', circuit: '8th' },
  { code: 'OH', name: 'Ohio', circuit: '6th' },
  { code: 'OK', name: 'Oklahoma', circuit: '10th' },
  { code: 'OR', name: 'Oregon', circuit: '9th' },
  { code: 'PA', name: 'Pennsylvania', circuit: '3rd' },
  { code: 'RI', name: 'Rhode Island', circuit: '1st' },
  { code: 'SC', name: 'South Carolina', circuit: '4th' },
  { code: 'SD', name: 'South Dakota', circuit: '8th' },
  { code: 'TN', name: 'Tennessee', circuit: '6th' },
  { code: 'TX', name: 'Texas', circuit: '5th' },
  { code: 'UT', name: 'Utah', circuit: '10th' },
  { code: 'VT', name: 'Vermont', circuit: '2nd' },
  { code: 'VA', name: 'Virginia', circuit: '4th' },
  { code: 'WA', name: 'Washington', circuit: '9th' },
  { code: 'WV', name: 'West Virginia', circuit: '4th' },
  { code: 'WI', name: 'Wisconsin', circuit: '7th' },
  { code: 'WY', name: 'Wyoming', circuit: '10th' },
]

// Louisiana is the only initially enabled state
const DEFAULT_ENABLED_STATES = new Set(['LA'])

type SortKey = 'code' | 'name' | 'circuit' | 'enabled'
type SortDir = 'asc' | 'desc'
type FilterMode = 'all' | 'enabled' | 'disabled'

export default function JurisdictionsPage() {
  const { toast } = useToast()

  // State management — in production, this would be fetched from the API on mount
  const [states, setStates] = useState<StateData[]>(() =>
    US_STATES.map((s) => ({
      ...s,
      enabled: DEFAULT_ENABLED_STATES.has(s.code),
      orderCount: 0,
      supportedMotionTypes: DEFAULT_ENABLED_STATES.has(s.code)
        ? [
            'compel_discovery',
            'protective_order',
            'declinatory',
            'dilatory',
            'peremptory_cause',
            'peremptory_right',
            'peremptory_prescription',
            'peremptory_res_judicata',
            'continue',
            'extend_deadline',
            'withdraw_counsel',
          ]
        : [],
      hasConfig: DEFAULT_ENABLED_STATES.has(s.code),
    }))
  )

  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [sortKey, setSortKey] = useState<SortKey>('code')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const enabledCount = states.filter((s) => s.enabled).length

  // Sort and filter
  const filteredStates = useMemo(() => {
    let result = [...states]

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (s) =>
          s.code.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.circuit.toLowerCase().includes(q)
      )
    }

    // Enabled/disabled filter
    if (filterMode === 'enabled') {
      result = result.filter((s) => s.enabled)
    } else if (filterMode === 'disabled') {
      result = result.filter((s) => !s.enabled)
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'code':
          cmp = a.code.localeCompare(b.code)
          break
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'circuit':
          cmp = a.circuit.localeCompare(b.circuit)
          break
        case 'enabled':
          cmp = Number(b.enabled) - Number(a.enabled)
          break
      }
      return sortDir === 'desc' ? -cmp : cmp
    })

    return result
  }, [states, search, filterMode, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const handleToggle = async (
    stateCode: string,
    enabled: boolean,
    motionTypes?: string[]
  ) => {
    try {
      const response = await fetch('/api/admin/states', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stateCode,
          enabled,
          motionTypes: motionTypes ?? [],
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'Failed to update state')
      }

      // Update local state
      setStates((prev) =>
        prev.map((s) =>
          s.code === stateCode
            ? {
                ...s,
                enabled,
                supportedMotionTypes: motionTypes ?? s.supportedMotionTypes,
              }
            : s
        )
      )

      const stateName = states.find((s) => s.code === stateCode)?.name ?? stateCode

      toast({
        title: enabled ? 'State Enabled' : 'State Disabled',
        description: enabled
          ? `${stateName} is now accepting orders.`
          : `${stateName} has been disabled.`,
      })
    } catch (err) {
      toast({
        title: 'Error',
        description:
          err instanceof Error ? err.message : 'Failed to update state',
        variant: 'destructive',
      })
      throw err
    }
  }

  const SortButton = ({
    label,
    sortKeyValue,
  }: {
    label: string
    sortKeyValue: SortKey
  }) => (
    <button
      type="button"
      onClick={() => handleSort(sortKeyValue)}
      className={cn(
        'flex items-center gap-1 text-xs font-medium',
        sortKey === sortKeyValue
          ? 'text-navy'
          : 'text-gray-500 hover:text-navy'
      )}
    >
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy tracking-tight sm:text-3xl">
          Jurisdiction Management
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage which states accept orders. Currently{' '}
          <strong>{enabledCount}</strong> of {states.length} jurisdictions enabled.
        </p>
      </div>

      {/* Toolbar */}
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search states..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-0.5">
              {(['all', 'enabled', 'disabled'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFilterMode(mode)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    filterMode === mode
                      ? 'bg-navy text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <Badge variant="info">
            {enabledCount}/{states.length} Enabled
          </Badge>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="px-4 py-3 text-left">
                  <SortButton label="State" sortKeyValue="code" />
                </th>
                <th className="px-4 py-3 text-left">
                  <SortButton label="Status" sortKeyValue="enabled" />
                </th>
                <th className="px-4 py-3 text-left">
                  <SortButton label="Circuit" sortKeyValue="circuit" />
                </th>
                <th className="px-4 py-3 text-left">
                  <span className="text-xs font-medium text-gray-500">Orders</span>
                </th>
                <th className="px-4 py-3 text-left">
                  <span className="text-xs font-medium text-gray-500">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStates.map((state) => (
                <StateToggleRow
                  key={state.code}
                  state={state}
                  onToggle={handleToggle}
                />
              ))}
              {filteredStates.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-sm text-gray-500"
                  >
                    No states match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Config warning */}
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 flex items-start gap-2">
        <Filter className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <p>
          Enabling a state requires a formatting configuration in{' '}
          <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[10px]">
            data/formatting/configs/states/
          </code>
          . If the config is missing, the state row will show a warning icon and some formatting
          features may not work correctly.
        </p>
      </div>
    </div>
  )
}
