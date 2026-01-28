/**
 * Path Selection Component
 *
 * v6.3: First step of intake wizard - choose filing or opposing.
 */

'use client';

import React, { useEffect } from 'react';
import { useIntakeForm } from '@/lib/intake/context';
import type { WorkflowPath } from '@/lib/intake/types';
import { FormSection } from './shared/FormSection';
import { FileText, Shield, ArrowRight } from 'lucide-react';

interface PathOption {
  id: WorkflowPath;
  title: string;
  description: string;
  icon: React.ReactNode;
  examples: string[];
}

const PATH_OPTIONS: PathOption[] = [
  {
    id: 'A',
    title: 'I am filing a motion',
    description: 'You need to draft a motion to submit to the court',
    icon: <FileText className="w-8 h-8" />,
    examples: [
      'Motion for Summary Judgment',
      'Motion to Compel Discovery',
      'Motion for Preliminary Injunction',
      'Motion to Dismiss',
    ],
  },
  {
    id: 'B',
    title: 'I am opposing a motion',
    description: 'You need to draft an opposition to a motion filed against you',
    icon: <Shield className="w-8 h-8" />,
    examples: [
      'Opposition to Motion for Summary Judgment',
      'Opposition to Motion to Dismiss',
      'Opposition to Motion to Compel',
      'Opposition to Motion in Limine',
    ],
  },
];

export function PathSelection() {
  const { formData, updateFormData, setCanProceed } = useIntakeForm();

  useEffect(() => {
    setCanProceed(!!formData.path);
  }, [formData.path, setCanProceed]);

  const handleSelect = (path: WorkflowPath) => {
    updateFormData({ path });
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          What do you need help with?
        </h2>
        <p className="mt-2 text-gray-600">
          Select whether you are filing a motion or opposing one
        </p>
      </div>

      <FormSection className="grid md:grid-cols-2 gap-6">
        {PATH_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => handleSelect(option.id)}
            className={`
              relative p-6 rounded-xl border-2 text-left transition-all duration-200
              hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              ${formData.path === option.id
                ? 'border-blue-600 bg-blue-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-blue-300'
              }
            `}
          >
            {/* Selection indicator */}
            {formData.path === option.id && (
              <div className="absolute top-4 right-4">
                <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
            )}

            {/* Icon */}
            <div
              className={`
                w-16 h-16 rounded-xl flex items-center justify-center mb-4
                ${formData.path === option.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600'
                }
              `}
            >
              {option.icon}
            </div>

            {/* Title & Description */}
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {option.title}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {option.description}
            </p>

            {/* Examples */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Examples:
              </p>
              <ul className="space-y-1">
                {option.examples.map((example, idx) => (
                  <li
                    key={idx}
                    className="flex items-center text-sm text-gray-600"
                  >
                    <ArrowRight className="w-3 h-3 mr-2 text-gray-400" />
                    {example}
                  </li>
                ))}
              </ul>
            </div>
          </button>
        ))}
      </FormSection>

      {/* Info box */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-sm text-gray-600">
          <strong>Not sure?</strong> If you&apos;re initiating a request to the court,
          choose &quot;Filing a motion.&quot; If someone else filed a motion against you
          and you need to respond, choose &quot;Opposing a motion.&quot;
        </p>
      </div>
    </div>
  );
}

export default PathSelection;
