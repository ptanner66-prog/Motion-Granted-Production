/**
 * Case Information Form Component
 *
 * v6.3: Second step - case details and court information.
 */

'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useIntakeForm } from '@/lib/intake/context';
import { JURISDICTIONS, getJurisdictionByCode } from '@/lib/intake/jurisdictions';
import { FormSection } from './shared/FormSection';
import { FieldLabel } from './shared/FieldLabel';
import { ValidationMessage } from './shared/ValidationMessage';
import { Calendar, Building2, Scale } from 'lucide-react';

const schema = z.object({
  caseCaption: z.string().min(10, 'Case caption must be at least 10 characters'),
  caseNumber: z.string().min(1, 'Case number is required'),
  jurisdiction: z.string().min(1, 'Please select a jurisdiction'),
  court: z.string().min(1, 'Please select a court'),
  judge: z.string().optional(),
  department: z.string().optional(),
  filingDeadline: z.string().min(1, 'Filing deadline is required'),
});

type FormData = z.infer<typeof schema>;

export function CaseInformationForm() {
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
      caseCaption: formData.caseCaption || '',
      caseNumber: formData.caseNumber || '',
      jurisdiction: formData.jurisdiction || '',
      court: formData.court || '',
      judge: formData.judge || '',
      department: formData.department || '',
      filingDeadline: formData.filingDeadline
        ? new Date(formData.filingDeadline).toISOString().split('T')[0]
        : '',
    },
  });

  const watchedJurisdiction = watch('jurisdiction');
  const watchedValues = watch();

  // Get courts for selected jurisdiction
  const selectedJurisdiction = watchedJurisdiction
    ? getJurisdictionByCode(watchedJurisdiction)
    : null;
  const availableCourts = selectedJurisdiction?.courts || [];

  // Reset court when jurisdiction changes
  useEffect(() => {
    if (watchedJurisdiction && formData.jurisdiction !== watchedJurisdiction) {
      setValue('court', '');
    }
  }, [watchedJurisdiction, formData.jurisdiction, setValue]);

  // Update form data and validation state
  useEffect(() => {
    updateFormData({
      caseCaption: watchedValues.caseCaption,
      caseNumber: watchedValues.caseNumber,
      jurisdiction: watchedValues.jurisdiction,
      court: watchedValues.court,
      judge: watchedValues.judge,
      department: watchedValues.department,
      filingDeadline: watchedValues.filingDeadline
        ? new Date(watchedValues.filingDeadline)
        : null,
    });
    setCanProceed(isValid);
  }, [watchedValues, isValid, updateFormData, setCanProceed]);

  const minDate = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          Case Information
        </h2>
        <p className="mt-2 text-gray-600">
          Tell us about your case and court
        </p>
      </div>

      {/* Case Caption */}
      <FormSection>
        <FieldLabel htmlFor="caseCaption" required>
          <Scale className="w-4 h-4 inline mr-2" />
          Case Caption
        </FieldLabel>
        <textarea
          id="caseCaption"
          {...register('caseCaption')}
          rows={3}
          placeholder="e.g., John Smith, individually and as trustee v. XYZ Corporation, a Delaware corporation, et al."
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm resize-none"
        />
        <ValidationMessage error={errors.caseCaption} />
        <p className="mt-1 text-xs text-gray-500">
          Enter the full case caption as it appears on court filings
        </p>
      </FormSection>

      {/* Case Number */}
      <FormSection>
        <FieldLabel htmlFor="caseNumber" required>
          Case Number
        </FieldLabel>
        <input
          id="caseNumber"
          type="text"
          {...register('caseNumber')}
          placeholder="e.g., 2:24-cv-01234-ABC"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
        />
        <ValidationMessage error={errors.caseNumber} />
      </FormSection>

      {/* Jurisdiction & Court */}
      <div className="grid md:grid-cols-2 gap-6">
        <FormSection>
          <FieldLabel htmlFor="jurisdiction" required>
            <Building2 className="w-4 h-4 inline mr-2" />
            Jurisdiction
          </FieldLabel>
          <select
            id="jurisdiction"
            {...register('jurisdiction')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          >
            <option value="">Select jurisdiction...</option>
            <optgroup label="Federal Courts">
              {JURISDICTIONS.filter(j => j.type === 'federal').map(j => (
                <option key={j.code} value={j.code}>
                  {j.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="State Courts">
              {JURISDICTIONS.filter(j => j.type === 'state').map(j => (
                <option key={j.code} value={j.code}>
                  {j.name}
                </option>
              ))}
            </optgroup>
          </select>
          <ValidationMessage error={errors.jurisdiction} />
        </FormSection>

        <FormSection>
          <FieldLabel htmlFor="court" required>
            Court
          </FieldLabel>
          <select
            id="court"
            {...register('court')}
            disabled={!watchedJurisdiction}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">
              {watchedJurisdiction ? 'Select court...' : 'Select jurisdiction first'}
            </option>
            {availableCourts.map(court => (
              <option key={court.code} value={court.code}>
                {court.name}
              </option>
            ))}
          </select>
          <ValidationMessage error={errors.court} />
        </FormSection>
      </div>

      {/* Judge & Department */}
      <div className="grid md:grid-cols-2 gap-6">
        <FormSection>
          <FieldLabel
            htmlFor="judge"
            tooltip="If known, this helps us tailor the motion to the judge's preferences"
          >
            Assigned Judge
          </FieldLabel>
          <input
            id="judge"
            type="text"
            {...register('judge')}
            placeholder="e.g., Hon. Jane Smith"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          />
        </FormSection>

        <FormSection>
          <FieldLabel htmlFor="department" tooltip="Court department or division number">
            Department/Division
          </FieldLabel>
          <input
            id="department"
            type="text"
            {...register('department')}
            placeholder="e.g., Dept. 14"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          />
        </FormSection>
      </div>

      {/* Filing Deadline */}
      <FormSection>
        <FieldLabel htmlFor="filingDeadline" required>
          <Calendar className="w-4 h-4 inline mr-2" />
          Filing Deadline
        </FieldLabel>
        <input
          id="filingDeadline"
          type="date"
          min={minDate}
          {...register('filingDeadline')}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
        />
        <ValidationMessage error={errors.filingDeadline} />
        <p className="mt-1 text-xs text-gray-500">
          We use this to ensure timely delivery with buffer for your review
        </p>
      </FormSection>
    </div>
  );
}

export default CaseInformationForm;
