-- ============================================================================
-- MOMENTS MVP - Database Migration v1.1
-- Production-ready with founder-approved fixes
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- 1. CORE TABLES
-- ============================================================================

-- Profiles (privacy-hardened)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 30),
  home_country CHAR(2) NOT NULL,
  languages TEXT[] NOT NULL CHECK (array_length(languages, 1) BETWEEN 1 AND 3),
  user_type TEXT NOT NULL CHECK (user_type IN ('local', 'traveler', 'expat')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX profiles_created_at_idx ON profiles(created_at);

-- Moments (with city awareness, non-null)
CREATE TABLE moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 40),
  location GEOGRAPHY(Point, 4326) NOT NULL,
  lat NUMERIC(10, 7) NOT NULL,
  lng NUMERIC(10, 7) NOT NULL,
  city_code TEXT NOT NULL DEFAULT 'UNKNOWN',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
  max_participants INT NOT NULL CHECK (max_participants BETWEEN 2 AND 50),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'hidden')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX moments_location_idx ON moments USING GIST(location);
CREATE INDEX moments_status_ends_at_idx ON moments(status, ends_at);
CREATE INDEX moments_creator_idx ON moments(creator_id);
CREATE INDEX moments_city_code_idx ON moments(city_code);

-- Moment participants
CREATE TABLE moment_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(moment_id, user_id)
);

CREATE INDEX moment_participants_moment_idx ON moment_participants(moment_id);
CREATE INDEX moment_participants_user_idx ON moment_participants(user_id);

-- Moment messages
CREATE TABLE moment_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX moment_messages_moment_created_idx ON moment_messages(moment_id, created_at);
CREATE INDEX moment_messages_user_idx ON moment_messages(user_id);

-- Flags
CREATE TABLE flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('moment', 'message')),
  target_id UUID NOT NULL,
  reason TEXT CHECK (reason IN ('spam', 'inappropriate', 'harassment', 'other')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(reporter_id, target_type, target_id)
);

CREATE INDEX flags_target_idx ON flags(target_type, target_id);
CREATE INDEX flags_reporter_idx ON flags(reporter_id);

-- User roles
CREATE TABLE user_roles (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'moderator')),
  granted_at TIMESTAMPTZ DEFAULT now(),
  granted_by UUID REFERENCES profiles(id)
);

-- ============================================================================
-- 2. SECURITY DEFINER FUNCTIONS (tightly scoped)
-- ============================================================================

