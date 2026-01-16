'use client'

import Link from 'next/link'
import { useOrderForm } from '@/hooks/use-order-form'
import { getMotionById, JURISDICTIONS, RUSH_OPTIONS } from '@/config/motion-types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { FileText, Calendar, User, Scale, AlertTriangle } from 'lucide-react'

export function OrderSummary() {
  const {
    motionType,
    turnaround,
    filingDeadline,
    basePrice,
    rushSurcharge,
    totalPrice,
    jurisdiction,
    jurisdictionOther,
    courtDivision,
    caseNumber,
    caseCaption,
    parties,
    documents,
    supervisionAcknowledged,
    updateField,
  } = useOrderForm()

  const motion = motionType ? getMotionById(motionType) : null
  const jurisdictionName =
    jurisdiction === 'other'
      ? jurisdictionOther
      : JURISDICTIONS.find((j) => j.id === jurisdiction)?.name
  const rushOption = RUSH_OPTIONS.find((r) => r.id === turnaround)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-navy">Review & Submit</h2>
        <p className="mt-1 text-gray-500">
          Review your order details before submitting
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-4">
          {/* Motion Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-teal" />
                Motion Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Motion Type</span>
                <span className="font-medium text-navy">{motion?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Turnaround</span>
                <span className="font-medium text-navy">{rushOption?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Filing Deadline</span>
                <span className="font-medium text-navy">
                  {filingDeadline ? formatDate(filingDeadline) : '-'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Case Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Scale className="h-4 w-4 text-teal" />
                Case Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Caption</span>
                <span className="font-medium text-navy">{caseCaption}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Case Number</span>
                <span className="font-medium text-navy">{caseNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Jurisdiction</span>
                <span className="font-medium text-navy text-right max-w-[200px]">
                  {jurisdictionName}
                </span>
              </div>
              {courtDivision && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Court/Division</span>
                  <span className="font-medium text-navy">{courtDivision}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Parties */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-teal" />
                Parties
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {parties
                .filter((p) => p.name && p.role)
                .map((party, index) => (
                  <div key={index} className="flex justify-between">
                    <span className="text-gray-500">{party.role}</span>
                    <span className="font-medium text-navy">{party.name}</span>
                  </div>
                ))}
            </CardContent>
          </Card>

          {/* Documents */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-teal" />
                Documents ({documents.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {documents.length === 0 ? (
                <p className="text-gray-500">No documents uploaded</p>
              ) : (
                <ul className="space-y-1">
                  {documents.map((doc) => (
                    <li key={doc.id} className="text-gray-700 truncate">
                      {doc.name}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Price Summary */}
          <Card className="bg-gray-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Order Total</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Base Price</span>
                <span>
                  {basePrice !== null ? formatCurrency(basePrice) : '-'}
                </span>
              </div>
              {rushSurcharge > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Rush Surcharge</span>
                  <span className="text-orange-600">
                    +{formatCurrency(rushSurcharge)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Revision Included</span>
                <span className="text-green-600">1 round</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="font-semibold text-navy">Total Due</span>
                <span className="text-xl font-bold text-navy">
                  {formatCurrency(totalPrice)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Acknowledgment */}
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-semibold">Supervision Acknowledgment</p>
                  <p className="mt-1">
                    I understand and acknowledge that I am responsible for
                    supervising all work product prepared by Motion Granted. I
                    will review the draft before filing and bear professional
                    responsibility for all content filed with the court.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="acknowledgment"
                  checked={supervisionAcknowledged}
                  onCheckedChange={(checked) =>
                    updateField('supervisionAcknowledged', checked === true)
                  }
                />
                <Label
                  htmlFor="acknowledgment"
                  className="text-sm font-normal cursor-pointer leading-relaxed"
                >
                  I acknowledge that Motion Granted does not provide legal
                  advice or representation, and I am solely responsible for
                  supervising all work product.{' '}
                  <Link
                    href="/disclaimer"
                    target="_blank"
                    className="text-teal hover:underline"
                  >
                    View Disclaimer
                  </Link>
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* Payment info */}
          <Card>
            <CardContent className="pt-6 text-sm text-gray-600">
              <p>
                Payment is processed securely via Stripe. Your card will be
                charged immediately upon submission. You will receive a
                confirmation email with your order details.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
