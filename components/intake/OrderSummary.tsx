/**
 * Order Summary Component
 *
 * v6.3: Final step - review and confirm order.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useIntakeForm } from '@/lib/intake/context';
import { MOTION_TYPE_REGISTRY, getMotionBySlug } from '@/lib/workflow/motion-type-registry';
import { JURISDICTIONS, getJurisdictionByCode, getCourtByCode } from '@/lib/intake/jurisdictions';

function getMotionTypeByCode(code: string) {
  return getMotionBySlug(code) ?? MOTION_TYPE_REGISTRY.find(m => m.name === code);
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
}

function getEstimatedDeliveryDate(motionType: string, rushDelivery: boolean): Date {
  const motion = getMotionBySlug(motionType);
  const tier = motion?.tier ?? 'B';
  const standardDays: Record<string, number> = { A: 3, B: 5, C: 7, D: 10 };
  const turnaroundDays = rushDelivery ? Math.max(1, Math.ceil((standardDays[tier] ?? 5) / 2)) : (standardDays[tier] ?? 5);
  const deliveryDate = new Date();
  let daysAdded = 0;
  while (daysAdded < turnaroundDays) {
    deliveryDate.setDate(deliveryDate.getDate() + 1);
    const dayOfWeek = deliveryDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) daysAdded++;
  }
  return deliveryDate;
}
import { FormSection } from './shared/FormSection';
import {
  CheckCircle,
  FileText,
  Calendar,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';

export function OrderSummary() {
  const { formData, setCanProceed, isSubmitting } = useIntakeForm();
  const [confirmations, setConfirmations] = useState({
    accurate: false,
    responsibility: false,
  });

  const motionType = formData.motionType
    ? getMotionTypeByCode(formData.motionType)
    : null;
  const jurisdiction = formData.jurisdiction
    ? getJurisdictionByCode(formData.jurisdiction)
    : null;
  const court =
    formData.jurisdiction && formData.court
      ? getCourtByCode(formData.jurisdiction, formData.court)
      : null;

  const allConfirmed = confirmations.accurate && confirmations.responsibility;

  useEffect(() => {
    setCanProceed(allConfirmed && !isSubmitting);
  }, [allConfirmed, isSubmitting, setCanProceed]);

  const handleConfirmationChange = (key: keyof typeof confirmations) => {
    setConfirmations((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const estimatedDelivery = formData.motionType
    ? getEstimatedDeliveryDate(formData.motionType, formData.rushDelivery || false)
    : null;

  const isOpposition = formData.path === 'B';

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Order Summary</h2>
        <p className="mt-2 text-gray-600">Review your order before submitting</p>
      </div>

      {/* Order Details */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Order Details</h3>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Case Info */}
          <SummarySection title="Case Information">
            <SummaryRow label="Case" value={formData.caseCaption || '—'} />
            <SummaryRow label="Case Number" value={formData.caseNumber || '—'} />
            <SummaryRow
              label="Court"
              value={`${court?.name || '—'} (${jurisdiction?.name || '—'})`}
            />
            {formData.judge && (
              <SummaryRow label="Judge" value={formData.judge} />
            )}
          </SummarySection>

          {/* Motion Info */}
          <SummarySection title="Motion Details">
            <SummaryRow
              label="Path"
              value={isOpposition ? 'Opposing a Motion' : 'Filing a Motion'}
            />
            <SummaryRow
              label="Motion Type"
              value={`${isOpposition ? 'Opposition to ' : ''}${motionType?.name || '—'}`}
            />
            <SummaryRow label="Tier" value={`Tier ${formData.tier}`} />
          </SummarySection>

          {/* Timeline */}
          <SummarySection title="Timeline">
            <SummaryRow
              label="Filing Deadline"
              value={
                formData.filingDeadline
                  ? new Date(formData.filingDeadline).toLocaleDateString(
                      'en-US',
                      {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      }
                    )
                  : '—'
              }
            />
            <SummaryRow
              label="Estimated Delivery"
              value={
                estimatedDelivery
                  ? estimatedDelivery.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })
                  : '—'
              }
            />
            <SummaryRow
              label="Rush Delivery"
              value={formData.rushDelivery ? 'Yes (+50%)' : 'No'}
            />
          </SummarySection>

          {/* Documents */}
          <SummarySection title="Documents Uploaded">
            {formData.uploadedFiles && formData.uploadedFiles.length > 0 ? (
              <ul className="space-y-1">
                {formData.uploadedFiles.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center text-sm text-gray-600"
                  >
                    <FileText className="w-4 h-4 mr-2 text-gray-400" />
                    {file.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 italic">
                No documents uploaded
              </p>
            )}
          </SummarySection>

          {/* Add-Ons */}
          {formData.addOns &&
            formData.addOns.filter((a) => a.selected).length > 0 && (
              <SummarySection title="Add-On Services">
                <ul className="space-y-1">
                  {formData.addOns
                    .filter((a) => a.selected)
                    .map((addon) => (
                      <li
                        key={addon.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-gray-600">{addon.name}</span>
                        <span className="text-gray-900">
                          {addon.id === 'reply'
                            ? '60% of base'
                            : `$${addon.price.toLocaleString()}`}
                        </span>
                      </li>
                    ))}
                </ul>
              </SummarySection>
            )}
        </div>
      </div>

      {/* Pricing */}
      {formData.pricing && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
            <DollarSign className="w-5 h-5 mr-2 text-blue-600" />
            Pricing
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between text-gray-600">
              <span>Base Price</span>
              <span>{formatPrice(formData.pricing.basePrice)}</span>
            </div>
            {formData.pricing.rushFee > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Rush Delivery</span>
                <span>{formatPrice(formData.pricing.rushFee)}</span>
              </div>
            )}
            {formData.pricing.addOnTotal > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Add-Ons</span>
                <span>{formatPrice(formData.pricing.addOnTotal)}</span>
              </div>
            )}
            <div className="pt-2 border-t border-blue-200 flex justify-between font-semibold text-lg">
              <span>Total</span>
              <span className="text-blue-700">
                {formatPrice(formData.pricing.total)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Confirmations */}
      <div className="space-y-3">
        <label
          className={`
            flex items-start p-4 rounded-lg border cursor-pointer transition-all
            ${confirmations.accurate
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 hover:border-green-300'
            }
          `}
        >
          <input
            type="checkbox"
            checked={confirmations.accurate}
            onChange={() => handleConfirmationChange('accurate')}
            className="mt-0.5 h-4 w-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
          />
          <span className="ml-3 text-sm text-gray-700">
            I confirm that my Statement of Facts and Drafting Instructions are
            complete and accurate.
          </span>
        </label>

        <label
          className={`
            flex items-start p-4 rounded-lg border cursor-pointer transition-all
            ${confirmations.responsibility
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 hover:border-green-300'
            }
          `}
        >
          <input
            type="checkbox"
            checked={confirmations.responsibility}
            onChange={() => handleConfirmationChange('responsibility')}
            className="mt-0.5 h-4 w-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
          />
          <span className="ml-3 text-sm text-gray-700">
            I understand that Motion Granted provides document preparation
            assistance, and I retain professional responsibility for all filings.
          </span>
        </label>
      </div>

      {/* Disclaimer */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="ml-3 text-sm text-amber-800">
            <p className="font-medium">Important Reminder</p>
            <p className="mt-1">
              All documents prepared by Motion Granted require attorney review
              before filing. The filing attorney is responsible for verifying
              accuracy and making strategic decisions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummarySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
        {title}
      </h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="text-gray-900 font-medium text-right max-w-[60%]">
        {value}
      </span>
    </div>
  );
}

export default OrderSummary;
