/**
 * Motion Type Selection Component (Updated for Task 83)
 *
 * v6.3: Third step - select tier and motion type.
 * v11.0: Updated for 50-state expansion with hierarchical dropdown.
 *        Now filters motions based on state and court type.
 */

'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useIntakeForm } from '@/lib/intake/context';
import { getFilteredMotions, groupMotionsForDropdown } from '@/lib/utils/motion-filter';
import { TIER_LABELS, CATEGORY_LABELS, type MotionType as ConfigMotionType } from '@/lib/config/motion-types';
import { getStateConfig } from '@/lib/config/state-configs';
import type { Tier, CourtType } from '@/lib/intake/types';
import { FormSection } from './shared/FormSection';
import { FieldLabel } from './shared/FieldLabel';
import {
  Clock,
  DollarSign,
  FileText,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Search,
  AlertCircle,
} from 'lucide-react';

export function MotionTypeSelection() {
  const { formData, updateFormData, setCanProceed } = useIntakeForm();
  const [selectedMotionId, setSelectedMotionId] = useState<string>(formData.motionType || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTiers, setExpandedTiers] = useState<Set<string>>(new Set(['A', 'B', 'C']));
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const stateCode = formData.stateCode || '';
  const courtType = formData.courtType as CourtType | null;
  const stateConfig = stateCode ? getStateConfig(stateCode) : null;

  // Get filtered and grouped motions
  const filteredResult = useMemo(() => {
    if (!stateCode || !courtType) {
      return { available: false, motions: [], grouped: [], totalCount: 0, stateEnabled: false };
    }
    return getFilteredMotions(stateCode, courtType);
  }, [stateCode, courtType]);

  // Filter by search term
  const displayedGroups = useMemo(() => {
    if (!searchTerm.trim()) {
      return filteredResult.grouped;
    }

    const term = searchTerm.toLowerCase();
    return filteredResult.grouped
      .map((group) => ({
        ...group,
        categories: group.categories
          .map((cat) => ({
            ...cat,
            motions: cat.motions.filter(
              (m) =>
                m.display_name.toLowerCase().includes(term) ||
                m.description.toLowerCase().includes(term)
            ),
          }))
          .filter((cat) => cat.motions.length > 0),
      }))
      .filter((group) => group.categories.length > 0);
  }, [filteredResult.grouped, searchTerm]);

  // Find selected motion
  const selectedMotion = useMemo(() => {
    return filteredResult.motions.find((m) => m.id === selectedMotionId);
  }, [filteredResult.motions, selectedMotionId]);

  useEffect(() => {
    const isValid = !!selectedMotionId && !!selectedMotion;
    setCanProceed(isValid);

    if (selectedMotion) {
      updateFormData({
        tier: selectedMotion.tier,
        motionType: selectedMotionId,
        motionMetadata: {
          id: selectedMotion.id,
          display_name: selectedMotion.display_name,
          tier: selectedMotion.tier,
          base_price_min: selectedMotion.base_price_min,
          base_price_max: selectedMotion.base_price_max,
        },
      });
    }
  }, [selectedMotionId, selectedMotion, setCanProceed, updateFormData]);

  // Reset motion selection when state/court changes
  useEffect(() => {
    const currentMotionStillAvailable = filteredResult.motions.some(
      (m) => m.id === selectedMotionId
    );
    if (!currentMotionStillAvailable && selectedMotionId) {
      setSelectedMotionId('');
    }
  }, [stateCode, courtType, filteredResult.motions, selectedMotionId]);

  const toggleTier = (tier: string) => {
    const newExpanded = new Set(expandedTiers);
    if (newExpanded.has(tier)) {
      newExpanded.delete(tier);
    } else {
      newExpanded.add(tier);
    }
    setExpandedTiers(newExpanded);
  };

  const toggleCategory = (categoryKey: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryKey)) {
      newExpanded.delete(categoryKey);
    } else {
      newExpanded.add(categoryKey);
    }
    setExpandedCategories(newExpanded);
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  const isOpposition = formData.path === 'B';

  // Handle missing state/court selection
  if (!stateCode || !courtType) {
    return (
      <div className="space-y-6">
        <div className="p-6 bg-amber-50 border border-amber-200 rounded-lg text-center">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <h3 className="font-semibold text-amber-900">State & Court Not Selected</h3>
          <p className="mt-2 text-amber-800">
            Please go back and select your state and court type first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          {isOpposition ? 'What are you opposing?' : 'Select Motion Type'}
        </h2>
        <p className="mt-2 text-gray-600">
          {filteredResult.totalCount} motion types available for {stateConfig?.name}{' '}
          {courtType === 'federal' ? 'Federal' : 'State'} Court
        </p>
      </div>

      {/* Search */}
      <FormSection>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search motions..."
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </FormSection>

      {/* Hierarchical Motion Selection */}
      <FormSection>
        <FieldLabel required>
          <FileText className="w-4 h-4 inline mr-2" />
          {isOpposition ? 'Select Motion to Oppose' : 'Select Motion Type'}
        </FieldLabel>

        <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
          {displayedGroups.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No motions found matching &quot;{searchTerm}&quot;
            </div>
          ) : (
            displayedGroups.map((group) => (
              <div key={group.tier} className="border-b border-gray-200 last:border-b-0">
                {/* Tier Header */}
                <button
                  type="button"
                  onClick={() => toggleTier(group.tier)}
                  className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left"
                >
                  <div className="flex items-center">
                    {expandedTiers.has(group.tier) ? (
                      <ChevronDown className="w-5 h-5 text-gray-500 mr-2" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-500 mr-2" />
                    )}
                    <span className="font-semibold text-gray-900">
                      {TIER_LABELS[group.tier]}
                    </span>
                  </div>
                  <span
                    className={`
                      px-2 py-1 text-xs font-medium rounded
                      ${group.tier === 'A' ? 'bg-green-100 text-green-800' : ''}
                      ${group.tier === 'B' ? 'bg-yellow-100 text-yellow-800' : ''}
                      ${group.tier === 'C' ? 'bg-red-100 text-red-800' : ''}
                    `}
                  >
                    {group.categories.reduce((sum, cat) => sum + cat.motions.length, 0)} motions
                  </span>
                </button>

                {/* Categories within Tier */}
                {expandedTiers.has(group.tier) && (
                  <div className="bg-white">
                    {group.categories.map((category) => {
                      const categoryKey = `${group.tier}-${category.category}`;
                      const isExpanded = expandedCategories.has(categoryKey);

                      return (
                        <div key={categoryKey} className="border-t border-gray-100">
                          {/* Category Header */}
                          <button
                            type="button"
                            onClick={() => toggleCategory(categoryKey)}
                            className="w-full pl-8 pr-4 py-2 hover:bg-gray-50 flex items-center justify-between text-left"
                          >
                            <div className="flex items-center">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-gray-400 mr-2" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-400 mr-2" />
                              )}
                              <span className="text-sm font-medium text-gray-700">
                                {CATEGORY_LABELS[category.category]}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">
                              {category.motions.length}
                            </span>
                          </button>

                          {/* Motions within Category */}
                          {isExpanded && (
                            <div className="pl-14 pr-4 pb-2 space-y-1">
                              {category.motions.map((motion) => (
                                <MotionCard
                                  key={motion.id}
                                  motion={motion}
                                  isSelected={selectedMotionId === motion.id}
                                  isOpposition={isOpposition}
                                  onSelect={() => setSelectedMotionId(motion.id)}
                                  formatPrice={formatPrice}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </FormSection>

      {/* Selected Motion Summary */}
      {selectedMotion && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start">
            <CheckCircle className="w-5 h-5 text-green-600 mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-green-900">Selected:</h4>
              <p className="text-green-800">
                {isOpposition
                  ? `Opposition to ${selectedMotion.display_name}`
                  : selectedMotion.display_name}
              </p>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-green-700">
                <span className="flex items-center">
                  <DollarSign className="w-4 h-4 mr-1" />
                  {formatPrice(selectedMotion.base_price_min)} -{' '}
                  {formatPrice(selectedMotion.base_price_max)}
                </span>
                <span className="px-2 py-0.5 bg-green-100 rounded text-xs font-medium">
                  Tier {selectedMotion.tier}
                </span>
              </div>
              {selectedMotion.description && (
                <p className="mt-2 text-sm text-green-700">{selectedMotion.description}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface MotionCardProps {
  motion: ConfigMotionType;
  isSelected: boolean;
  isOpposition: boolean;
  onSelect: () => void;
  formatPrice: (cents: number) => string;
}

function MotionCard({
  motion,
  isSelected,
  isOpposition,
  onSelect,
  formatPrice,
}: MotionCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        w-full p-3 rounded-lg border text-left transition-all
        ${
          isSelected
            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
            : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
        }
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center">
            <h4 className="font-medium text-gray-900 text-sm truncate">
              {isOpposition ? `Opposition to ${motion.display_name}` : motion.display_name}
            </h4>
            {isSelected && (
              <CheckCircle className="w-4 h-4 text-blue-600 ml-2 flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{motion.description}</p>
        </div>
        <div className="text-right ml-3 flex-shrink-0">
          <p className="text-sm font-semibold text-gray-900">
            {formatPrice(motion.base_price_min)}
          </p>
          {motion.base_price_min !== motion.base_price_max && (
            <p className="text-xs text-gray-500">to {formatPrice(motion.base_price_max)}</p>
          )}
        </div>
      </div>
    </button>
  );
}

export default MotionTypeSelection;
