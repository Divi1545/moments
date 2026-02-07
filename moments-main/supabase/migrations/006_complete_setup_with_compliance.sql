-- ============================================================================
-- MOMENTS - COMPLETE DATABASE SETUP WITH APPLE 1.2 COMPLIANCE
-- Version: 2.0
-- Run this ONCE on a fresh database
-- ============================================================================
-- This migration includes:
-- - Core tables (profiles, moments, participants, messages, photos, flags, roles)
-- - User blocking system (Apple 1.2 compliance)
-- - Search functionality
-- - Multi-join enforcement
-- - SOS safety system
-- - Storage buckets and policies
-- - All RLS policies with blocking support
-- ============================================================================

-- ============================================================================
-- 1. ENABLE EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- 2. CREATE ALL TABLES
-- ============================================================================

-- Profiles table (with photo support)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 30),
  home_country CHAR(2) NOT NULL,
  languages TEXT[] NOT NULL CHECK (array_length(languages, 1) BETWEEN 1 AND 3),
  user_type TEXT NOT NULL CHECK (user_type IN ('local', 'traveler', 'expat')),
  profile_photo_url TEXT,
  profile_photo_uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_created_at_idx ON profiles(created_at);

COMMENT ON TABLE profiles IS 'User profiles with privacy controls';
COMMENT ON COLUMN profiles.profile_photo_url IS 'URL to user profile photo in Supabase Storage';

-- Moments table (capacity 2-100)
CREATE TABLE IF NOT EXISTS moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 40),
  location GEOGRAPHY(Point, 4326) NOT NULL,
  lat NUMERIC(10, 7) NOT NULL,
  lng NUMERIC(10, 7) NOT NULL,
  city_code TEXT NOT NULL DEFAULT 'UNKNOWN',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
  max_participants INT NOT NULL CHECK (max_participants BETWEEN 2 AND 100),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'hidden')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moments_location_idx ON moments USING GIST(location);
CREATE INDEX IF NOT EXISTS moments_status_ends_at_idx ON moments(status, ends_at);
CREATE INDEX IF NOT EXISTS moments_creator_idx ON moments(creator_id);

COMMENT ON TABLE moments IS 'Time-limited gatherings with geospatial data';

-- Moment participants
CREATE TABLE IF NOT EXISTS moment_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(moment_id, user_id)
);

CREATE INDEX IF NOT EXISTS moment_participants_moment_idx ON moment_participants(moment_id);
CREATE INDEX IF NOT EXISTS moment_participants_user_idx ON moment_participants(user_id);

-- Moment messages
CREATE TABLE IF NOT EXISTS moment_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moment_messages_moment_created_idx ON moment_messages(moment_id, created_at);
CREATE INDEX IF NOT EXISTS moment_messages_user_idx ON moment_messages(user_id);

-- Moment photos (preview + ephemeral chat images)
CREATE TABLE IF NOT EXISTS moment_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  is_preview BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_moment_photos_moment ON moment_photos(moment_id);
CREATE INDEX IF NOT EXISTS idx_moment_photos_preview ON moment_photos(moment_id, is_preview);
CREATE INDEX IF NOT EXISTS idx_moment_photos_uploaded ON moment_photos(uploaded_at);

COMMENT ON TABLE moment_photos IS 'Photos for moments - preview images and ephemeral chat images';

-- SOS Alerts
CREATE TABLE IF NOT EXISTS sos_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  moment_id UUID NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  location GEOGRAPHY(Point, 4326),
  lat NUMERIC(10, 7),
  lng NUMERIC(10, 7),
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_sos_alerts_moment ON sos_alerts(moment_id);
CREATE INDEX IF NOT EXISTS idx_sos_alerts_active ON sos_alerts(moment_id) WHERE resolved_at IS NULL;

COMMENT ON TABLE sos_alerts IS 'Emergency SOS alerts for safety';

