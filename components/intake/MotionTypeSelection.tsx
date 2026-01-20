/**
 * Motion Type Selection Component
 *
 * v6.3: Third step - select tier and motion type.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useIntakeForm } from '@/lib/intake/context';
import { getMotionTypesByTier, type MotionType } from '@/lib/intake/motion-types';
import { formatPrice } from '@/lib/intake/pricing';
import type { Tier } from '@/lib/intake/types';
import { FormSection } from './shared/FormSection';
import { FieldLabel } from './shared/FieldLabel';
import { Clock, DollarSign, FileText, CheckCircle } from 'lucide-react';

interface TierInfo {
  id: Tier;
  name: string;
  description: string;
  complexity: string;
  priceRange: string;
  turnaround: string;
  examples: string[];
}

const TIER_INFO: TierInfo[] = [
  {
    id: 'A',
    name: 'Tier A - Straightforward',
    description: 'Procedural and administrative motions',
    complexity: 'Low complexity',
    priceRange: '$375 - $625',
    turnaround: '1-3 business days',
    examples: ['Motion to Continue', 'Motion to Compel', 'Motion for Pro Hac Vice'],
  },
  {
    id: 'B',
    name: 'Tier B - Intermediate',
    description: 'Substantive motions requiring legal analysis',
    complexity: 'Medium complexity',
    priceRange: '$750 - $1,500',
    turnaround: '3-5 business days',
    examples: ['Motion in Limine', 'Motion for TRO', 'Peremptory Exceptions'],
  },
  {
    id: 'C',
    name: 'Tier C - Complex',
    description: 'Dispositive and complex legal arguments',
    complexity: 'High complexity',
    priceRange: '$1,500 - $2,750',
    turnaround: '7-14 business days',
    examples: ['Motion for Summary Judgment', 'JNOV', 'Post-Trial Briefs'],
  },
];

export function MotionTypeSelection() {
  const { formData, updateFormData, setCanProceed } = useIntakeForm();
  const [selectedTier, setSelectedTier] = useState<Tier | null>(formData.tier || null);
  const [selectedMotion, setSelectedMotion] = useState<string>(formData.motionType || '');

  const motionTypes = selectedTier ? getMotionTypesByTier(selectedTier) : [];

  useEffect(() => {
    const isValid = !!selectedTier && !!selectedMotion;
    setCanProceed(isValid);
    updateFormData({
      tier: selectedTier,
      motionType: selectedMotion,
    });
  }, [selectedTier, selectedMotion, setCanProceed, updateFormData]);

  const handleTierSelect = (tier: Tier) => {
    setSelectedTier(tier);
    // Reset motion selection when tier changes
    if (formData.tier !== tier) {
      setSelectedMotion('');
    }
  };

  const isOpposition = formData.path === 'B';

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          {isOpposition ? 'What are you opposing?' : 'What type of motion?'}
        </h2>
        <p className="mt-2 text-gray-600">
          Select the complexity tier and specific motion type
        </p>
      </div>

      {/* Tier Selection */}
      <FormSection>
        <FieldLabel required>Select Complexity Tier</FieldLabel>
        <div className="mt-3 space-y-3">
          {TIER_INFO.map((tier) => (
            <button
              key={tier.id}
              type="button"
              onClick={() => handleTierSelect(tier.id)}
              className={`
                w-full p-4 rounded-lg border-2 text-left transition-all
                ${selectedTier === tier.id
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300 bg-white'
                }
              `}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center">
                    <h3 className="font-semibold text-gray-900">{tier.name}</h3>
                    {selectedTier === tier.id && (
                      <CheckCircle className="w-5 h-5 text-blue-600 ml-2" />
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{tier.description}</p>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                    <span className="flex items-center">
                      <DollarSign className="w-3 h-3 mr-1" />
                      {tier.priceRange}
                    </span>
                    <span className="flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      {tier.turnaround}
                    </span>
                  </div>
                </div>
                <span
                  className={`
                    px-2 py-1 text-xs font-medium rounded
                    ${tier.id === 'A'
                      ? 'bg-green-100 text-green-800'
                      : tier.id === 'B'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                    }
                  `}
                >
                  {tier.complexity}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {tier.examples.map((ex, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                  >
                    {ex}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </FormSection>

      {/* Motion Type Selection */}
      {selectedTier && (
        <FormSection>
          <FieldLabel required>
            <FileText className="w-4 h-4 inline mr-2" />
            {isOpposition ? 'Select Motion to Oppose' : 'Select Motion Type'}
          </FieldLabel>
          <div className="mt-3 grid gap-2 max-h-80 overflow-y-auto border border-gray-200 rounded-lg p-2">
            {motionTypes.map((motion) => (
              <MotionTypeCard
                key={motion.code}
                motion={motion}
                isSelected={selectedMotion === motion.code}
                isOpposition={isOpposition}
                onSelect={() => setSelectedMotion(motion.code)}
              />
            ))}
          </div>
        </FormSection>
      )}

      {/* Selected Motion Details */}
      {selectedMotion && (
        <SelectedMotionSummary
          motionCode={selectedMotion}
          motionTypes={motionTypes}
          isOpposition={isOpposition}
        />
      )}
    </div>
  );
}

interface MotionTypeCardProps {
  motion: MotionType;
  isSelected: boolean;
  isOpposition: boolean;
  onSelect: () => void;
}

function MotionTypeCard({ motion, isSelected, isOpposition, onSelect }: MotionTypeCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        w-full p-3 rounded-lg border text-left transition-all
        ${isSelected
          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
        }
      `}
    >
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-gray-900 text-sm">
            {isOpposition ? `Opposition to ${motion.name}` : motion.name}
          </h4>
          <p className="text-xs text-gray-500 mt-0.5">{motion.description}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-900">
            {formatPrice(motion.basePrice)}
          </p>
          <p className="text-xs text-gray-500">
            {motion.turnaroundDays.standard} days
          </p>
        </div>
      </div>
    </button>
  );
}

interface SelectedMotionSummaryProps {
  motionCode: string;
  motionTypes: MotionType[];
  isOpposition: boolean;
}

function SelectedMotionSummary({ motionCode, motionTypes, isOpposition }: SelectedMotionSummaryProps) {
  const motion = motionTypes.find(m => m.code === motionCode);
  if (!motion) return null;

  return (
    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
      <h4 className="font-semibold text-green-900">Selected:</h4>
      <p className="text-green-800">
        {isOpposition ? `Opposition to ${motion.name}` : motion.name}
      </p>
      <div className="mt-2 flex gap-4 text-sm text-green-700">
        <span>Base: {formatPrice(motion.basePrice)}</span>
        <span>Turnaround: {motion.turnaroundDays.standard} business days</span>
      </div>
    </div>
  );
}

export default MotionTypeSelection;
