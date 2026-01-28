/**
 * State & Court Selection Component (Task 83)
 *
 * Step 2 in the intake wizard - select state and court type.
 * Shows "Coming Soon" message for disabled states with email capture.
 *
 * Source: Chunk 11, Task 83 - MOTION_TYPES_BY_STATE_SPEC_v2_EXPANDED.md
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useIntakeForm } from '@/lib/intake/context';
import { getAllStates, isStateEnabled, getStateConfig } from '@/lib/config/state-configs';
import { FormSection } from './shared/FormSection';
import { FieldLabel } from './shared/FieldLabel';
import {
  MapPin,
  Building2,
  Scale,
  CheckCircle,
  AlertCircle,
  Bell,
  Loader2,
} from 'lucide-react';
import type { CourtType } from '@/lib/intake/types';

export function StateCourtSelection() {
  const { formData, updateFormData, setCanProceed } = useIntakeForm();
  const [selectedState, setSelectedState] = useState<string>(formData.stateCode || '');
  const [selectedCourtType, setSelectedCourtType] = useState<CourtType | null>(
    formData.courtType || null
  );
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);

  const allStates = getAllStates();
  const stateConfig = selectedState ? getStateConfig(selectedState) : null;
  const stateEnabled = selectedState ? isStateEnabled(selectedState) : false;

  useEffect(() => {
    // Check if state is enabled
    if (selectedState && !stateEnabled) {
      setShowComingSoon(true);
      setCanProceed(false);
    } else {
      setShowComingSoon(false);
    }

    // Validate - need both state and court type for enabled states
    const isValid = !!selectedState && stateEnabled && !!selectedCourtType;
    setCanProceed(isValid);

    updateFormData({
      stateCode: selectedState,
      courtType: selectedCourtType,
    });
  }, [selectedState, selectedCourtType, stateEnabled, setCanProceed, updateFormData]);

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newState = e.target.value;
    setSelectedState(newState);
    setWaitlistSuccess(false);
    // Reset court type when state changes
    setSelectedCourtType(null);
  };

  const handleCourtTypeSelect = (courtType: CourtType) => {
    setSelectedCourtType(courtType);
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail || !selectedState) return;

    setWaitlistSubmitting(true);
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: waitlistEmail,
          state_code: selectedState,
        }),
      });

      if (response.ok) {
        setWaitlistSuccess(true);
        setWaitlistEmail('');
      }
    } catch (error) {
      console.error('Waitlist signup failed:', error);
    } finally {
      setWaitlistSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          Where is your case?
        </h2>
        <p className="mt-2 text-gray-600">
          Select your state and court type to see available motion types
        </p>
      </div>

      {/* State Selection */}
      <FormSection>
        <FieldLabel required>
          <MapPin className="w-4 h-4 inline mr-2" />
          Select State
        </FieldLabel>
        <select
          value={selectedState}
          onChange={handleStateChange}
          className="mt-2 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Select a state...</option>
          {allStates.map((state) => (
            <option key={state.code} value={state.code}>
              {state.name} {state.enabled ? '' : '(Coming Soon)'}
            </option>
          ))}
        </select>

        {selectedState && stateEnabled && (
          <div className="mt-2 flex items-center text-sm text-green-600">
            <CheckCircle className="w-4 h-4 mr-1" />
            {stateConfig?.name} is available for orders
          </div>
        )}
      </FormSection>

      {/* Coming Soon Message */}
      {showComingSoon && stateConfig && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <div className="flex items-start">
            <AlertCircle className="w-6 h-6 text-amber-500 mt-0.5 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900">
                {stateConfig.name} Coming Soon!
              </h3>
              <p className="mt-2 text-amber-800">
                We currently support:
              </p>
              <ul className="mt-2 space-y-1 text-amber-800">
                <li className="flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                  California (state + federal)
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                  Louisiana (state + federal)
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                  All federal courts (5th & 9th Circuit)
                </li>
              </ul>

              <p className="mt-4 text-amber-800">
                Would you like us to notify you when {stateConfig.name} is available?
              </p>

              {waitlistSuccess ? (
                <div className="mt-4 p-3 bg-green-100 border border-green-200 rounded-lg">
                  <div className="flex items-center text-green-800">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Thanks! We'll email you when {stateConfig.name} is available.
                  </div>
                </div>
              ) : (
                <form onSubmit={handleWaitlistSubmit} className="mt-4 flex gap-2">
                  <input
                    type="email"
                    value={waitlistEmail}
                    onChange={(e) => setWaitlistEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="flex-1 px-4 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    required
                  />
                  <button
                    type="submit"
                    disabled={waitlistSubmitting}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center"
                  >
                    {waitlistSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Bell className="w-4 h-4 mr-2" />
                        Notify Me
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Court Type Selection */}
      {selectedState && stateEnabled && (
        <FormSection>
          <FieldLabel required>
            <Building2 className="w-4 h-4 inline mr-2" />
            Select Court Type
          </FieldLabel>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* State Court Option */}
            <button
              type="button"
              onClick={() => handleCourtTypeSelect('state')}
              className={`
                p-4 rounded-lg border-2 text-left transition-all
                ${selectedCourtType === 'state'
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300 bg-white'
                }
              `}
            >
              <div className="flex items-start">
                <Scale className="w-6 h-6 text-gray-600 mr-3 mt-0.5" />
                <div>
                  <div className="flex items-center">
                    <h3 className="font-semibold text-gray-900">State Court</h3>
                    {selectedCourtType === 'state' && (
                      <CheckCircle className="w-5 h-5 text-blue-600 ml-2" />
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {stateConfig?.name} Superior Court, Circuit Court, or equivalent
                  </p>
                  {stateConfig?.state_specific_motions && stateConfig.state_specific_motions.length > 0 && (
                    <p className="mt-2 text-xs text-blue-600">
                      Includes state-specific motions like{' '}
                      {stateConfig.state_specific_motions.slice(0, 2).map(m =>
                        m.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                      ).join(', ')}
                      {stateConfig.state_specific_motions.length > 2 && ', and more'}
                    </p>
                  )}
                </div>
              </div>
            </button>

            {/* Federal Court Option */}
            <button
              type="button"
              onClick={() => handleCourtTypeSelect('federal')}
              className={`
                p-4 rounded-lg border-2 text-left transition-all
                ${selectedCourtType === 'federal'
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300 bg-white'
                }
              `}
            >
              <div className="flex items-start">
                <Building2 className="w-6 h-6 text-gray-600 mr-3 mt-0.5" />
                <div>
                  <div className="flex items-center">
                    <h3 className="font-semibold text-gray-900">Federal Court</h3>
                    {selectedCourtType === 'federal' && (
                      <CheckCircle className="w-5 h-5 text-blue-600 ml-2" />
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {stateConfig?.federal_circuits[0]} Circuit • U.S. District Court
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    {stateConfig?.federal_districts.join(', ')}
                  </p>
                </div>
              </div>
            </button>
          </div>
        </FormSection>
      )}

      {/* Selection Summary */}
      {selectedState && stateEnabled && selectedCourtType && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center">
            <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
            <div>
              <h4 className="font-semibold text-green-900">Selected:</h4>
              <p className="text-green-800">
                {stateConfig?.name} {selectedCourtType === 'federal' ? 'Federal' : 'State'} Court
                {selectedCourtType === 'federal' && ` (${stateConfig?.federal_circuits[0]} Circuit)`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StateCourtSelection;
