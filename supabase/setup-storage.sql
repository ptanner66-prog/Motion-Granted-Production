-- Storage Bucket Setup for Document Uploads
-- Run this in Supabase SQL Editor to create the documents storage bucket

-- Create the documents bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  true,  -- public bucket for easy access
  52428800,  -- 50MB limit
  ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[];

-- Storage policies for the documents bucket

-- Allow authenticated users to upload to their temp folder
DROP POLICY IF EXISTS "Users can upload temp files" ON storage.objects;
CREATE POLICY "Users can upload temp files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] = 'temp' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

-- Allow authenticated users to upload to order folders
DROP POLICY IF EXISTS "Users can upload order files" ON storage.objects;
CREATE POLICY "Users can upload order files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] = 'orders'
  );

-- Allow public read access (since bucket is public)
DROP POLICY IF EXISTS "Public can read documents" ON storage.objects;
CREATE POLICY "Public can read documents"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'documents');

-- Allow authenticated users to delete their own temp files
DROP POLICY IF EXISTS "Users can delete temp files" ON storage.objects;
CREATE POLICY "Users can delete temp files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] = 'temp' AND
    (storage.foldername(name))[2] = auth.uid()::text
  );

-- Allow admins to delete any document
DROP POLICY IF EXISTS "Admins can delete documents" ON storage.objects;
CREATE POLICY "Admins can delete documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents' AND
    public.is_admin()
  );

-- Done! The documents bucket is now set up with proper policies.
