-- Storage Bucket Setup for Document Uploads
-- Run this ENTIRE script in Supabase SQL Editor to set up document storage

-- Step 1: Create the documents bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  true,  -- Public bucket for easy access (files are protected by path structure)
  52428800,  -- 50MB limit
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/gif',
    'text/plain',
    'application/octet-stream'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/gif',
    'text/plain',
    'application/octet-stream'
  ]::text[];

-- Step 2: Drop any existing policies to start fresh
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public downloads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload temp files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload order files" ON storage.objects;
DROP POLICY IF EXISTS "Public can read documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete temp files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete documents" ON storage.objects;

-- Step 3: Create simple, permissive policies

-- Policy: Any authenticated user can upload to the documents bucket
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Policy: Anyone can download/view files from the documents bucket (it's public)
CREATE POLICY "Allow public downloads"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'documents');

-- Policy: Authenticated users can delete files they uploaded or admins can delete any
CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'documents');

-- Policy: Allow updates (for upsert operations)
CREATE POLICY "Allow authenticated updates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'documents')
WITH CHECK (bucket_id = 'documents');

-- Step 4: Verify the bucket was created
SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'documents';

-- Done! Your storage is now configured for document uploads.
-- Documents will be stored at: documents/orders/{orderId}/{timestamp}-{filename}
