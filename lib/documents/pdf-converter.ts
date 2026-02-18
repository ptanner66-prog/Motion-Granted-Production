/**
 * CloudConvert DOCX → PDF Conversion (ST11-ACTION-2)
 *
 * On-demand PDF conversion via CloudConvert API v2.
 * Uses the project's existing CircuitBreaker for fault tolerance.
 *
 * NOTE: createSimpleMotionPDF() is DEPRECATED.
 * createSimpleTextPDF() is RETAINED for text-only supporting materials only.
 */

import { getCircuitBreaker } from '@/lib/circuit-breaker';

const cb = getCircuitBreaker('cloudconvert');

// ============================================================================
// TYPES
// ============================================================================

interface CloudConvertJob {
  id: string;
  status: string;
  tasks: CloudConvertTask[];
}

interface CloudConvertTask {
  id: string;
  name: string;
  operation: string;
  status: string;
  result?: {
    files?: Array<{ url: string; filename: string }>;
    form?: { url: string; parameters: Record<string, string> };
  };
}

// ============================================================================
// MAIN CONVERSION FUNCTION
// ============================================================================

/**
 * Convert a DOCX buffer to PDF via CloudConvert API v2.
 *
 * Flow: create job → upload file → poll until done → download PDF.
 */
export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const canExecute = await cb.canExecute();
  if (!canExecute) {
    throw new Error('CloudConvert circuit breaker open. PDF conversion unavailable.');
  }

  const apiKey = process.env.CLOUDCONVERT_API_KEY;
  if (!apiKey) throw new Error('CLOUDCONVERT_API_KEY not configured');

  try {
    // Step 1: Create job with import → convert → export tasks
    const jobResponse = await fetch('https://api.cloudconvert.com/v2/jobs', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tasks: {
          'import-file': { operation: 'import/upload' },
          convert: {
            operation: 'convert',
            input: 'import-file',
            output_format: 'pdf',
          },
          export: {
            operation: 'export/url',
            input: 'convert',
          },
        },
      }),
    });

    if (!jobResponse.ok) {
      throw new Error(`CloudConvert job creation failed: ${jobResponse.status}`);
    }

    const job = (await jobResponse.json()) as { data: CloudConvertJob };

    // Step 2: Upload the DOCX file
    const importTask = job.data.tasks.find((t) => t.name === 'import-file');
    if (!importTask?.result?.form) {
      throw new Error('CloudConvert import task missing upload form');
    }

    const formData = new FormData();
    for (const [key, value] of Object.entries(importTask.result.form.parameters)) {
      formData.append(key, value);
    }
    formData.append('file', new Blob([new Uint8Array(docxBuffer)]), 'document.docx');

    const uploadResponse = await fetch(importTask.result.form.url, {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error(`CloudConvert upload failed: ${uploadResponse.status}`);
    }

    // Step 3: Poll for job completion
    const pdfBuffer = await pollForCompletion(apiKey, job.data.id);

    await cb.recordSuccess();
    return pdfBuffer;
  } catch (error) {
    await cb.recordFailure();
    throw error;
  }
}

// ============================================================================
// POLLING
// ============================================================================

async function pollForCompletion(
  apiKey: string,
  jobId: string,
  maxAttempts = 60,
  intervalMs = 3000
): Promise<Buffer> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const resp = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!resp.ok) {
      throw new Error(`CloudConvert poll failed: ${resp.status}`);
    }

    const result = (await resp.json()) as { data: CloudConvertJob };

    if (result.data.status === 'finished') {
      const exportTask = result.data.tasks.find((t) => t.name === 'export');
      const fileUrl = exportTask?.result?.files?.[0]?.url;
      if (!fileUrl) throw new Error('CloudConvert: no output file URL');

      const pdfResp = await fetch(fileUrl);
      if (!pdfResp.ok) throw new Error(`CloudConvert PDF download failed: ${pdfResp.status}`);

      const arrayBuf = await pdfResp.arrayBuffer();
      return Buffer.from(arrayBuf);
    }

    if (result.data.status === 'error') {
      throw new Error('CloudConvert job failed');
    }
  }

  throw new Error('CloudConvert: polling timeout');
}
