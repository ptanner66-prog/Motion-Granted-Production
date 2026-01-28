/**
 * Intake API Client
 *
 * v6.3: API integration for intake form submission.
 */

import type { IntakeFormData, PricingBreakdown } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

export interface OrderSubmissionResult {
  success: boolean;
  orderId: string;
  orderNumber: string;
  checkoutUrl?: string;
  error?: string;
}

/**
 * Submit a completed intake form
 */
export async function submitOrder(
  formData: Partial<IntakeFormData>
): Promise<OrderSubmissionResult> {
  const response = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      path: formData.path,
      caseInformation: {
        caption: formData.caseCaption,
        caseNumber: formData.caseNumber,
        jurisdiction: formData.jurisdiction,
        court: formData.court,
        judge: formData.judge,
        department: formData.department,
        filingDeadline: formData.filingDeadline,
      },
      motionDetails: {
        tier: formData.tier,
        motionType: formData.motionType,
      },
      content: {
        statementOfFacts: formData.statementOfFacts,
        proceduralHistory: formData.proceduralHistory,
        keyDates: formData.keyDates,
        primaryArguments: formData.primaryArguments,
        tonePreference: formData.tonePreference,
        specificRequests: formData.specificRequests,
        knownWeaknesses: formData.knownWeaknesses,
      },
      documents: formData.uploadedFiles?.map(f => ({
        id: f.id,
        name: f.name,
        url: f.url,
      })),
      service: {
        rushDelivery: formData.rushDelivery,
        partiesToServe: formData.partiesToServe,
        addOns: formData.addOns?.filter(a => a.selected),
      },
      pricing: formData.pricing,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to submit order');
  }

  return response.json();
}

/**
 * Upload a document
 */
export async function uploadDocument(
  file: File,
  orderId?: string,
  onProgress?: (progress: number) => void
): Promise<{ id: string; url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  if (orderId) {
    formData.append('orderId', orderId);
  }

  const response = await fetch(`${API_BASE}/uploads`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to upload document');
  }

  return response.json();
}

/**
 * Get jurisdictions list
 */
export async function getJurisdictions(): Promise<unknown[]> {
  const response = await fetch(`${API_BASE}/jurisdictions`);
  if (!response.ok) {
    throw new Error('Failed to fetch jurisdictions');
  }
  return response.json();
}

/**
 * Get motion types, optionally filtered by tier
 */
export async function getMotionTypes(tier?: string): Promise<unknown[]> {
  const url = tier
    ? `${API_BASE}/motion-types?tier=${tier}`
    : `${API_BASE}/motion-types`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch motion types');
  }
  return response.json();
}

/**
 * Calculate order pricing server-side
 */
export async function calculateOrderPricing(params: {
  tier: string;
  motionType: string;
  rushDelivery: boolean;
  addOnIds: string[];
}): Promise<PricingBreakdown> {
  const response = await fetch(`${API_BASE}/pricing/calculate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error('Failed to calculate pricing');
  }

  return response.json();
}

/**
 * Save draft order (for resume later)
 */
export async function saveDraftOrder(
  formData: Partial<IntakeFormData>,
  draftId?: string
): Promise<{ draftId: string }> {
  const response = await fetch(`${API_BASE}/orders/draft`, {
    method: draftId ? 'PUT' : 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      draftId,
      formData,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to save draft');
  }

  return response.json();
}

/**
 * Load a saved draft order
 */
export async function loadDraftOrder(
  draftId: string
): Promise<Partial<IntakeFormData>> {
  const response = await fetch(`${API_BASE}/orders/draft/${draftId}`);

  if (!response.ok) {
    throw new Error('Failed to load draft');
  }

  return response.json();
}
