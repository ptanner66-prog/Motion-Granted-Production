'use client'

import { useOrderForm } from '@/hooks/use-order-form'
import { PARTY_ROLES } from '@/config/motion-types'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2 } from 'lucide-react'

export function PartiesForm() {
  const {
    parties,
    relatedEntities,
    addParty,
    removeParty,
    updateParty,
    updateField,
  } = useOrderForm()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-navy">Parties</h2>
        <p className="mt-1 text-gray-500">
          List all parties to this matter (used for conflicts checking)
        </p>
      </div>

      <div className="space-y-4">
        {/* Parties List */}
        <div className="space-y-3">
          {parties.map((party, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className="flex-1 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`party-name-${index}`}>
                    Name {index < 2 ? '*' : ''}
                  </Label>
                  <Input
                    id={`party-name-${index}`}
                    placeholder="Party name"
                    value={party.name}
                    onChange={(e) => updateParty(index, 'name', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`party-role-${index}`}>
                    Role {index < 2 ? '*' : ''}
                  </Label>
                  <Select
                    value={party.role}
                    onValueChange={(value) => updateParty(index, 'role', value)}
                  >
                    <SelectTrigger id={`party-role-${index}`}>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {PARTY_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {parties.length > 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-6 text-gray-400 hover:text-red-500"
                  onClick={() => removeParty(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addParty}
          className="w-full sm:w-auto"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Party
        </Button>

        {/* Related Entities */}
        <div className="space-y-2 pt-4">
          <Label htmlFor="related-entities">Related Entities (Optional)</Label>
          <Textarea
            id="related-entities"
            placeholder="List any related entities, corporations, or individuals that should be checked for conflicts..."
            value={relatedEntities}
            onChange={(e) => updateField('relatedEntities', e.target.value)}
            rows={3}
          />
          <p className="text-xs text-gray-500">
            Include parent companies, subsidiaries, or individuals closely connected to the parties
          </p>
        </div>
      </div>
    </div>
  )
}