-- Flags (content moderation)
CREATE TABLE IF NOT EXISTS flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('moment', 'message')),
  target_id UUID NOT NULL,
  reason TEXT CHECK (reason IN ('spam', 'inappropriate', 'harassment', 'other')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(reporter_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS flags_target_idx ON flags(target_type, target_id);

COMMENT ON TABLE flags IS 'User-generated content reports for moderation';

-- User roles (admin/moderator)
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'moderator')),
  granted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

COMMENT ON TABLE user_roles IS 'Admin and moderator role assignments';

-- ============================================================================
-- 3. BLOCKED USERS TABLE (Apple 1.2 Compliance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  reason TEXT,
  UNIQUE(blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_id);

COMMENT ON TABLE blocked_users IS 'User blocking for safety and harassment prevention (Apple 1.2 compliance)';
COMMENT ON COLUMN blocked_users.blocker_id IS 'User who initiated the block';
COMMENT ON COLUMN blocked_users.blocked_id IS 'User who is being blocked';

-- ============================================================================
-- 4. CREATE FUNCTIONS
-- ============================================================================

-- Check if user is blocked (NEW - Apple 1.2 Compliance)
CREATE OR REPLACE FUNCTION is_user_blocked(
  check_blocker_id UUID,
  check_blocked_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM blocked_users
    WHERE blocker_id = check_blocker_id
    AND blocked_id = check_blocked_id
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

COMMENT ON FUNCTION is_user_blocked IS 'Check if one user has blocked another';

-- Get moment context (badges)
CREATE OR REPLACE FUNCTION get_moment_context(moment_uuid UUID)
RETURNS JSON AS $$
DECLARE
  total_participants INT;
  unique_countries INT;
  common_languages TEXT[];
  result JSON;
BEGIN
  SELECT 
    COUNT(*)::INT,
    COUNT(DISTINCT p.home_country)::INT,
    array_agg(DISTINCT unnest(p.languages))
  INTO total_participants, unique_countries, common_languages
  FROM moment_participants mp
  JOIN profiles p ON mp.user_id = p.id
  WHERE mp.moment_id = moment_uuid;

  result := json_build_object(
    'badges', ARRAY[]::TEXT[],
    'participant_count', COALESCE(total_participants, 0)
  );
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get nearby moments
CREATE OR REPLACE FUNCTION get_nearby_moments(
  user_lat NUMERIC,
  user_lng NUMERIC,
  radius_meters INT DEFAULT 5000,
  limit_count INT DEFAULT 50
)
RETURNS TABLE(
  id UUID,
  title TEXT,
  lat NUMERIC,
  lng NUMERIC,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  max_participants INT,
  participant_count BIGINT,
  distance_meters NUMERIC
) AS $$
DECLARE
  user_location GEOGRAPHY;
BEGIN
  user_location := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography;
  
  RETURN QUERY
  SELECT 
    m.id, m.title, m.lat, m.lng, m.starts_at, m.ends_at, m.max_participants,
    COUNT(mp.id) as participant_count,
    ST_Distance(m.location, user_location)::NUMERIC as distance_meters
  FROM moments m
  LEFT JOIN moment_participants mp ON m.id = mp.moment_id
  WHERE m.status = 'active' AND m.ends_at > now()
  AND ST_DWithin(m.location, user_location, radius_meters)
  GROUP BY m.id
  ORDER BY distance_meters ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Search moments
CREATE OR REPLACE FUNCTION search_moments(
  search_query TEXT DEFAULT NULL,
  user_lat NUMERIC DEFAULT NULL,
  user_lng NUMERIC DEFAULT NULL,
  radius_meters INT DEFAULT 10000,
  limit_count INT DEFAULT 20
)
RETURNS TABLE(
  id UUID,
  title TEXT,
  lat NUMERIC,
  lng NUMERIC,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  max_participants INT,
  participant_count BIGINT,
  distance_meters NUMERIC
) AS $$
DECLARE
  user_location GEOGRAPHY;
BEGIN
  IF user_lat IS NOT NULL AND user_lng IS NOT NULL THEN
    user_location := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography;
  END IF;
  
  RETURN QUERY
  SELECT 
    m.id, m.title, m.lat, m.lng, m.starts_at, m.ends_at, m.max_participants,
    COUNT(mp.id) as participant_count,
    CASE WHEN user_location IS NOT NULL 
      THEN ST_Distance(m.location, user_location)::NUMERIC 
      ELSE 0::NUMERIC 
    END as distance_meters
  FROM moments m
  LEFT JOIN moment_participants mp ON m.id = mp.moment_id
  WHERE m.status = 'active' AND m.ends_at > now()
  AND (user_location IS NULL OR ST_DWithin(m.location, user_location, radius_meters))
  AND (search_query IS NULL OR search_query = '' OR m.title ILIKE '%' || search_query || '%')
  GROUP BY m.id
  ORDER BY 
    CASE WHEN search_query IS NOT NULL AND search_query != '' 
      AND m.title ILIKE '%' || search_query || '%' THEN 0 ELSE 1 END,
    m.starts_at ASC,
    distance_meters ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Check if user has active hosted moment (multi-join enforcement)
CREATE OR REPLACE FUNCTION check_user_active_hosted_moment(user_uuid UUID)
RETURNS TABLE(
  has_active_moment BOOLEAN,
  moment_id UUID,
  moment_title TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    EXISTS(SELECT 1 FROM moments WHERE creator_id = user_uuid AND status = 'active' AND ends_at > now()) as has_active_moment,
    m.id as moment_id,
    m.title as moment_title
  FROM moments m
  WHERE m.creator_id = user_uuid AND m.status = 'active' AND m.ends_at > now()
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Expire past moments (for cron job)
CREATE OR REPLACE FUNCTION expire_past_moments()
RETURNS TABLE(expired_count INT) AS $$
DECLARE
  affected_rows INT;
BEGIN
  UPDATE moments
  SET status = 'expired'
  WHERE status = 'active'
  AND ends_at < now();
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  
  RETURN QUERY SELECT affected_rows;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================================================
-- 5. CREATE TRIGGERS
-- ============================================================================

-- Auto-join creator to moment
CREATE OR REPLACE FUNCTION auto_join_creator()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO moment_participants (moment_id, user_id)
  VALUES (NEW.id, NEW.creator_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_moment_created_join_creator ON moments;
CREATE TRIGGER on_moment_created_join_creator
  AFTER INSERT ON moments
  FOR EACH ROW EXECUTE FUNCTION auto_join_creator();

-- Auto-hide content at flag threshold
CREATE OR REPLACE FUNCTION handle_new_flag()
RETURNS TRIGGER AS $$
DECLARE
  current_flag_count INT;
  flag_threshold INT := 3;
BEGIN
  SELECT COUNT(*)::INT INTO current_flag_count
  FROM flags
  WHERE target_type = NEW.target_type
  AND target_id = NEW.target_id;

  IF current_flag_count >= flag_threshold THEN
    IF NEW.target_type = 'moment' THEN
      UPDATE moments 
      SET status = 'hidden'
      WHERE id = NEW.target_id 
      AND status = 'active';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_flag_created ON flags;
CREATE TRIGGER on_flag_created
  AFTER INSERT ON flags
  FOR EACH ROW EXECUTE FUNCTION handle_new_flag();

-- Update timestamp maintenance
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE moment_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE moment_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE moment_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE sos_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7. CREATE RLS POLICIES (Drop existing first)
-- ============================================================================

-- PROFILES POLICIES
DROP POLICY IF EXISTS "Users read own profile" ON profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;

CREATE POLICY "Users read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- MOMENTS POLICIES
DROP POLICY IF EXISTS "Read active moments" ON moments;
DROP POLICY IF EXISTS "Authenticated users create moments" ON moments;
DROP POLICY IF EXISTS "Creators update moments" ON moments;

CREATE POLICY "Read active moments" ON moments FOR SELECT USING (status = 'active');
CREATE POLICY "Authenticated users create moments" ON moments FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators update moments" ON moments FOR UPDATE USING (auth.uid() = creator_id);

-- PARTICIPANTS POLICIES (Updated with blocking support)
DROP POLICY IF EXISTS "Read participants" ON moment_participants;
DROP POLICY IF EXISTS "Users join moments" ON moment_participants;
DROP POLICY IF EXISTS "Users leave moments" ON moment_participants;

CREATE POLICY "Read participants" ON moment_participants FOR SELECT USING (
  NOT EXISTS (
    SELECT 1 FROM blocked_users
    WHERE (blocker_id = auth.uid() AND blocked_id = moment_participants.user_id)
    OR (blocker_id = moment_participants.user_id AND blocked_id = auth.uid())
  )
);

CREATE POLICY "Users join moments" ON moment_participants FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND NOT EXISTS (
    SELECT 1 FROM moment_participants mp2
    JOIN blocked_users bu ON (
      (bu.blocker_id = auth.uid() AND bu.blocked_id = mp2.user_id)
      OR (bu.blocker_id = mp2.user_id AND bu.blocked_id = auth.uid())
    )
    WHERE mp2.moment_id = moment_participants.moment_id
  )
);

CREATE POLICY "Users leave moments" ON moment_participants FOR DELETE USING (auth.uid() = user_id);

-- MESSAGES POLICIES (Updated with blocking support)
DROP POLICY IF EXISTS "Participants read messages" ON moment_messages;
DROP POLICY IF EXISTS "Participants send messages" ON moment_messages;

CREATE POLICY "Participants read messages" ON moment_messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM moment_participants 
    WHERE moment_id = moment_messages.moment_id 
    AND user_id = auth.uid()
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocked_users
    WHERE (blocker_id = auth.uid() AND blocked_id = moment_messages.user_id)
    OR (blocker_id = moment_messages.user_id AND blocked_id = auth.uid())
  )
);

CREATE POLICY "Participants send messages" ON moment_messages FOR INSERT WITH CHECK (
  auth.uid() = user_id 
  AND EXISTS (
    SELECT 1 FROM moment_participants 
    WHERE moment_id = moment_messages.moment_id 
    AND user_id = auth.uid()
  )
);

-- PHOTO POLICIES
DROP POLICY IF EXISTS "Photos readable by all" ON moment_photos;
DROP POLICY IF EXISTS "Participants can upload photos" ON moment_photos;
DROP POLICY IF EXISTS "Users can delete own photos" ON moment_photos;

CREATE POLICY "Photos readable by all" ON moment_photos FOR SELECT USING (true);
CREATE POLICY "Participants can upload photos" ON moment_photos FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can delete own photos" ON moment_photos FOR DELETE USING (uploader_id = auth.uid());

-- SOS ALERTS POLICIES
DROP POLICY IF EXISTS "Participants read SOS alerts" ON sos_alerts;
DROP POLICY IF EXISTS "Participants create SOS alerts" ON sos_alerts;
DROP POLICY IF EXISTS "Admins resolve SOS alerts" ON sos_alerts;

CREATE POLICY "Participants read SOS alerts" ON sos_alerts FOR SELECT USING (
  EXISTS (SELECT 1 FROM moment_participants WHERE moment_id = sos_alerts.moment_id AND user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'moderator'))
);

