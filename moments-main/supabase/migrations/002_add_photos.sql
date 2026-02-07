-- ============================================================================
-- Migration 002: Add Photo Support
-- ============================================================================
-- This migration adds:
-- 1. Profile photo URL to profiles table
-- 2. Moment photos table for preview images
-- 3. Updated capacity constraints (2-100)
-- 4. Storage bucket policies

-- ============================================================================
-- 1. Update Profiles Table
-- ============================================================================

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
ADD COLUMN IF NOT EXISTS profile_photo_uploaded_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN profiles.profile_photo_url IS 'URL to user profile photo in Supabase Storage';
COMMENT ON COLUMN profiles.profile_photo_uploaded_at IS 'Timestamp of profile photo upload';

-- ============================================================================
-- 2. Create Moment Photos Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS moment_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  moment_id UUID NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_preview BOOLEAN DEFAULT false,
  
  -- Ensure uploader is a participant
  CONSTRAINT moment_photos_uploader_participant CHECK (
    is_preview = true OR -- Preview photos uploaded by creator before moment is fully created
    EXISTS (
      SELECT 1 FROM moment_participants
      WHERE moment_id = moment_photos.moment_id
      AND user_id = moment_photos.uploader_id
    )
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_moment_photos_moment ON moment_photos(moment_id);
CREATE INDEX IF NOT EXISTS idx_moment_photos_preview ON moment_photos(moment_id, is_preview);
CREATE INDEX IF NOT EXISTS idx_moment_photos_uploader ON moment_photos(uploader_id);

COMMENT ON TABLE moment_photos IS 'Photos uploaded to moments for preview/sharing';
COMMENT ON COLUMN moment_photos.is_preview IS 'True if this is a preview photo shown before joining';

-- ============================================================================
-- 3. Row Level Security for Moment Photos
-- ============================================================================

ALTER TABLE moment_photos ENABLE ROW LEVEL SECURITY;

-- Anyone can view photos of active moments
CREATE POLICY "Photos readable by all" ON moment_photos
  FOR SELECT USING (true);

-- Authenticated users can upload photos to moments they participate in
CREATE POLICY "Participants can upload photos" ON moment_photos
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      -- Creator can upload preview photo
      is_preview = true 
      OR
      -- Participants can upload photos
      EXISTS (
        SELECT 1 FROM moment_participants
        WHERE moment_id = moment_photos.moment_id
        AND user_id = auth.uid()
      )
    )
  );

-- Users can delete their own photos
CREATE POLICY "Users can delete own photos" ON moment_photos
  FOR DELETE USING (uploader_id = auth.uid());

-- ============================================================================
-- 4. Update Moments Capacity Constraint
-- ============================================================================

-- Drop old constraint
ALTER TABLE moments 
DROP CONSTRAINT IF EXISTS moments_max_participants_check;

-- Add new constraint with larger range (2-100)
ALTER TABLE moments 
ADD CONSTRAINT moments_max_participants_check 
CHECK (max_participants >= 2 AND max_participants <= 100);

-- ============================================================================
-- 5. Storage Bucket Policies
-- ============================================================================
-- NOTE: These need to be created in Supabase Dashboard first:
-- 1. Go to Storage → Create bucket "avatars" (public)
-- 2. Go to Storage → Create bucket "moment-photos" (public)
-- Then run these policies:

-- Allow authenticated users to upload their own avatar
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('moment-photos', 'moment-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Avatar upload policy: users can upload to their own folder
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND auth.role() = 'authenticated'
);

-- Avatar update policy: users can update their own avatar
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Avatar delete policy: users can delete their own avatar
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Moment photo upload policy: authenticated users can upload
CREATE POLICY "Authenticated users can upload moment photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'moment-photos'
  AND auth.role() = 'authenticated'
);

-- Public read access to avatars
CREATE POLICY "Public avatar access"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Public read access to moment photos
CREATE POLICY "Public moment photo access"
ON storage.objects FOR SELECT
USING (bucket_id = 'moment-photos');

-- ============================================================================
-- 6. Cleanup Function (Optional - for expired moments)
-- ============================================================================

-- Function to clean up moment photos when moments expire
CREATE OR REPLACE FUNCTION cleanup_expired_moment_photos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete photos from moments that expired more than 1 day ago
  DELETE FROM moment_photos
  WHERE moment_id IN (
    SELECT id FROM moments
    WHERE ends_at < now() - interval '1 day'
  );
END;
$$;

COMMENT ON FUNCTION cleanup_expired_moment_photos IS 'Cleanup photos from expired moments to save storage';

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Verify tables exist
DO $$
BEGIN
  RAISE NOTICE 'Migration 002 completed successfully';
  RAISE NOTICE 'Profile photo column added: %', EXISTS(
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'profile_photo_url'
  );
  RAISE NOTICE 'Moment photos table created: %', EXISTS(
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'moment_photos'
  );
END $$;

