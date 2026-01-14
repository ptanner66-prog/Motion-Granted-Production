'use client'

import { useOrderForm } from '@/hooks/use-order-form'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function CaseSummary() {
  const { statementOfFacts, proceduralHistory, updateField } = useOrderForm()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-navy">Case Summary</h2>
        <p className="mt-1 text-gray-500">
          Provide a summary of the facts and procedural history
        </p>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="statement-of-facts">Statement of Facts *</Label>
            <span className="text-xs text-gray-500">
              {statementOfFacts.length} / 200 min characters
            </span>
          </div>
          <Textarea
            id="statement-of-facts"
            placeholder="Describe the relevant facts of the case. Include dates, events, parties involved, and any facts critical to the motion. Be as detailed as possible to ensure accurate drafting."
            value={statementOfFacts}
            onChange={(e) => updateField('statementOfFacts', e.target.value)}
            rows={8}
            className={
              statementOfFacts.length > 0 && statementOfFacts.length < 200
                ? 'border-amber-300 focus:border-amber-400'
                : ''
            }
          />
          {statementOfFacts.length > 0 && statementOfFacts.length < 200 && (
            <p className="text-xs text-amber-600">
              Please provide at least 200 characters for an adequate statement of facts
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="procedural-history">Procedural History *</Label>
            <span className="text-xs text-gray-500">
              {proceduralHistory.length} / 100 min characters
            </span>
          </div>
          <Textarea
            id="procedural-history"
            placeholder="Describe the procedural history of the case. Include filing dates, answers, motions already filed, discovery status, trial dates, etc."
            value={proceduralHistory}
            onChange={(e) => updateField('proceduralHistory', e.target.value)}
            rows={6}
            className={
              proceduralHistory.length > 0 && proceduralHistory.length < 100
                ? 'border-amber-300 focus:border-amber-400'
                : ''
            }
          />
          {proceduralHistory.length > 0 && proceduralHistory.length < 100 && (
            <p className="text-xs text-amber-600">
              Please provide at least 100 characters for procedural history
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
