/**
 * SUBMIT NEW MATTER — Consolidated Intake Form (SP-14)
 *
 * This is the ONLY customer-facing intake form. The 8-step wizard
 * has been removed. Both "Submit New Matter" sidebar link and
 * "New Order" dashboard action route here.
 *
 * Field Order (BINDING):
 * 1.  Filing Posture (PATH A vs PATH B)
 * 2.  Jurisdiction (drives motion type filter)
 * 3.  Court (filtered by jurisdiction)
 * 4.  Motion Type (filtered by jurisdiction, shows tier + price)
 * 5.  Turnaround (Standard / Rush 48h / Rush 24h)
 * 6.  Case Number
 * 7.  Party Represented
 * 8.  Plaintiff Name(s)
 * 9.  Defendant Name(s)
 * 10. Judge Name (optional)
 * 11. Opposing Counsel (optional)
 * 12. Opposing Firm (optional)
 * 13. Statement of Facts
 * 14. Drafting Instructions
 * 15. Document Upload (changes based on Filing Posture)
 *
 * REMOVED FIELDS:
 * - Filing Deadline (attorney manages own deadlines)
 * - Hearing Date (attorney manages own deadlines)
 * - Procedural History (no value)
 *
 * @module submit-page
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  type Jurisdiction,
  type RushTier,
  type PriceBreakdown,
  type GroupedMotions,
  JURISDICTIONS,
  getGroupedMotions,
  getPriceBreakdown,
  RUSH_MULTIPLIERS,
  CA_MULTIPLIER,
} from '@/lib/workflow/jurisdiction-filter';
import { getMotionById, type MotionTypeDefinition } from '@/lib/workflow/motion-type-registry';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type FilingPosture = 'FILING' | 'RESPONDING';

type PartyType =
  | 'Plaintiff'
  | 'Defendant'
  | 'Cross-Complainant'
  | 'Cross-Defendant'
  | 'Petitioner'
  | 'Respondent';

/** Map jurisdiction-filter RushTier to the DB turnaround values */
const RUSH_TO_DB: Record<RushTier, 'standard' | 'rush_72' | 'rush_48'> = {
  standard: 'standard',
  rush_48h: 'rush_72',  // 48h rush (+25%) maps to DB rush_72
  rush_24h: 'rush_48',  // 24h rush (+50%) maps to DB rush_48
};

/** Map tier letter to DB integer */
const TIER_TO_INT: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

// Upload with progress tracking for large files
function uploadWithProgress(
  file: File,
  orderId: string,
  documentType: string,
  onProgress: (percent: number) => void
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('orderId', orderId);
    formData.append('documentType', documentType);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ ok: true });
      } else {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve({ ok: false, error: response.error || `Upload failed (${xhr.status})` });
        } catch {
          resolve({ ok: false, error: `Upload failed (${xhr.status})` });
        }
      }
    });

    xhr.addEventListener('error', () => resolve({ ok: false, error: 'Network error during upload' }));
    xhr.addEventListener('timeout', () => resolve({ ok: false, error: 'Upload timed out' }));

    xhr.timeout = 300000; // 5 minute timeout
    xhr.open('POST', '/api/documents');
    xhr.send(formData);
  });
}

interface FormState {
  // Section 1: Motion & Case Details
  filingPosture: FilingPosture | null;
  jurisdictionId: string;
  court: string;
  motionTypeId: number | null;
  turnaround: RushTier;
  caseNumber: string;
  caseNotFiled: boolean;
  partyRepresented: PartyType | null;
  plaintiffNames: string;
  defendantNames: string;
  judgeName: string;
  opposingCounsel: string;
  opposingFirm: string;

  // Section 2: Case Narrative
  statementOfFacts: string;
  draftingInstructions: string;

  // Section 3: Documents
  documents: File[];
  opponentMotion: File | null; // Required for PATH B
}

interface FormErrors {
  [key: string]: string;
}

