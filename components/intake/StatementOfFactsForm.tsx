/**
 * Statement of Facts Form Component
 *
 * v6.3: Fourth step - statement of facts and procedural history.
 */

'use client';

import React, { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useIntakeForm } from '@/lib/intake/context';
import { FormSection } from './shared/FormSection';
import { FieldLabel } from './shared/FieldLabel';
import { ValidationMessage } from './shared/ValidationMessage';
import { CharacterCounter } from './character-counter';
import { Plus, Trash2, Calendar } from 'lucide-react';

const schema = z.object({
  statementOfFacts: z
    .string()
    .min(500, 'Statement of facts must be at least 500 characters'),
  proceduralHistory: z
    .string()
    .min(200, 'Procedural history must be at least 200 characters'),
  keyDates: z.array(
    z.object({
      id: z.string(),
      description: z.string().min(1, 'Description required'),
      date: z.string().min(1, 'Date required'),
    })
  ),
});

type FormData = z.infer<typeof schema>;

export function StatementOfFactsForm() {
  const { formData, updateFormData, setCanProceed } = useIntakeForm();

  const {
    register,
    control,
    watch,
    formState: { errors, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      statementOfFacts: formData.statementOfFacts || '',
      proceduralHistory: formData.proceduralHistory || '',
      keyDates: formData.keyDates?.map((kd) => ({
        id: kd.id,
        description: kd.description,
        date: kd.date instanceof Date ? kd.date.toISOString().split('T')[0] : '',
      })) || [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'keyDates',
  });

  const watchedValues = watch();
  const statementLength = watchedValues.statementOfFacts?.length || 0;
  const historyLength = watchedValues.proceduralHistory?.length || 0;

  useEffect(() => {
    updateFormData({
      statementOfFacts: watchedValues.statementOfFacts,
      proceduralHistory: watchedValues.proceduralHistory,
      keyDates: watchedValues.keyDates?.map((kd) => ({
        id: kd.id,
        description: kd.description,
        date: kd.date ? new Date(kd.date) : new Date(),
      })),
    });
    setCanProceed(isValid);
  }, [watchedValues, isValid, updateFormData, setCanProceed]);

  const addKeyDate = () => {
    append({
      id: `date-${Date.now()}`,
      description: '',
      date: '',
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Statement of Facts</h2>
        <p className="mt-2 text-gray-600">
          Provide the factual background for your motion
        </p>
      </div>

      {/* Statement of Facts */}
      <FormSection>
        <FieldLabel
          htmlFor="statementOfFacts"
          required
          tooltip="Include all relevant facts that support your arguments"
        >
          Statement of Facts
        </FieldLabel>
        <textarea
          id="statementOfFacts"
          {...register('statementOfFacts')}
          rows={12}
          placeholder="Describe the key facts relevant to this motion. Include:

• Timeline of events
• Relevant parties and their roles
• Key documents and communications
• Any prior court rulings or orders
• Specific actions or omissions at issue

The more detail you provide, the stronger the motion we can prepare."
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm resize-y"
        />
        <div className="flex justify-between items-center mt-1">
          <ValidationMessage error={errors.statementOfFacts} />
          <CharacterCounter current={statementLength} minimum={500} />
        </div>
      </FormSection>

      {/* Procedural History */}
      <FormSection>
        <FieldLabel
          htmlFor="proceduralHistory"
          required
          tooltip="The litigation history helps us understand the case posture"
        >
          Procedural History
        </FieldLabel>
        <textarea
          id="proceduralHistory"
          {...register('proceduralHistory')}
          rows={6}
          placeholder="Summarize the litigation history:

• When the case was filed
• What motions have been filed and their outcomes
• Any relevant court rulings or orders
• Current status of the case
• Upcoming deadlines or hearings"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm resize-y"
        />
        <div className="flex justify-between items-center mt-1">
          <ValidationMessage error={errors.proceduralHistory} />
          <CharacterCounter current={historyLength} minimum={200} />
        </div>
      </FormSection>

      {/* Key Dates */}
      <FormSection>
        <div className="flex items-center justify-between mb-3">
          <FieldLabel tooltip="Timeline of significant dates helps structure the narrative">
            <Calendar className="w-4 h-4 inline mr-2" />
            Key Dates Timeline (Optional)
          </FieldLabel>
          <button
            type="button"
            onClick={addKeyDate}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Date
          </button>
        </div>

        {fields.length === 0 ? (
          <p className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded-lg">
            No key dates added. Click &quot;Add Date&quot; to create a timeline of
            significant events.
          </p>
        ) : (
          <div className="space-y-3">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex-1 grid md:grid-cols-3 gap-3">
                  <div className="md:col-span-1">
                    <input
                      type="date"
                      {...register(`keyDates.${index}.date`)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <input
                      type="text"
                      {...register(`keyDates.${index}.description`)}
                      placeholder="What happened on this date?"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </FormSection>

      {/* Tips */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">Tips for a Strong Statement of Facts</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Be objective - present facts, not arguments</li>
          <li>• Include specific dates, names, and document references</li>
          <li>• Organize chronologically when possible</li>
          <li>• Highlight facts that support your legal theory</li>
          <li>• Acknowledge unfavorable facts (we can address them strategically)</li>
        </ul>
      </div>
    </div>
  );
}

export default StatementOfFactsForm;
