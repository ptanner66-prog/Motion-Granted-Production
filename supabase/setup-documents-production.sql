-- =============================================================================
-- MOTION GRANTED - COMPLETE DOCUMENT SETUP FOR PRODUCTION
-- =============================================================================
-- Run this ENTIRE script in your Supabase SQL Editor to enable document uploads.
-- This script will:
--   1. Create the documents storage bucket
--   2. Set up storage policies for uploads/downloads
--   3. Verify the documents table exists
--   4. Set up RLS policies for the documents table
-- =============================================================================

-- =============================================================================
-- STEP 1: CREATE STORAGE BUCKET
-- =============================================================================

-- Create the documents bucket (or update if exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  true,  -- Public bucket for easy access
  52428800,  -- 50MB limit per file
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
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =============================================================================
-- STEP 2: DROP OLD STORAGE POLICIES (Clean slate)
-- =============================================================================

DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public downloads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload temp files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload order files" ON storage.objects;
DROP POLICY IF EXISTS "Public can read documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete temp files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete documents" ON storage.objects;

-- =============================================================================
-- STEP 3: CREATE NEW STORAGE POLICIES
-- =============================================================================

-- Policy: Authenticated users can upload files to the documents bucket
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Policy: Anyone can read/download files (bucket is public)
CREATE POLICY "Allow public downloads"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'documents');

-- Policy: Authenticated users can delete files
CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'documents');

-- Policy: Authenticated users can update files
CREATE POLICY "Allow authenticated updates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'documents')
WITH CHECK (bucket_id = 'documents');

-- =============================================================================
-- STEP 4: VERIFY/CREATE DOCUMENTS TABLE
-- =============================================================================

-- Create the documents table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL,
  file_url text NOT NULL,
  document_type text NOT NULL DEFAULT 'other',
  uploaded_by uuid REFERENCES auth.users(id) NOT NULL,
  is_deliverable boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on documents table
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- STEP 5: DROP OLD DOCUMENT TABLE POLICIES (Clean slate)
-- =============================================================================

DROP POLICY IF EXISTS "Users can view documents for their orders" ON public.documents;
DROP POLICY IF EXISTS "Users can upload documents" ON public.documents;
DROP POLICY IF EXISTS "Admins can view all documents" ON public.documents;
DROP POLICY IF EXISTS "Admins can manage all documents" ON public.documents;

-- =============================================================================
-- STEP 6: CREATE NEW DOCUMENT TABLE POLICIES
-- =============================================================================

-- Policy: Users can view documents for orders they own or are assigned to
CREATE POLICY "Users can view documents for their orders"
ON public.documents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = documents.order_id
    AND (orders.client_id = auth.uid() OR orders.clerk_id = auth.uid())
  )
);

-- Policy: Users can insert documents (they set uploaded_by to their own ID)
CREATE POLICY "Users can upload documents"
ON public.documents FOR INSERT
WITH CHECK (auth.uid() = uploaded_by);

-- Policy: Admins can do everything with documents
CREATE POLICY "Admins can manage all documents"
ON public.documents FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- =============================================================================
-- STEP 7: CREATE HELPER FUNCTION (if not exists)
-- =============================================================================

-- Create is_admin function if it doesn't exist
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Verify bucket exists
SELECT 'BUCKET CHECK:' as check_type, id, name, public, file_size_limit
FROM storage.buckets
WHERE id = 'documents';

-- Verify storage policies exist
SELECT 'STORAGE POLICIES:' as check_type, policyname
FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage';

-- Verify documents table exists
SELECT 'DOCUMENTS TABLE:' as check_type, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'documents' AND table_schema = 'public';

-- Verify document policies exist
SELECT 'DOCUMENT POLICIES:' as check_type, policyname
FROM pg_policies
WHERE tablename = 'documents' AND schemaname = 'public';

-- =============================================================================
-- DONE! Your document storage is now configured for production.
-- =============================================================================
-- Files will be stored at: documents/orders/{orderId}/{timestamp}-{filename}
-- =============================================================================
