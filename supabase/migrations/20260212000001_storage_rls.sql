-- Storage RLS for filing-packages bucket
-- Created: 2026-02-12
--
-- Design:
-- - Service role uploads (bypasses RLS) — all uploads happen server-side
-- - Customers do NOT have direct storage access
-- - All downloads go through API routes that generate signed URLs using the service role key
-- - Admins get full access for management via dashboard

-- Admin full access to filing packages
CREATE POLICY "Admin full access to filing packages" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'filing-packages' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
