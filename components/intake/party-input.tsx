// /components/intake/party-input.tsx
// Party name input component for conflict detection
// VERSION: 1.0 — January 28, 2026

'use client';

import { useState } from 'react';

interface PartyInputProps {
  label: string;
  parties: string[];
  onChange: (parties: string[]) => void;
  placeholder?: string;
  required?: boolean;
}

export function PartyInput({
  label,
  parties,
  onChange,
  placeholder = "Enter party name",
  required = false,
}: PartyInputProps) {
  const [inputValue, setInputValue] = useState('');

  const addParty = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !parties.includes(trimmed)) {
      onChange([...parties, trimmed]);
      setInputValue('');
    }
  };

  const removeParty = (index: number) => {
    onChange(parties.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addParty();
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {/* Party tags */}
      {parties.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {parties.map((party, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
            >
              {party}
              <button
                type="button"
                onClick={() => removeParty(index)}
                className="hover:text-blue-600"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          type="button"
          onClick={addParty}
          disabled={!inputValue.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Press Enter or click Add to add each party. Include all plaintiffs/defendants, petitioners/respondents, etc.
      </p>
    </div>
  );
}

interface AttorneySideSelectProps {
  value: 'PLAINTIFF' | 'DEFENDANT' | '';
  onChange: (side: 'PLAINTIFF' | 'DEFENDANT') => void;
}

export function AttorneySideSelect({ value, onChange }: AttorneySideSelectProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Which side do you represent?
        <span className="text-red-500 ml-1">*</span>
      </label>

      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="attorneySide"
            value="PLAINTIFF"
            checked={value === 'PLAINTIFF'}
            onChange={() => onChange('PLAINTIFF')}
            className="h-4 w-4 text-blue-600"
          />
          <span>Plaintiff / Petitioner / Appellant</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="attorneySide"
            value="DEFENDANT"
            checked={value === 'DEFENDANT'}
            onChange={() => onChange('DEFENDANT')}
            className="h-4 w-4 text-blue-600"
          />
          <span>Defendant / Respondent / Appellee</span>
        </label>
      </div>
    </div>
  );
}