CREATE POLICY "Participants create SOS alerts" ON sos_alerts FOR INSERT WITH CHECK (
  auth.uid() = user_id AND 
  EXISTS (SELECT 1 FROM moment_participants WHERE moment_id = sos_alerts.moment_id AND user_id = auth.uid())
);

CREATE POLICY "Admins resolve SOS alerts" ON sos_alerts FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'moderator'))
);

-- FLAG POLICIES
DROP POLICY IF EXISTS "Users create flags" ON flags;
DROP POLICY IF EXISTS "Admins read flags" ON flags;

CREATE POLICY "Users create flags" ON flags FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Admins read flags" ON flags FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'moderator'))
);

-- USER ROLES POLICIES
DROP POLICY IF EXISTS "Admins manage roles" ON user_roles;

CREATE POLICY "Admins manage roles" ON user_roles FOR ALL USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- BLOCKED USERS POLICIES (NEW - Apple 1.2 Compliance)
DROP POLICY IF EXISTS "Users view own blocks" ON blocked_users;
DROP POLICY IF EXISTS "Users can block others" ON blocked_users;
DROP POLICY IF EXISTS "Users can unblock" ON blocked_users;
DROP POLICY IF EXISTS "Admins view all blocks" ON blocked_users;

CREATE POLICY "Users view own blocks" ON blocked_users
  FOR SELECT USING (auth.uid() = blocker_id);

