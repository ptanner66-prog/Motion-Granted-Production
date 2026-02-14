/**
 * PDF Generation
 *
 * Converts docx Documents to PDF via LibreOffice headless.
 * Falls back to returning .docx buffer if LibreOffice is unavailable.
 *
 * Strategy:
 * 1. Pack Document to .docx buffer
 * 2. Write to temp file
 * 3. Convert via LibreOffice headless (if available)
 * 4. Read resulting PDF, validate size
 * 5. Cleanup temp files
 */

import { Packer, Document } from 'docx';
import { exec } from 'child_process';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { createLogger } from '@/lib/security/logger';

const log = createLogger('pdf-generator');

export interface PDFGenerationOptions {
  filename: string;
  maxSizeMB?: number;
  preserveFormatting?: boolean;
}

export interface PDFResult {
  success: boolean;
  buffer?: Buffer;
  filename: string;
  fileSizeBytes?: number;
  error?: string;
  warnings?: string[];
}

export async function generatePDF(
  document: Document,
  options: PDFGenerationOptions
): Promise<PDFResult> {
  const warnings: string[] = [];
  const maxSize = (options.maxSizeMB || 25) * 1024 * 1024;

  try {
    const docxBuffer = await Packer.toBuffer(document);
    const loPath = await findLibreOffice();

    if (!loPath) {
      warnings.push('LibreOffice not available \u2014 returning .docx instead of .pdf');
      const docxFilename = options.filename.replace(/\.pdf$/i, '.docx');
      return {
        success: true,
        buffer: Buffer.from(docxBuffer),
        filename: docxFilename,
        fileSizeBytes: docxBuffer.byteLength,
        warnings,
      };
    }

    const tmpDir = join(process.cwd(), 'tmp', 'pdf-gen');
    await mkdir(tmpDir, { recursive: true });
    const tmpId = randomUUID();
    const tmpDocx = join(tmpDir, `${tmpId}.docx`);
    const tmpPdf = join(tmpDir, `${tmpId}.pdf`);

    await writeFile(tmpDocx, Buffer.from(docxBuffer));

    await new Promise<void>((resolve, reject) => {
      const cmd = `"${loPath}" --headless --convert-to pdf --outdir "${tmpDir}" "${tmpDocx}"`;
      exec(cmd, { timeout: 60000 }, (error: Error | null, _stdout: string, stderr: string) => {
        if (error) {
          reject(new Error(`LibreOffice conversion failed: ${error.message}\nstderr: ${stderr}`));
        } else {
          resolve();
        }
      });
    });

    const pdfBuffer = await readFile(tmpPdf);

    if (pdfBuffer.byteLength > maxSize) {
      warnings.push(`PDF exceeds ${options.maxSizeMB}MB e-filing limit (${(pdfBuffer.byteLength / 1024 / 1024).toFixed(1)}MB)`);
    }

    await Promise.allSettled([unlink(tmpDocx), unlink(tmpPdf)]);

    const pdfFilename = options.filename.replace(/\.docx$/i, '.pdf');
    return {
      success: true,
      buffer: pdfBuffer,
      filename: pdfFilename,
      fileSizeBytes: pdfBuffer.byteLength,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown PDF generation error';
    log.error('Generation failed', { filename: options.filename, error: message });
    return {
      success: false,
      filename: options.filename,
      error: message,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

export async function convertDocxBufferToPDF(
  docxBuffer: Buffer,
  options: PDFGenerationOptions
): Promise<PDFResult> {
  const warnings: string[] = [];
  const maxSize = (options.maxSizeMB || 25) * 1024 * 1024;

  try {
    const loPath = await findLibreOffice();

    if (!loPath) {
      warnings.push('LibreOffice not available \u2014 returning .docx');
      return {
        success: true,
        buffer: docxBuffer,
        filename: options.filename.replace(/\.pdf$/i, '.docx'),
        fileSizeBytes: docxBuffer.byteLength,
        warnings,
      };
    }

    const tmpDir = join(process.cwd(), 'tmp', 'pdf-gen');
    await mkdir(tmpDir, { recursive: true });
    const tmpId = randomUUID();
    const tmpDocx = join(tmpDir, `${tmpId}.docx`);
    const tmpPdf = join(tmpDir, `${tmpId}.pdf`);

    await writeFile(tmpDocx, docxBuffer);

    await new Promise<void>((resolve, reject) => {
      exec(`"${loPath}" --headless --convert-to pdf --outdir "${tmpDir}" "${tmpDocx}"`,
        { timeout: 60000 },
        (error: Error | null, _stdout: string, stderr: string) => {
          if (error) reject(new Error(`Conversion failed: ${error.message}\n${stderr}`));
          else resolve();
        }
      );
    });

    const pdfBuffer = await readFile(tmpPdf);

    if (pdfBuffer.byteLength > maxSize) {
      warnings.push(`PDF exceeds ${options.maxSizeMB}MB limit`);
    }

    await Promise.allSettled([unlink(tmpDocx), unlink(tmpPdf)]);

    return {
      success: true,
      buffer: pdfBuffer,
      filename: options.filename.endsWith('.pdf') ? options.filename : `${options.filename}.pdf`,
      fileSizeBytes: pdfBuffer.byteLength,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      success: false,
      filename: options.filename,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function findLibreOffice(): Promise<string | null> {
  const candidates = [
    '/usr/bin/libreoffice',
    '/usr/bin/soffice',
    '/usr/local/bin/libreoffice',
    '/usr/local/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  ];

  for (const candidatePath of candidates) {
    try {
      await new Promise<void>((resolve, reject) => {
        exec(`test -x "${candidatePath}"`, (error: Error | null) => error ? reject(error) : resolve());
      });
      return candidatePath;
    } catch {
      continue;
    }
  }

  try {
    const result = await new Promise<string>((resolve, reject) => {
      exec('which soffice || which libreoffice', (error: Error | null, stdout: string) => {
        if (error) reject(error);
        else resolve(stdout.trim());
      });
    });
    return result || null;
  } catch {
    return null;
  }
}

export function legalDocumentFilename(
  orderNumber: string,
  docType: string,
  date?: Date
): string {
  const d = date || new Date();
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
  const sanitizedType = docType.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${orderNumber}_${sanitizedType}_${dateStr}`;
}
