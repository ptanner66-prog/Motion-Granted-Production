/**
 * Drafting Instructions Form Component
 *
 * v6.3: Fifth step - arguments, tone, and specific requests.
 */

'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useIntakeForm } from '@/lib/intake/context';
import type { TonePreference } from '@/lib/intake/types';
import { FormSection } from './shared/FormSection';
import { FieldLabel } from './shared/FieldLabel';
import { ValidationMessage } from './shared/ValidationMessage';
import { CharacterCounter } from './character-counter';
import { Target, MessageSquare, AlertTriangle, CheckCircle } from 'lucide-react';

const schema = z.object({
  primaryArguments: z
    .string()
    .min(100, 'Primary arguments must be at least 100 characters'),
  tonePreference: z.enum(['aggressive', 'measured', 'conciliatory']),
  specificRequests: z.string().optional(),
  knownWeaknesses: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface ToneOption {
  id: TonePreference;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const TONE_OPTIONS: ToneOption[] = [
  {
    id: 'aggressive',
    name: 'Aggressive',
    description: 'Direct and forceful advocacy. Best for strong positions with clear legal support.',
    icon: <Target className="w-5 h-5" />,
  },
  {
    id: 'measured',
    name: 'Measured',
    description: 'Balanced and professional. Suitable for most situations and judges.',
    icon: <MessageSquare className="w-5 h-5" />,
  },
  {
    id: 'conciliatory',
    name: 'Conciliatory',
    description: 'Collaborative tone while maintaining your position. Good for ongoing relationships.',
    icon: <CheckCircle className="w-5 h-5" />,
  },
];

export function DraftingInstructionsForm() {
  const { formData, updateFormData, setCanProceed } = useIntakeForm();

  const {
    register,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      primaryArguments: formData.primaryArguments || '',
      tonePreference: formData.tonePreference || 'measured',
      specificRequests: formData.specificRequests || '',
      knownWeaknesses: formData.knownWeaknesses || '',
    },
  });

  const watchedValues = watch();
  const argumentsLength = watchedValues.primaryArguments?.length || 0;

  useEffect(() => {
    updateFormData({
      primaryArguments: watchedValues.primaryArguments,
      tonePreference: watchedValues.tonePreference,
      specificRequests: watchedValues.specificRequests,
      knownWeaknesses: watchedValues.knownWeaknesses,
    });
    setCanProceed(isValid);
  }, [watchedValues, isValid, updateFormData, setCanProceed]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Drafting Instructions</h2>
        <p className="mt-2 text-gray-600">
          Guide how we should approach your motion
        </p>
      </div>

      {/* Primary Arguments */}
      <FormSection>
        <FieldLabel
          htmlFor="primaryArguments"
          required
          tooltip="Tell us the main points you want to make"
        >
          <Target className="w-4 h-4 inline mr-2" />
          Primary Arguments
        </FieldLabel>
        <textarea
          id="primaryArguments"
          {...register('primaryArguments')}
          rows={8}
          placeholder="Describe the main arguments you want to make:

• What legal standards apply?
• What facts support your position?
• What outcome are you seeking?
• Any specific cases or statutes to cite?
• Arguments to emphasize or de-emphasize?"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm resize-y"
        />
        <div className="flex justify-between items-center mt-1">
          <ValidationMessage error={errors.primaryArguments} />
          <CharacterCounter current={argumentsLength} minimum={100} />
        </div>
      </FormSection>

      {/* Tone Preference */}
      <FormSection>
        <FieldLabel required>Tone Preference</FieldLabel>
        <div className="mt-3 grid md:grid-cols-3 gap-3">
          {TONE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setValue('tonePreference', option.id)}
              className={`
                p-4 rounded-lg border-2 text-left transition-all
                ${watchedValues.tonePreference === option.id
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300'
                }
              `}
            >
              <div
                className={`
                  w-10 h-10 rounded-lg flex items-center justify-center mb-2
                  ${watchedValues.tonePreference === option.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                  }
                `}
              >
                {option.icon}
              </div>
              <h4 className="font-semibold text-gray-900">{option.name}</h4>
              <p className="text-xs text-gray-600 mt-1">{option.description}</p>
            </button>
          ))}
        </div>
      </FormSection>

      {/* Specific Requests */}
      <FormSection>
        <FieldLabel
          htmlFor="specificRequests"
          tooltip="Any particular requirements or preferences"
        >
          Specific Requests (Optional)
        </FieldLabel>
        <textarea
          id="specificRequests"
          {...register('specificRequests')}
          rows={4}
          placeholder="Any specific instructions:

• Page limits to observe
• Formatting requirements
• Specific language to include or avoid
• Cases or authorities to address
• Local rules to follow"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm resize-y"
        />
      </FormSection>

      {/* Known Weaknesses */}
      <FormSection>
        <FieldLabel
          htmlFor="knownWeaknesses"
          tooltip="Identifying weaknesses helps us address them proactively"
        >
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          Known Weaknesses (Optional)
        </FieldLabel>
        <textarea
          id="knownWeaknesses"
          {...register('knownWeaknesses')}
          rows={4}
          placeholder="Are there any weaknesses in your position?

• Unfavorable facts or evidence
• Adverse case law
• Procedural issues
• Anything the opposing party might raise

Being upfront helps us craft stronger preemptive responses."
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm resize-y"
        />
      </FormSection>

      {/* Tips */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <h4 className="font-medium text-amber-900 mb-2">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          Pro Tip: Share Weaknesses
        </h4>
        <p className="text-sm text-amber-800">
          Identifying weaknesses isn&apos;t a sign of a bad case. It helps us craft
          stronger arguments that preemptively address opposing points. Judges
          appreciate candor, and we can often turn weaknesses into strengths
          through strategic framing.
        </p>
      </div>
    </div>
  );
}

export default DraftingInstructionsForm;