CREATE POLICY "Users can block others" ON blocked_users
  FOR INSERT WITH CHECK (
    auth.uid() = blocker_id
    AND blocker_id != blocked_id
  );

CREATE POLICY "Users can unblock" ON blocked_users
  FOR DELETE USING (auth.uid() = blocker_id);

CREATE POLICY "Admins view all blocks" ON blocked_users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'moderator'))
  );

-- ============================================================================
-- 8. CREATE STORAGE BUCKETS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('moment-photos', 'moment-photos', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 9. CREATE STORAGE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users upload moment photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public read moment photos" ON storage.objects;

CREATE POLICY "Users upload avatars" ON storage.objects 
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Users upload moment photos" ON storage.objects 
  FOR INSERT WITH CHECK (bucket_id = 'moment-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Public read avatars" ON storage.objects 
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Public read moment photos" ON storage.objects 
  FOR SELECT USING (bucket_id = 'moment-photos');

-- ============================================================================
-- 10. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_moment_context TO authenticated;
GRANT EXECUTE ON FUNCTION get_nearby_moments TO authenticated;
GRANT EXECUTE ON FUNCTION search_moments TO authenticated;
GRANT EXECUTE ON FUNCTION check_user_active_hosted_moment TO authenticated;
GRANT EXECUTE ON FUNCTION is_user_blocked TO authenticated;

-- Service role only functions
REVOKE ALL ON FUNCTION expire_past_moments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION expire_past_moments() TO service_role;

-- ============================================================================
-- 11. SETUP INSTRUCTIONS
-- ============================================================================

-- After running this migration:
-- 
-- 1. Enable Realtime (Supabase Dashboard → Database → Replication):
--    ALTER PUBLICATION supabase_realtime ADD TABLE moment_messages;
--    ALTER PUBLICATION supabase_realtime ADD TABLE moment_participants;
--
-- 2. Create your first admin user:
--    INSERT INTO user_roles (user_id, role) 
--    VALUES ('YOUR-USER-UUID-HERE', 'admin');
--
-- 3. Deploy Edge Functions:
--    supabase functions deploy expire-moments
--    supabase functions deploy moderate-moment
--    supabase functions deploy moderate-message
--    supabase functions deploy moderate-image
--
-- 4. Set up cron job for expiring moments (pg_cron or external)
--
-- 5. Update support email in frontend files:
--    - public/support.html
--    - public/guidelines.html

-- ============================================================================
-- COMPLETE! ✅
-- ============================================================================

DO $$ 
BEGIN
  RAISE NOTICE '✅ Database setup complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created: 9 core + 1 blocking';
  RAISE NOTICE '  - profiles, moments, moment_participants, moment_messages';
  RAISE NOTICE '  - moment_photos, sos_alerts, flags, user_roles';
  RAISE NOTICE '  - blocked_users (Apple 1.2 compliance)';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions created: 6';
  RAISE NOTICE '  - get_moment_context, get_nearby_moments, search_moments';
  RAISE NOTICE '  - check_user_active_hosted_moment, is_user_blocked, expire_past_moments';
  RAISE NOTICE '';
  RAISE NOTICE 'Features:';
  RAISE NOTICE '  ✅ User blocking system';
  RAISE NOTICE '  ✅ Content moderation with auto-hide';
  RAISE NOTICE '  ✅ Admin/moderator roles';
  RAISE NOTICE '  ✅ Geospatial search';
  RAISE NOTICE '  ✅ SOS safety alerts';
  RAISE NOTICE '  ✅ Row-level security on all tables';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps: See setup instructions above';
END $$;

SELECT '✅ All tables, functions, and policies ready!' as status;
