/**
 * Service & Add-ons Form Component
 *
 * v6.3: Seventh step - rush delivery, add-ons, and service parties.
 */

'use client';

import React, { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useIntakeForm } from '@/lib/intake/context';
import type { AddOn } from '@/lib/intake/types';
import { calculatePricing } from '@/lib/intake/pricing';
import { FormSection } from './shared/FormSection';
import { FieldLabel } from './shared/FieldLabel';
import { Zap, Plus, Trash2, Users } from 'lucide-react';

const partySchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Name required'),
  firmName: z.string().optional(),
  address: z.string().min(1, 'Address required'),
  city: z.string().min(1, 'City required'),
  state: z.string().min(2, 'State required'),
  zip: z.string().min(5, 'ZIP required'),
  email: z.string().email().optional().or(z.literal('')),
  serviceMethod: z.enum(['electronic', 'mail', 'personal', 'overnight']),
});

const schema = z.object({
  rushDelivery: z.boolean(),
  partiesToServe: z.array(partySchema),
  addOns: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      price: z.number(),
      selected: z.boolean(),
    })
  ),
});

type FormData = z.infer<typeof schema>;

const AVAILABLE_ADDONS: Omit<AddOn, 'selected'>[] = [
  { id: 'oral-arg', name: 'Oral Argument Prep Package', price: 375 },
  { id: 'reply', name: 'Reply Brief Preparation', price: 0 }, // Calculated as 60% of base
];

export function ServiceAddonsForm() {
  const { formData, updateFormData, setCanProceed } = useIntakeForm();

  const defaultAddOns = AVAILABLE_ADDONS.map((addon) => ({
    ...addon,
    selected: formData.addOns?.find((a) => a.id === addon.id)?.selected || false,
  }));

  const { register, control, watch, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      rushDelivery: formData.rushDelivery || false,
      partiesToServe: formData.partiesToServe || [],
      addOns: defaultAddOns,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'partiesToServe',
  });

  const rushDelivery = watch('rushDelivery');
  const partiesToServe = watch('partiesToServe');
  const addOns = watch('addOns');

  // Update pricing whenever relevant fields change
  useEffect(() => {
    if (formData.tier && formData.motionType) {
      const pricing = calculatePricing({
        tier: formData.tier,
        motionType: formData.motionType,
        rushDelivery,
        addOns: addOns.filter((a) => a.selected),
      });

      updateFormData({
        rushDelivery,
        partiesToServe,
        addOns,
        pricing,
      });
    } else {
      updateFormData({
        rushDelivery,
        partiesToServe,
        addOns,
      });
    }
  }, [rushDelivery, partiesToServe, addOns, formData.tier, formData.motionType, updateFormData]);

  useEffect(() => {
    setCanProceed(true); // This step is always valid (all fields optional)
  }, [setCanProceed]);

  const addParty = () => {
    append({
      id: `party-${Date.now()}`,
      name: '',
      firmName: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      email: '',
      serviceMethod: 'electronic',
    });
  };

  const toggleAddOn = (index: number) => {
    const current = addOns[index];
    setValue(`addOns.${index}.selected`, !current.selected);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Service & Add-Ons</h2>
        <p className="mt-2 text-gray-600">
          Configure delivery options and additional services
        </p>
      </div>

      {/* Rush Delivery */}
      <FormSection>
        <div
          className={`
            p-4 rounded-lg border-2 cursor-pointer transition-all
            ${rushDelivery
              ? 'border-amber-500 bg-amber-50'
              : 'border-gray-200 hover:border-amber-300'
            }
          `}
          onClick={() => setValue('rushDelivery', !rushDelivery)}
        >
          <label className="flex items-start cursor-pointer">
            <input
              type="checkbox"
              {...register('rushDelivery')}
              className="mt-1 h-4 w-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
            />
            <div className="ml-3">
              <div className="flex items-center">
                <Zap className="w-5 h-5 text-amber-500 mr-2" />
                <span className="font-semibold text-gray-900">Rush Delivery</span>
                <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded">
                  +50%
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                Expedited processing with priority turnaround. Delivery time cut
                in half.
              </p>
            </div>
          </label>
        </div>
      </FormSection>

      {/* Add-On Services */}
      <FormSection>
        <FieldLabel>Additional Services</FieldLabel>
        <div className="mt-3 space-y-3">
          {addOns.map((addon, index) => (
            <div
              key={addon.id}
              className={`
                p-4 rounded-lg border cursor-pointer transition-all
                ${addon.selected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300'
                }
              `}
              onClick={() => toggleAddOn(index)}
            >
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={addon.selected}
                  onChange={() => toggleAddOn(index)}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-3 font-medium text-gray-900">
                  {addon.name}
                </span>
                <span className="ml-auto text-gray-600">
                  {addon.id === 'reply'
                    ? '60% of base price'
                    : `$${addon.price.toLocaleString()}`}
                </span>
              </label>
            </div>
          ))}
        </div>
      </FormSection>

      {/* Parties to Serve */}
      <FormSection>
        <div className="flex items-center justify-between mb-4">
          <FieldLabel tooltip="Add parties who should receive the filed documents">
            <Users className="w-4 h-4 inline mr-2" />
            Parties to Serve (Optional)
          </FieldLabel>
          <button
            type="button"
            onClick={addParty}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Party
          </button>
        </div>

        {fields.length === 0 ? (
          <p className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded-lg">
            No parties added. Click &quot;Add Party&quot; to include parties for
            service.
          </p>
        ) : (
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="p-4 border border-gray-200 rounded-lg bg-white"
              >
                <div className="flex justify-between items-start mb-4">
                  <h4 className="font-medium text-gray-900">
                    Party {index + 1}
                  </h4>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Name *
                    </label>
                    <input
                      {...register(`partiesToServe.${index}.name`)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      placeholder="John Smith"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Firm Name
                    </label>
                    <input
                      {...register(`partiesToServe.${index}.firmName`)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      placeholder="Smith & Associates"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Address *
                    </label>
                    <input
                      {...register(`partiesToServe.${index}.address`)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      placeholder="123 Main Street, Suite 100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      City *
                    </label>
                    <input
                      {...register(`partiesToServe.${index}.city`)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        State *
                      </label>
                      <input
                        {...register(`partiesToServe.${index}.state`)}
                        maxLength={2}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                        placeholder="CA"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        ZIP *
                      </label>
                      <input
                        {...register(`partiesToServe.${index}.zip`)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Email
                    </label>
                    <input
                      type="email"
                      {...register(`partiesToServe.${index}.email`)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Service Method *
                    </label>
                    <select
                      {...register(`partiesToServe.${index}.serviceMethod`)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    >
                      <option value="electronic">Electronic (Email)</option>
                      <option value="mail">First Class Mail</option>
                      <option value="overnight">Overnight Delivery</option>
                      <option value="personal">Personal Service</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>
    </div>
  );
}

export default ServiceAddonsForm;