-- Admin check
CREATE OR REPLACE FUNCTION is_admin(check_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  target_id UUID;
BEGIN
  target_id := COALESCE(check_user_id, auth.uid());
  
  RETURN EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = target_id 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- Get flag count (deterministic)
CREATE OR REPLACE FUNCTION get_flag_count(
  p_target_type TEXT,
  p_target_id UUID
)
RETURNS INT AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INT 
    FROM flags 
    WHERE target_type = p_target_type 
    AND target_id = p_target_id
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- Get moment context (aggregated, privacy-safe)
CREATE OR REPLACE FUNCTION get_moment_context(moment_uuid UUID)
RETURNS JSON AS $$
DECLARE
  total_participants INT;
  unique_countries INT;
  common_languages TEXT[];
  has_english BOOLEAN;
  badge_diversity TEXT;
  badge_language TEXT;
  result JSON;
BEGIN
  SELECT 
    COUNT(*)::INT,
    COUNT(DISTINCT p.home_country)::INT,
    array_agg(DISTINCT unnest(p.languages))
  INTO 
    total_participants, 
    unique_countries, 
    common_languages
  FROM moment_participants mp
  JOIN profiles p ON mp.user_id = p.id
  WHERE mp.moment_id = moment_uuid;

  IF unique_countries >= 3 THEN
    badge_diversity := 'International';
  ELSIF unique_countries = 1 THEN
    badge_diversity := 'Mostly locals';
  ELSE
    badge_diversity := 'Mixed crowd';
  END IF;

  has_english := 'en' = ANY(common_languages);
  badge_language := CASE WHEN has_english THEN 'English friendly' ELSE NULL END;

  result := json_build_object(
    'badges', array_remove(ARRAY[badge_diversity, badge_language], NULL),
    'participant_count', COALESCE(total_participants, 0)
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- Check if user is participant
CREATE OR REPLACE FUNCTION is_participant(
  p_moment_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  target_user UUID;
BEGIN
  target_user := COALESCE(p_user_id, auth.uid());
  
  RETURN EXISTS (
    SELECT 1 FROM moment_participants 
    WHERE moment_id = p_moment_id 
    AND user_id = target_user
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- Production-safe capacity check with lock
CREATE OR REPLACE FUNCTION can_join_moment(p_moment_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  moment_max INT;
  current_count INT;
  moment_status TEXT;
  moment_ends TIMESTAMPTZ;
BEGIN
  -- Lock the moment row for capacity check
  SELECT max_participants, status, ends_at
  INTO moment_max, moment_status, moment_ends
  FROM moments
  WHERE id = p_moment_id
  FOR UPDATE;
  
  -- Check moment is active and not expired
  IF moment_status != 'active' OR moment_ends <= now() THEN
    RETURN FALSE;
  END IF;
  
  -- Count current participants
  SELECT COUNT(*)::INT INTO current_count
  FROM moment_participants
  WHERE moment_id = p_moment_id;
  
  RETURN current_count < moment_max;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================================================
-- 3. TRIGGERS
-- ============================================================================

-- Auto-join creator
CREATE OR REPLACE FUNCTION auto_join_creator()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO moment_participants (moment_id, user_id)
  VALUES (NEW.id, NEW.creator_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER on_moment_created_join_creator
  AFTER INSERT ON moments
  FOR EACH ROW
  EXECUTE FUNCTION auto_join_creator();

-- Auto-hide on flag threshold
CREATE OR REPLACE FUNCTION handle_new_flag()
RETURNS TRIGGER AS $$
DECLARE
  current_flag_count INT;
  flag_threshold INT := 3;
BEGIN
  current_flag_count := get_flag_count(NEW.target_type, NEW.target_id);

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

CREATE TRIGGER on_flag_created
  AFTER INSERT ON flags
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_flag();

-- Updated_at maintenance
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 4. ROW-LEVEL SECURITY POLICIES
-- ============================================================================

-- PROFILES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile" ON profiles FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Admins read all profiles" ON profiles FOR SELECT 
USING (is_admin());

CREATE POLICY "Users insert own profile" ON profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users update own profile" ON profiles FOR UPDATE 
USING (auth.uid() = id);

-- MOMENTS
ALTER TABLE moments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read active moments" ON moments FOR SELECT 
USING (
  status = 'active' 
  OR is_admin()
);

CREATE POLICY "Authenticated users create moments" ON moments FOR INSERT 
WITH CHECK (
  auth.uid() = creator_id
  AND starts_at >= now() - interval '10 minutes'
  AND ends_at > starts_at
  AND ends_at <= now() + interval '24 hours'
);

CREATE POLICY "Creators/admins update moments" ON moments FOR UPDATE 
USING (
  auth.uid() = creator_id 
  OR is_admin()
);

CREATE POLICY "Creators/admins delete moments" ON moments FOR DELETE 
USING (
  auth.uid() = creator_id 
  OR is_admin()
);

-- MOMENT_PARTICIPANTS
ALTER TABLE moment_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read participants of active moments" ON moment_participants FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM moments 
    WHERE moments.id = moment_participants.moment_id 
    AND moments.status = 'active'
  )
  OR is_admin()
);

CREATE POLICY "Users join active moments" ON moment_participants FOR INSERT 
WITH CHECK (
  auth.uid() = user_id
  AND can_join_moment(moment_id)
);

CREATE POLICY "Users leave moments" ON moment_participants FOR DELETE 
USING (auth.uid() = user_id);

-- MOMENT_MESSAGES
ALTER TABLE moment_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read messages" ON moment_messages FOR SELECT 
USING (
  is_participant(moment_id)
  OR is_admin()
);

CREATE POLICY "Participants send messages" ON moment_messages FOR INSERT 
WITH CHECK (
  auth.uid() = user_id
  AND is_participant(moment_id)
  AND EXISTS (
    SELECT 1 FROM moments 
    WHERE id = moment_id 
    AND status = 'active'
    AND ends_at > now()
  )
);

-- FLAGS
ALTER TABLE flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users create flags" ON flags FOR INSERT 
WITH CHECK (
  auth.uid() = reporter_id
  AND (
    (target_type = 'moment' AND EXISTS (
      SELECT 1 FROM moments WHERE id = target_id AND status = 'active'
    ))
    OR
    (target_type = 'message' AND EXISTS (
      SELECT 1 FROM moment_messages mm 
      WHERE mm.id = target_id 
      AND is_participant(mm.moment_id)
    ))
  )
);

CREATE POLICY "Admins read flags" ON flags FOR SELECT 
USING (is_admin());

-- USER_ROLES
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage roles" ON user_roles FOR ALL 
USING (is_admin());

-- ============================================================================
-- 5. HELPER QUERIES (for Edge Functions)
-- ============================================================================

-- Expire past moments (cron job)
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

-- Query nearby moments with proper geometry constructor
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
  user_location := (ST_SetSRID(ST_MakePoint(user_lng::float8, user_lat::float8), 4326))::geography;
  
  RETURN QUERY
  SELECT 
    m.id,
    m.title,
    m.lat,
    m.lng,
    m.starts_at,
    m.ends_at,
    m.max_participants,
    COUNT(mp.id) as participant_count,
    ST_Distance(m.location, user_location)::NUMERIC as distance_meters
  FROM moments m
  LEFT JOIN moment_participants mp ON m.id = mp.moment_id
  WHERE m.status = 'active'
  AND m.ends_at > now()
  AND ST_DWithin(m.location, user_location, radius_meters)
  GROUP BY m.id
  ORDER BY distance_meters ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================================================
-- 6. GRANTS (explicit permissions for client RPCs)
-- ============================================================================

-- Public RPCs for authenticated users
GRANT EXECUTE ON FUNCTION get_nearby_moments(NUMERIC, NUMERIC, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_moment_context(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_participant(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_join_moment(UUID) TO authenticated;

-- Admin/service-role only
REVOKE ALL ON FUNCTION expire_past_moments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION expire_past_moments() TO service_role;

REVOKE ALL ON FUNCTION is_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_admin(UUID) TO authenticated;

-- ============================================================================
-- 7. REALTIME CONFIGURATION
-- ============================================================================

-- Enable realtime via Supabase Dashboard → Database → Replication:
-- ALTER PUBLICATION supabase_realtime ADD TABLE moment_messages;
-- ALTER PUBLICATION supabase_realtime ADD TABLE moment_participants;

-- ============================================================================
-- 8. INITIAL ADMIN SETUP
-- ============================================================================

-- After your first auth, run:
-- INSERT INTO user_roles (user_id, role) 
-- VALUES ('YOUR-USER-UUID-HERE', 'admin');

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

