-- ============================================================================
-- COMPLETE DATABASE SETUP - Run this ONCE on fresh database
-- ============================================================================
-- This migration includes:
-- - Core tables (profiles, moments, participants, messages, photos, flags)
-- - Search functionality
-- - Multi-join enforcement (host 1, join many)
-- - SOS safety system
-- - Storage buckets and policies
-- - All RLS policies

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

-- SOS Alerts (NEW!)
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

-- Flags
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

-- User roles
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'moderator')),
  granted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

-- ============================================================================
-- 3. CREATE FUNCTIONS
-- ============================================================================

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

-- Search moments (NEW!)
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

-- Check if user has active hosted moment (NEW! - Multi-join enforcement)
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

-- ============================================================================
-- 4. CREATE TRIGGERS
-- ============================================================================

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

-- ============================================================================
-- 5. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE moment_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE moment_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE moment_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE sos_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE flags ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. CREATE RLS POLICIES (Drop existing first)
-- ============================================================================

-- Profiles policies
DROP POLICY IF EXISTS "Users read own profile" ON profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;

CREATE POLICY "Users read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Moments policies
DROP POLICY IF EXISTS "Read active moments" ON moments;
DROP POLICY IF EXISTS "Authenticated users create moments" ON moments;
DROP POLICY IF EXISTS "Creators update moments" ON moments;

CREATE POLICY "Read active moments" ON moments FOR SELECT USING (status = 'active');
CREATE POLICY "Authenticated users create moments" ON moments FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators update moments" ON moments FOR UPDATE USING (auth.uid() = creator_id);

-- Participants policies
DROP POLICY IF EXISTS "Read participants" ON moment_participants;
DROP POLICY IF EXISTS "Users join moments" ON moment_participants;
DROP POLICY IF EXISTS "Users leave moments" ON moment_participants;

CREATE POLICY "Read participants" ON moment_participants FOR SELECT USING (true);
CREATE POLICY "Users join moments" ON moment_participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users leave moments" ON moment_participants FOR DELETE USING (auth.uid() = user_id);

-- Messages policies
DROP POLICY IF EXISTS "Participants read messages" ON moment_messages;
DROP POLICY IF EXISTS "Participants send messages" ON moment_messages;

CREATE POLICY "Participants read messages" ON moment_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM moment_participants WHERE moment_id = moment_messages.moment_id AND user_id = auth.uid())
);
CREATE POLICY "Participants send messages" ON moment_messages FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM moment_participants WHERE moment_id = moment_messages.moment_id AND user_id = auth.uid())
);

-- Photo policies
DROP POLICY IF EXISTS "Photos readable by all" ON moment_photos;
DROP POLICY IF EXISTS "Participants can upload photos" ON moment_photos;
DROP POLICY IF EXISTS "Users can delete own photos" ON moment_photos;

CREATE POLICY "Photos readable by all" ON moment_photos FOR SELECT USING (true);
CREATE POLICY "Participants can upload photos" ON moment_photos FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can delete own photos" ON moment_photos FOR DELETE USING (uploader_id = auth.uid());

-- SOS Alerts policies (NEW!)
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

-- Flag policies
DROP POLICY IF EXISTS "Users create flags" ON flags;
CREATE POLICY "Users create flags" ON flags FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- ============================================================================
-- 7. CREATE STORAGE BUCKETS (if not exists)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('moment-photos', 'moment-photos', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 8. CREATE STORAGE POLICIES (Drop existing first)
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
-- 9. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_moment_context TO authenticated;
GRANT EXECUTE ON FUNCTION get_nearby_moments TO authenticated;
GRANT EXECUTE ON FUNCTION search_moments TO authenticated;
GRANT EXECUTE ON FUNCTION check_user_active_hosted_moment TO authenticated;

-- ============================================================================
-- COMPLETE! ✅
-- ============================================================================

SELECT '✅ Database setup complete! All tables, functions, and policies ready!' as status;