interface UploadProgress {
  currentFile: string;
  currentIndex: number;
  totalFiles: number;
  fileProgress: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function SubmitNewMatterPage() {
  const router = useRouter();
  const supabase = createClient();

  // ─────────────────────────────────────────────────────────────────────────
  // Form State
  // ─────────────────────────────────────────────────────────────────────────

  const [form, setForm] = useState<FormState>({
    filingPosture: null,
    jurisdictionId: '',
    court: '',
    motionTypeId: null,
    turnaround: 'standard',
    caseNumber: '',
    caseNotFiled: false,
    partyRepresented: null,
    plaintiffNames: '',
    defendantNames: '',
    judgeName: '',
    opposingCounsel: '',
    opposingFirm: '',
    statementOfFacts: '',
    draftingInstructions: '',
    documents: [],
    opponentMotion: null,
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPrePopulatedBanner, setShowPrePopulatedBanner] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Derived State
  // ─────────────────────────────────────────────────────────────────────────

  const groupedMotions: GroupedMotions[] | null = form.jurisdictionId
    ? getGroupedMotions(form.jurisdictionId)
    : null;

  const selectedJurisdiction = JURISDICTIONS.find(j => j.id === form.jurisdictionId);
  const courts = selectedJurisdiction?.courts ?? [];

  let priceBreakdown: PriceBreakdown | null = null;
  if (form.motionTypeId && form.jurisdictionId) {
    try {
      priceBreakdown = getPriceBreakdown(form.motionTypeId, form.jurisdictionId, form.turnaround);
    } catch {
      // Motion not available in jurisdiction — will be caught by validation
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pre-Population (Task 6)
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const loadPrePopulation = async () => {
      try {
        const response = await fetch('/api/user/prepopulation');
        if (!response.ok) return;

        const data = await response.json();

        // Pre-fill from profile (state of licensure -> jurisdiction)
        if (data.primaryState) {
          const jurisdictionMap: Record<string, string> = {
            LA: 'LA_STATE',
            CA: 'CA_STATE',
          };
          if (jurisdictionMap[data.primaryState]) {
            setForm(prev => ({
              ...prev,
              jurisdictionId: jurisdictionMap[data.primaryState],
            }));
          }
        }

        // Pre-fill from last order (if exists)
        if (data.lastOrder) {
          setForm(prev => ({
            ...prev,
            caseNumber: data.lastOrder.case_number || '',
            court: data.lastOrder.court_division || '',
            plaintiffNames: data.lastOrder.plaintiff_names || '',
            defendantNames: data.lastOrder.defendant_names || '',
            judgeName: data.lastOrder.judge_name || '',
            opposingCounsel: data.lastOrder.opposing_counsel_name || '',
            opposingFirm: data.lastOrder.opposing_counsel_firm || '',
          }));
          setShowPrePopulatedBanner(true);
        }
      } catch (error) {
        console.error('Failed to load pre-population:', error);
      }
    };

    loadPrePopulation();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Clear All Handler (Task 6)
  // ─────────────────────────────────────────────────────────────────────────

  const handleClearAll = useCallback(() => {
    setForm(prev => ({
      ...prev,
      caseNumber: '',
      court: '',
      plaintiffNames: '',
      defendantNames: '',
      judgeName: '',
      opposingCounsel: '',
      opposingFirm: '',
    }));
    setShowPrePopulatedBanner(false);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Field Change Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleJurisdictionChange = (newJurisdictionId: string) => {
    setForm(prev => ({
      ...prev,
      jurisdictionId: newJurisdictionId,
      court: '',
      motionTypeId: null,
    }));
    setErrors(prev => ({ ...prev, jurisdictionId: '', court: '', motionTypeId: '' }));
  };

  const handleMotionTypeChange = (motionId: number) => {
    setForm(prev => ({
      ...prev,
      motionTypeId: motionId,
    }));
    setErrors(prev => ({ ...prev, motionTypeId: '' }));
  };

  const handleTurnaroundChange = (turnaround: RushTier) => {
    setForm(prev => ({ ...prev, turnaround }));
  };

  const handleFilingPostureChange = (posture: FilingPosture) => {
    setForm(prev => ({
      ...prev,
      filingPosture: posture,
      opponentMotion: null,
    }));
    setErrors(prev => ({ ...prev, filingPosture: '', opponentMotion: '' }));
  };

  // ─────────────────────────────────────────────────────────────────────────
  // File Upload Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleDocumentUpload = (files: FileList | null) => {
    if (!files) return;

    const maxSize = 50 * 1024 * 1024;
    const acceptedTypes = ['.pdf', '.docx', '.doc', '.txt', '.rtf'];

    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (file.size > maxSize) {
        setErrors(prev => ({ ...prev, documents: `${file.name} exceeds 50MB limit` }));
        continue;
      }
      if (!acceptedTypes.includes(ext)) {
        setErrors(prev => ({ ...prev, documents: `${file.name} is not a supported file type` }));
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setForm(prev => ({ ...prev, documents: [...prev.documents, ...validFiles] }));
      setErrors(prev => ({ ...prev, documents: '' }));
    }
  };

  const handleOpponentMotionUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    const maxSize = 50 * 1024 * 1024;
    const acceptedTypes = ['.pdf', '.docx', '.doc'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    if (file.size > maxSize) {
      setErrors(prev => ({ ...prev, opponentMotion: 'File exceeds 50MB limit' }));
      return;
    }
    if (!acceptedTypes.includes(ext)) {
      setErrors(prev => ({ ...prev, opponentMotion: 'Please upload a PDF or Word document' }));
      return;
    }

    setForm(prev => ({ ...prev, opponentMotion: file }));
    setErrors(prev => ({ ...prev, opponentMotion: '' }));
  };

  const removeDocument = (index: number) => {
    setForm(prev => ({
      ...prev,
      documents: prev.documents.filter((_, i) => i !== index),
    }));
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Validation
  // ─────────────────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!form.filingPosture) {
      newErrors.filingPosture = 'Please select whether you are filing or responding';
    }
    if (!form.jurisdictionId) {
      newErrors.jurisdictionId = 'Please select a jurisdiction';
    }
    if (!form.court) {
      newErrors.court = 'Please select a court';
    }
    if (!form.motionTypeId) {
      newErrors.motionTypeId = 'Please select a motion type';
    }
    if (!form.caseNumber && !form.caseNotFiled) {
      newErrors.caseNumber = 'Please enter a case number or check "Case not yet filed"';
    }
    if (!form.partyRepresented) {
      newErrors.partyRepresented = 'Please select the party you represent';
    }
    if (!form.plaintiffNames.trim()) {
      newErrors.plaintiffNames = 'Please enter plaintiff name(s)';
    }
    if (!form.defendantNames.trim()) {
      newErrors.defendantNames = 'Please enter defendant name(s)';
    }
    if (form.statementOfFacts.length < 200) {
      newErrors.statementOfFacts = `Statement of facts must be at least 200 characters (currently ${form.statementOfFacts.length})`;
    }
    if (form.draftingInstructions.length < 50) {
      newErrors.draftingInstructions = `Drafting instructions must be at least 50 characters (currently ${form.draftingInstructions.length})`;
    }

    // PATH B: Opponent motion required
    if (form.filingPosture === 'RESPONDING' && !form.opponentMotion) {
      newErrors.opponentMotion = 'Please upload the motion you are opposing';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Submit Handler
  // ─────────────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      const firstError = document.querySelector('[data-error="true"]');
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setIsSubmitting(true);

    try {
      // Look up motion details from registry
      const motion = form.motionTypeId ? getMotionById(form.motionTypeId) : null;
      if (!motion) {
        throw new Error('Invalid motion type selected');
      }

      // Map rush tier to DB value
      const dbTurnaround = RUSH_TO_DB[form.turnaround];

      // Calculate pricing
      const rushMultiplier = RUSH_MULTIPLIERS[form.turnaround].multiplier;
      const jurisdictionMultiplier = selectedJurisdiction?.stateCode === 'CA' ? CA_MULTIPLIER : 1.0;
      const basePrice = motion.basePrice;
      const totalPrice = Math.round(basePrice * jurisdictionMultiplier * rushMultiplier);
      const rushSurcharge = Math.round(basePrice * jurisdictionMultiplier * (rushMultiplier - 1));

      // Build order payload — compatible with existing API schema
      const orderData = {
        motion_type: motion.slug,
        motion_tier: TIER_TO_INT[motion.tier] ?? 1,
        base_price: basePrice,
        turnaround: dbTurnaround,
        rush_surcharge: rushSurcharge,
        total_price: totalPrice,
        jurisdiction: form.jurisdictionId,
        court_division: form.court || null,
        case_number: form.caseNotFiled ? 'NOT_YET_FILED' : form.caseNumber,
        statement_of_facts: form.statementOfFacts,
        instructions: form.draftingInstructions,
        // SP-14 new fields (stored in related_entities JSON by API)
        filing_posture: form.filingPosture,
        plaintiff_names: form.plaintiffNames,
        defendant_names: form.defendantNames,
        party_represented: form.partyRepresented,
        judge_name: form.judgeName || undefined,
        opposing_counsel_name: form.opposingCounsel || undefined,
        opposing_counsel_firm: form.opposingFirm || undefined,
      };

      // Submit order
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit order');
      }

      const { order: createdOrder } = await response.json();
      const orderId = createdOrder?.id;

      if (!orderId) {
        throw new Error('Order created but no ID returned');
      }

      // Upload documents one by one with progress tracking
      const allFiles: { file: File; type: string }[] = [];

      // Opponent motion first (PATH B)
      if (form.opponentMotion) {
        allFiles.push({ file: form.opponentMotion, type: 'opponent_motion' });
      }

      // Supporting documents
      form.documents.forEach(doc => {
        allFiles.push({ file: doc, type: 'supporting_document' });
      });

      let failedFiles: string[] = [];
      for (let i = 0; i < allFiles.length; i++) {
        const { file, type } = allFiles[i];
        setUploadProgress({
          currentFile: file.name,
          currentIndex: i + 1,
          totalFiles: allFiles.length,
          fileProgress: 0,
        });

        const result = await uploadWithProgress(
          file,
          orderId,
          type,
          (percent) => setUploadProgress(prev => prev ? { ...prev, fileProgress: percent } : null)
        );

        if (!result.ok) {
          console.error(`Upload failed for ${file.name}:`, result.error);
          failedFiles.push(file.name);
        }
      }

      setUploadProgress(null);

      if (failedFiles.length > 0) {
        console.error('Some documents failed to upload:', failedFiles);
      }

      // Redirect to Stripe Checkout for payment
      try {
        const checkoutResponse = await fetch('/api/payments/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId }),
        });

        const checkoutData = await checkoutResponse.json();

        if (!checkoutResponse.ok) {
          if (checkoutResponse.status === 503) {
            setErrors(prev => ({
              ...prev,
              submit: 'Payment system temporarily unavailable. Please try again.',
            }));
            return;
          }
          throw new Error(checkoutData.error || 'Failed to create checkout session');
        }

        // Handle bypass mode (STRIPE_PAYMENT_REQUIRED=false)
        if (checkoutData.bypassed) {
          // Payment is bypassed — trigger automation directly
          await fetch('/api/automation/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId }),
          });
          router.push(`/orders/${orderId}?payment=bypassed`);
          return;
        }

        // Redirect to Stripe hosted checkout page
        if (checkoutData.url) {
          window.location.href = checkoutData.url;
        } else {
          throw new Error('No checkout URL returned');
        }
      } catch (checkoutError) {
        console.error('Checkout error:', checkoutError);
        // Order was created but checkout failed — redirect to order page
        setErrors(prev => ({
          ...prev,
          submit: 'Failed to redirect to payment. Please try again.',
        }));
        router.push(`/orders/${orderId}?payment=error`);
      }
    } catch (error) {
      console.error('Submit error:', error);
      setErrors(prev => ({
        ...prev,
        submit: error instanceof Error ? error.message : 'Failed to submit order',
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render Helpers
  // ─────────────────────────────────────────────────────────────────────────

  const renderMotionTypeDropdown = () => {
    if (!groupedMotions) {
      return (
        <select disabled className="w-full p-3 border rounded-lg bg-gray-100 text-gray-500">
          <option>Select jurisdiction first</option>
        </select>
      );
    }

    return (
      <select
        value={form.motionTypeId ?? ''}
        onChange={(e) => handleMotionTypeChange(Number(e.target.value))}
        className={`w-full p-3 border rounded-lg ${errors.motionTypeId ? 'border-red-500' : 'border-gray-300'}`}
        data-error={!!errors.motionTypeId || undefined}
      >
        <option value="">Select motion type...</option>
        {groupedMotions.map(group => (
          group.motions.length > 0 && (
            <optgroup key={group.tier} label={`${group.tierName} ($${group.basePrice})`}>
              {group.motions.map((motion: MotionTypeDefinition) => (
                <option key={motion.id} value={motion.id}>
                  {motion.name} — ${motion.basePrice}
                </option>
              ))}
            </optgroup>
          )
        ))}
      </select>
    );
  };

  // Compute price display details
  const priceDisplay = priceBreakdown ? {
    base: priceBreakdown.basePrice,
    jurisdictionAdjustment: priceBreakdown.jurisdictionMultiplier > 1
      ? Math.round(priceBreakdown.basePrice * (priceBreakdown.jurisdictionMultiplier - 1))
      : 0,
    jurisdictionLabel: priceBreakdown.jurisdictionMultiplier > 1 ? 'California adjustment (+20%)' : '',
    rushAdjustment: priceBreakdown.rushMultiplier > 1
      ? Math.round(priceBreakdown.basePrice * priceBreakdown.jurisdictionMultiplier * (priceBreakdown.rushMultiplier - 1))
      : 0,
    rushLabel: RUSH_MULTIPLIERS[form.turnaround].label,
    total: priceBreakdown.finalPrice,
    tierLabel: priceBreakdown.tierLabel,
  } : null;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2 text-navy">Submit New Matter</h1>
      <p className="text-gray-600 mb-6">
        Complete the form below to submit a motion drafting order.
      </p>

      {/* Pre-populated Banner (Task 6) */}
      {showPrePopulatedBanner && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex justify-between items-center">
          <span className="text-blue-800">
            Case details pre-filled from your last order. Starting a different case?
          </span>
          <button
            type="button"
            onClick={handleClearAll}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Clear All
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 1: MOTION & CASE DETAILS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 text-navy">Motion & Case Details</h2>

          {/* Field 1: Filing Posture */}
          <div className="mb-4">
            <label className="block font-medium mb-2">
              What are you doing? <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-4">
              <label className={`flex-1 p-4 border rounded-lg cursor-pointer transition ${
                form.filingPosture === 'FILING'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}>
                <input
                  type="radio"
                  name="filingPosture"
                  value="FILING"
                  checked={form.filingPosture === 'FILING'}
                  onChange={() => handleFilingPostureChange('FILING')}
                  className="sr-only"
                />
                <div className="font-medium">I am filing a motion</div>
                <div className="text-sm text-gray-600">I am bringing a motion before the court</div>
              </label>

              <label className={`flex-1 p-4 border rounded-lg cursor-pointer transition ${
                form.filingPosture === 'RESPONDING'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}>
                <input
                  type="radio"
                  name="filingPosture"
                  value="RESPONDING"
                  checked={form.filingPosture === 'RESPONDING'}
                  onChange={() => handleFilingPostureChange('RESPONDING')}
                  className="sr-only"
                />
                <div className="font-medium">I am opposing a motion</div>
                <div className="text-sm text-gray-600">I am responding to the opposing party&apos;s motion</div>
              </label>
            </div>
            {errors.filingPosture && (
              <p className="text-red-500 text-sm mt-1" data-error="true">{errors.filingPosture}</p>
            )}
          </div>

          {/* Field 2: Jurisdiction */}
          <div className="mb-4">
            <label className="block font-medium mb-2">
              Jurisdiction <span className="text-red-500">*</span>
            </label>
            <select
              value={form.jurisdictionId}
              onChange={(e) => handleJurisdictionChange(e.target.value)}
              className={`w-full p-3 border rounded-lg ${errors.jurisdictionId ? 'border-red-500' : 'border-gray-300'}`}
              data-error={!!errors.jurisdictionId || undefined}
            >
              <option value="">Select jurisdiction...</option>
              {JURISDICTIONS.map(j => (
                <option key={j.id} value={j.id}>{j.name}</option>
              ))}
            </select>
            {errors.jurisdictionId && (
              <p className="text-red-500 text-sm mt-1">{errors.jurisdictionId}</p>
            )}
          </div>

          {/* Field 3: Court */}
          <div className="mb-4">
            <label className="block font-medium mb-2">
              Court <span className="text-red-500">*</span>
            </label>
            <select
              value={form.court}
              onChange={(e) => {
                setForm(prev => ({ ...prev, court: e.target.value }));
                setErrors(prev => ({ ...prev, court: '' }));
              }}
              disabled={!form.jurisdictionId}
              className={`w-full p-3 border rounded-lg ${
                !form.jurisdictionId
                  ? 'bg-gray-100 text-gray-500'
                  : errors.court
                    ? 'border-red-500'
                    : 'border-gray-300'
              }`}
              data-error={!!errors.court || undefined}
            >
              <option value="">{form.jurisdictionId ? 'Select court...' : 'Select jurisdiction first'}</option>
              {courts.map(court => (
                <option key={court.id} value={court.id}>{court.name}</option>
              ))}
            </select>
            {errors.court && (
              <p className="text-red-500 text-sm mt-1">{errors.court}</p>
            )}
          </div>

          {/* Field 4: Motion Type */}
          <div className="mb-4">
            <label className="block font-medium mb-2">
              {form.filingPosture === 'RESPONDING' ? 'Motion You Are Opposing' : 'Motion Type'}{' '}
              <span className="text-red-500">*</span>
            </label>
            {renderMotionTypeDropdown()}
            {errors.motionTypeId && (
              <p className="text-red-500 text-sm mt-1" data-error="true">{errors.motionTypeId}</p>
            )}
          </div>

          {/* Field 5: Turnaround */}
          <div className="mb-4">
            <label className="block font-medium mb-2">Turnaround <span className="text-red-500">*</span></label>
            <div className="flex gap-4">
              {([
                { value: 'standard' as RushTier, label: 'Standard', desc: '4-5 business days', badge: null },
                { value: 'rush_48h' as RushTier, label: 'Rush 48h', desc: '2 business days', badge: '+25%' },
                { value: 'rush_24h' as RushTier, label: 'Rush 24h', desc: '1 business day', badge: '+50%' },
              ]).map(option => (
                <label
                  key={option.value}
                  className={`flex-1 p-4 border rounded-lg cursor-pointer transition relative ${
                    form.turnaround === option.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="turnaround"
                    value={option.value}
                    checked={form.turnaround === option.value}
                    onChange={() => handleTurnaroundChange(option.value)}
                    className="sr-only"
                  />
                  <div className="font-medium">{option.label}</div>
                  <div className="text-sm text-gray-600">{option.desc}</div>
                  {option.badge && (
                    <span className="absolute top-2 right-2 px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded">
                      {option.badge}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Field 6: Case Number */}
          <div className="mb-4">
            <label className="block font-medium mb-2">
              Case Number <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-4 items-center">
              <input
                type="text"
                value={form.caseNumber}
                onChange={(e) => {
                  setForm(prev => ({ ...prev, caseNumber: e.target.value }));
                  setErrors(prev => ({ ...prev, caseNumber: '' }));
                }}
                disabled={form.caseNotFiled}
                placeholder="e.g., 2:24-cv-01234 or C-123456"
                className={`flex-1 p-3 border rounded-lg ${
                  form.caseNotFiled
                    ? 'bg-gray-100 text-gray-500'
                    : errors.caseNumber
                      ? 'border-red-500'
                      : 'border-gray-300'
                }`}
                data-error={!!errors.caseNumber || undefined}
              />
              <label className="flex items-center gap-2 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={form.caseNotFiled}
                  onChange={(e) => setForm(prev => ({
                    ...prev,
                    caseNotFiled: e.target.checked,
                    caseNumber: e.target.checked ? '' : prev.caseNumber,
                  }))}
                  className="w-4 h-4"
                />
                <span className="text-sm">Case not yet filed</span>
              </label>
            </div>
            {errors.caseNumber && (
              <p className="text-red-500 text-sm mt-1">{errors.caseNumber}</p>
            )}
          </div>

          {/* Field 7: Party Represented */}
          <div className="mb-4">
            <label className="block font-medium mb-2">
              Party Represented <span className="text-red-500">*</span>
            </label>
            <select
              value={form.partyRepresented ?? ''}
              onChange={(e) => {
                setForm(prev => ({ ...prev, partyRepresented: e.target.value as PartyType }));
                setErrors(prev => ({ ...prev, partyRepresented: '' }));
              }}
              className={`w-full p-3 border rounded-lg ${errors.partyRepresented ? 'border-red-500' : 'border-gray-300'}`}
              data-error={!!errors.partyRepresented || undefined}
            >
              <option value="">Select party...</option>
              <option value="Plaintiff">Plaintiff</option>
              <option value="Defendant">Defendant</option>
              <option value="Cross-Complainant">Cross-Complainant</option>
              <option value="Cross-Defendant">Cross-Defendant</option>
              <option value="Petitioner">Petitioner</option>
              <option value="Respondent">Respondent</option>
            </select>
            {errors.partyRepresented && (
              <p className="text-red-500 text-sm mt-1">{errors.partyRepresented}</p>
            )}
          </div>

          {/* Field 8: Plaintiff Name(s) */}
          <div className="mb-4">
            <label className="block font-medium mb-2">
              Plaintiff Name(s) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.plaintiffNames}
              onChange={(e) => {
                setForm(prev => ({ ...prev, plaintiffNames: e.target.value }));
                setErrors(prev => ({ ...prev, plaintiffNames: '' }));
              }}
              placeholder="Use semicolons for multiple parties"
              className={`w-full p-3 border rounded-lg ${errors.plaintiffNames ? 'border-red-500' : 'border-gray-300'}`}
              data-error={!!errors.plaintiffNames || undefined}
            />
            {errors.plaintiffNames && (
              <p className="text-red-500 text-sm mt-1">{errors.plaintiffNames}</p>
            )}
          </div>

          {/* Field 9: Defendant Name(s) */}
          <div className="mb-4">
            <label className="block font-medium mb-2">
              Defendant Name(s) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.defendantNames}
              onChange={(e) => {
                setForm(prev => ({ ...prev, defendantNames: e.target.value }));
                setErrors(prev => ({ ...prev, defendantNames: '' }));
              }}
              placeholder="Use semicolons for multiple parties"
              className={`w-full p-3 border rounded-lg ${errors.defendantNames ? 'border-red-500' : 'border-gray-300'}`}
              data-error={!!errors.defendantNames || undefined}
            />
            {errors.defendantNames && (
              <p className="text-red-500 text-sm mt-1">{errors.defendantNames}</p>
            )}
          </div>

          {/* Field 10: Judge Name (optional) */}
          <div className="mb-4">
            <label className="block font-medium mb-2">Judge Name</label>
            <input
              type="text"
              value={form.judgeName}
              onChange={(e) => setForm(prev => ({ ...prev, judgeName: e.target.value }))}
              placeholder="e.g., Hon. Jane Smith (leave blank if unknown)"
              className="w-full p-3 border border-gray-300 rounded-lg"
            />
            <p className="text-sm text-gray-500 mt-1">
              Used for judge-specific preferences in the drafting process
            </p>
          </div>

          {/* Fields 11-12: Opposing Counsel (optional) */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-medium mb-2">Opposing Counsel</label>
              <input
                type="text"
                value={form.opposingCounsel}
                onChange={(e) => setForm(prev => ({ ...prev, opposingCounsel: e.target.value }))}
                placeholder="Name (optional)"
                className="w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium mb-2">Opposing Firm</label>
              <input
                type="text"
                value={form.opposingFirm}
                onChange={(e) => setForm(prev => ({ ...prev, opposingFirm: e.target.value }))}
                placeholder="Firm name (optional)"
                className="w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 2: CASE NARRATIVE */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 text-navy">Case Narrative</h2>

          {/* Field 13: Statement of Facts */}
          <div className="mb-4">
            <label className="block font-medium mb-2">
              Statement of Facts <span className="text-red-500">*</span>
              <span className="text-sm font-normal text-gray-500 ml-2">
                (minimum 200 characters)
              </span>
            </label>
            <textarea
              value={form.statementOfFacts}
              onChange={(e) => {
                setForm(prev => ({ ...prev, statementOfFacts: e.target.value }));
                if (e.target.value.length >= 200) setErrors(prev => ({ ...prev, statementOfFacts: '' }));
              }}
              rows={8}
              placeholder="Describe the relevant facts of your case. Include key dates, events, and relationships between parties. This is the primary source the AI will use to draft your motion."
              className={`w-full p-3 border rounded-lg ${errors.statementOfFacts ? 'border-red-500' : 'border-gray-300'}`}
              data-error={!!errors.statementOfFacts || undefined}
            />
            <div className="flex justify-between mt-1">
              {errors.statementOfFacts ? (
                <p className="text-red-500 text-sm">{errors.statementOfFacts}</p>
              ) : (
                <span />
              )}
              <span className={`text-sm ${form.statementOfFacts.length < 200 ? 'text-orange-500' : 'text-green-600'}`}>
                {form.statementOfFacts.length}/200 minimum
              </span>
            </div>
          </div>

          {/* Field 14: Drafting Instructions */}
          <div className="mb-4">
            <label className="block font-medium mb-2">
              Drafting Instructions <span className="text-red-500">*</span>
              <span className="text-sm font-normal text-gray-500 ml-2">
                (minimum 50 characters)
              </span>
            </label>
            <textarea
              value={form.draftingInstructions}
              onChange={(e) => {
                setForm(prev => ({ ...prev, draftingInstructions: e.target.value }));
                if (e.target.value.length >= 50) setErrors(prev => ({ ...prev, draftingInstructions: '' }));
              }}
              rows={6}
              placeholder={
                form.filingPosture === 'RESPONDING'
                  ? 'Describe your defense strategy, key arguments, and desired outcome.'
                  : 'Describe your legal theory, key arguments, authorities you want cited, and desired outcome.'
              }
              className={`w-full p-3 border rounded-lg ${errors.draftingInstructions ? 'border-red-500' : 'border-gray-300'}`}
              data-error={!!errors.draftingInstructions || undefined}
            />
            <div className="flex justify-between mt-1">
              {errors.draftingInstructions ? (
                <p className="text-red-500 text-sm">{errors.draftingInstructions}</p>
              ) : (
                <span />
              )}
              <span className={`text-sm ${form.draftingInstructions.length < 50 ? 'text-orange-500' : 'text-green-600'}`}>
                {form.draftingInstructions.length}/50 minimum
              </span>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 3: DOCUMENT UPLOAD */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 text-navy">Document Upload</h2>

          {/* PATH B: Opponent Motion Upload (Required) */}
          {form.filingPosture === 'RESPONDING' && (
            <div className="mb-6">
              <label className="block font-medium mb-2">
                Motion You Are Opposing <span className="text-red-500">*</span>
              </label>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center ${
                  errors.opponentMotion
                    ? 'border-red-500 bg-red-50'
                    : form.opponentMotion
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-300 hover:border-gray-400'
                }`}
                data-error={!!errors.opponentMotion || undefined}
              >
                {form.opponentMotion ? (
                  <div className="flex items-center justify-center gap-4">
                    <span className="text-green-700">{form.opponentMotion.name}</span>
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, opponentMotion: null }))}
                      className="text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc"
                      onChange={(e) => handleOpponentMotionUpload(e.target.files)}
                      className="hidden"
                      id="opponent-motion-upload"
                    />
                    <label htmlFor="opponent-motion-upload" className="cursor-pointer">
                      <p className="text-gray-600">
                        Drop the opposing party&apos;s motion here, or{' '}
                        <span className="text-blue-600 underline">browse</span>
                      </p>
                      <p className="text-sm text-gray-500 mt-1">PDF or Word document, max 50MB</p>
                    </label>
                  </>
                )}
              </div>
              {errors.opponentMotion && (
                <p className="text-red-500 text-sm mt-1">{errors.opponentMotion}</p>
              )}
            </div>
          )}

          {/* Supporting Documents (All paths) */}
          <div>
            <label className="block font-medium mb-2">
              Supporting Documents
              <span className="text-sm font-normal text-gray-500 ml-2">(optional)</span>
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400">
              <input
                type="file"
                accept=".pdf,.docx,.doc,.txt,.rtf"
                multiple
                onChange={(e) => handleDocumentUpload(e.target.files)}
                className="hidden"
                id="document-upload"
              />
              <label htmlFor="document-upload" className="cursor-pointer">
                <p className="text-gray-600">
                  Drop files here, or{' '}
                  <span className="text-blue-600 underline">browse</span>
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  PDF, Word, TXT, RTF — max 50MB per file
                </p>
              </label>
            </div>

            {/* Document List */}
            {form.documents.length > 0 && (
              <ul className="mt-4 space-y-2">
                {form.documents.map((doc, index) => (
                  <li key={`${doc.name}-${index}`} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                    <span className="text-sm">{doc.name}</span>
                    <button
                      type="button"
                      onClick={() => removeDocument(index)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {errors.documents && (
              <p className="text-red-500 text-sm mt-1">{errors.documents}</p>
            )}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* UPLOAD PROGRESS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        {uploadProgress && (
          <section className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-navy">
                  Uploading document {uploadProgress.currentIndex} of {uploadProgress.totalFiles}
                </p>
                <p className="text-xs text-gray-500 truncate">{uploadProgress.currentFile}</p>
              </div>
              <span className="text-sm font-semibold text-blue-600">{uploadProgress.fileProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${uploadProgress.fileProgress}%` }}
              />
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PRICE BOX & SUBMIT (Task 7) */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <section className="bg-white rounded-lg shadow p-6">
          {/* Price Breakdown */}
          {priceDisplay && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-3 text-navy">Price Summary</h3>
              <p className="text-xs text-gray-500 mb-3">{priceDisplay.tierLabel}</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Base Price:</span>
                  <span>${priceDisplay.base.toFixed(2)}</span>
                </div>
                {priceDisplay.jurisdictionAdjustment > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>{priceDisplay.jurisdictionLabel}:</span>
                    <span>+${priceDisplay.jurisdictionAdjustment.toFixed(2)}</span>
                  </div>
                )}
                {priceDisplay.rushAdjustment > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>{priceDisplay.rushLabel}:</span>
                    <span>+${priceDisplay.rushAdjustment.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t pt-2 mt-2 flex justify-between font-bold text-lg">
                  <span>Total:</span>
                  <span>${priceDisplay.total.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Submit Error */}
          {errors.submit && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {errors.submit}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-4 rounded-lg font-semibold text-white transition ${
              isSubmitting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isSubmitting
              ? (uploadProgress ? 'Uploading documents...' : 'Submitting...')
              : 'Submit Order'}
          </button>

          <p className="text-center text-sm text-gray-500 mt-4">
            By submitting, you agree to our Terms of Service and confirm you are a licensed attorney.
          </p>
        </section>
      </form>
    </div>
  );
}
