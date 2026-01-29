// /app/api/upload/validate/route.ts
// File upload validation endpoint
// VERSION: 1.0 — January 28, 2026

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateFile, logRejectedUpload, generateStorageFilename } from '@/lib/upload/file-validation';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const orderId = formData.get('orderId') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';

    // Get existing order size if orderId provided
    let existingOrderSizeMB = 0;
    if (orderId) {
      const { data: docs } = await supabase
        .from('order_documents')
        .select('file_size')
        .eq('order_id', orderId);

      if (docs) {
        existingOrderSizeMB = docs.reduce((sum: number, d: { file_size: number | null }) => sum + (d.file_size || 0), 0) / (1024 * 1024);
      }
    }

    // Validate file
    const validation = await validateFile(file, file.name, existingOrderSizeMB);

    if (!validation.valid) {
      await logRejectedUpload(file.name, validation.error!, user.id, ipAddress);
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Generate storage filename
    const storageFilename = generateStorageFilename(file.name);

    return NextResponse.json({
      valid: true,
      originalFilename: file.name,
      sanitizedFilename: validation.sanitizedFilename,
      storageFilename,
      detectedType: validation.detectedType,
      fileSize: file.size,
    });
  } catch (error) {
    console.error('[UploadValidate] Error:', error);
    return NextResponse.json({ error: 'Validation failed' }, { status: 500 });
  }
}
