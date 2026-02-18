-- Storage Bucket Setup for Document Uploads
-- Run this ENTIRE script in Supabase SQL Editor to set up document storage

-- STORAGE STRUCTURE:
-- documents/
--   orders/{order_id}/             - Client uploaded case documents
--     {timestamp}-{filename}
--   deliverables/{order_id}/       - Completed drafts from clerks
--     {timestamp}-{filename}
--
-- SECURITY MODEL:
-- - Database RLS controls who can see document records (by order ownership)
-- - Bucket is public for URL access, but users can only find URLs through database queries
-- - Only authenticated users can upload
-- - Files are organized by order_id for easy management

-- Step 1: Create the documents bucket (100MB limit for large legal briefs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,  -- PRIVATE bucket: attorney-client privilege requires signed URLs (LCV-014)
  104857600,  -- 100MB limit for large legal briefs
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
  public = false,
  file_size_limit = 104857600,  -- 100MB
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
DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload temp files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload order files" ON storage.objects;
DROP POLICY IF EXISTS "Public can read documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete temp files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete documents" ON storage.objects;

-- Step 3: Create storage policies

-- Policy: Any authenticated user can upload to the documents bucket
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Policy: Authenticated users can download/view files from the documents bucket
-- Bucket is PRIVATE: all access requires authentication + signed URLs (LCV-014)
CREATE POLICY "Allow authenticated downloads"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'documents');

-- Policy: Authenticated users can delete files
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
--
-- PATH CONVENTIONS:
-- - Client documents: documents/orders/{orderId}/{timestamp}-{filename}
-- - Clerk deliverables: documents/deliverables/{orderId}/{timestamp}-{filename}
--
-- The database documents table tracks all files with:
-- - is_deliverable: boolean to distinguish client uploads from clerk deliverables
-- - uploaded_by: UUID of the user who uploaded the file
-- - order_id: Links file to specific order (used for RLS)
