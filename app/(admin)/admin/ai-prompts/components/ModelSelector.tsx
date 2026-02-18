// app/(admin)/admin/ai-prompts/components/ModelSelector.tsx
'use client';

import { useState } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';

export interface ModelOption {
  id: string;
  label: string;
  shortLabel: string;
  costTier: 'standard' | 'premium';
  supportsExtendedThinking: boolean;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'claude-sonnet-4-5-20250929',
    label: 'Claude Sonnet 4.5',
    shortLabel: 'Sonnet',
    costTier: 'standard',
    supportsExtendedThinking: true,
  },
  {
    id: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    shortLabel: 'Opus',
    costTier: 'premium',
    supportsExtendedThinking: true,
  },
];

interface ModelSelectorProps {
  phaseId: string;
  tier: 'A' | 'B' | 'C' | 'D';
  currentModelId: string;
  onModelChange: (phaseId: string, tier: string, newModelId: string) => Promise<void>;
  disabled?: boolean;
}

export function ModelSelector({
  phaseId,
  tier,
  currentModelId,
  onModelChange,
  disabled = false,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingModelId, setPendingModelId] = useState<string | null>(null);

  const currentModel = AVAILABLE_MODELS.find(m => m.id === currentModelId) || AVAILABLE_MODELS[0];

  const handleSelect = async (modelId: string) => {
    if (modelId === currentModelId) {
      setIsOpen(false);
      return;
    }

    setIsSaving(true);
    setPendingModelId(modelId);

    try {
      await onModelChange(phaseId, tier, modelId);
    } catch (err) {
      console.error('Failed to update model:', err);
    } finally {
      setIsSaving(false);
      setPendingModelId(null);
      setIsOpen(false);
    }
  };

  const displayModelId = pendingModelId || currentModelId;
  const displayModel = AVAILABLE_MODELS.find(m => m.id === displayModelId) || currentModel;

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && !isSaving && setIsOpen(!isOpen)}
        disabled={disabled || isSaving}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium
          border transition-all
          ${disabled || isSaving
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 cursor-pointer'
          }
          ${displayModel.costTier === 'premium' ? 'border-amber-500' : ''}
        `}
      >
        {isSaving ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <span
            className={`w-2 h-2 rounded-full ${
              displayModel.costTier === 'premium' ? 'bg-amber-500' : 'bg-blue-500'
            }`}
          />
        )}
        <span>{displayModel.shortLabel}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute z-50 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
            {AVAILABLE_MODELS.map((model) => (
              <button
                key={model.id}
                onClick={() => handleSelect(model.id)}
                className={`
                  w-full px-3 py-2 text-left text-sm flex items-center gap-3
                  hover:bg-slate-50 transition-colors
                  ${model.id === currentModelId ? 'bg-blue-50' : ''}
                `}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    model.costTier === 'premium' ? 'bg-amber-500' : 'bg-blue-500'
                  }`}
                />
                <div className="flex-1">
                  <div className="font-medium text-slate-700">{model.label}</div>
                  <div className="text-xs text-slate-400">
                    {model.costTier === 'premium' ? '$$$ Premium' : '$ Standard'}
                    {model.supportsExtendedThinking && ' \u2022 Extended thinking'}
                  </div>
                </div>
                {model.id === currentModelId && (
                  <Check className="w-4 h-4 text-blue-600" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
