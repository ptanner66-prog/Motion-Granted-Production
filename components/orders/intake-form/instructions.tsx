'use client'

import { useOrderForm } from '@/hooks/use-order-form'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertCircle } from 'lucide-react'

export function Instructions() {
  const { instructions, updateField } = useOrderForm()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-navy">Drafting Instructions</h2>
        <p className="mt-1 text-gray-500">
          Tell us what you want this motion to accomplish
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Important</p>
              <p className="mt-1">
                Your instructions guide our drafting. Please be specific about:
              </p>
              <ul className="mt-2 list-disc list-inside space-y-1">
                <li>The legal arguments you want us to make</li>
                <li>Key cases or statutes to cite (if known)</li>
                <li>Any facts to emphasize or avoid</li>
                <li>The outcome you&apos;re seeking</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="instructions">Your Instructions *</Label>
            <span className="text-xs text-gray-500">
              {instructions.length} / 100 min characters
            </span>
          </div>
          <Textarea
            id="instructions"
            placeholder="Provide your drafting instructions here. What arguments do you want us to make? What legal theories should we pursue? Are there specific cases or statutes we should cite? What is the desired outcome?

Example: 'Please draft a motion for summary judgment arguing that there are no genuine issues of material fact regarding plaintiff's negligence claim. Focus on the lack of evidence showing defendant breached any duty. Cite Louisiana Civil Code articles on negligence and relevant jurisprudence from the First Circuit. Emphasize the deposition testimony from plaintiff admitting he did not see how the accident occurred.'"
            value={instructions}
            onChange={(e) => updateField('instructions', e.target.value)}
            rows={12}
            className={
              instructions.length > 0 && instructions.length < 100
                ? 'border-amber-300 focus:border-amber-400'
                : ''
            }
          />
          {instructions.length > 0 && instructions.length < 100 && (
            <p className="text-xs text-amber-600">
              Please provide at least 100 characters of instructions
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
