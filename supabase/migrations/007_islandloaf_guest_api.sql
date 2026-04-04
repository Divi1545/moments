-- IslandLoaf Stay: public API support + guest joins + guest chat
-- Run in Supabase SQL editor after backup.

ALTER TABLE moments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE moments ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE moments ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE moments ADD COLUMN IF NOT EXISTS location_name TEXT;

CREATE TABLE IF NOT EXISTS moment_guest_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  guest_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(moment_id, email)
);

CREATE INDEX IF NOT EXISTS idx_mgp_moment ON moment_guest_participants(moment_id);
CREATE INDEX IF NOT EXISTS idx_mgp_token ON moment_guest_participants(guest_token);

CREATE TABLE IF NOT EXISTS guest_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  guest_participant_id UUID NOT NULL REFERENCES moment_guest_participants(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gcm_moment_created ON guest_chat_messages(moment_id, created_at);

ALTER TABLE moment_guest_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_chat_messages ENABLE ROW LEVEL SECURITY;

-- Block direct anon access; server uses service role only
DROP POLICY IF EXISTS "service only guest participants" ON moment_guest_participants;
CREATE POLICY "service only guest participants" ON moment_guest_participants FOR ALL USING (false);

DROP POLICY IF EXISTS "service only guest chat" ON guest_chat_messages;
CREATE POLICY "service only guest chat" ON guest_chat_messages FOR ALL USING (false);

-- Nearby moments for Stay chatbot (called with service role from Node)
CREATE OR REPLACE FUNCTION api_nearby_moments(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision,
  p_interests text[] DEFAULT NULL,
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  category text,
  tags text[],
  start_time timestamptz, -- maps to moments.starts_at
  location_name text,
  lat numeric,
  lng numeric,
  distance_km double precision,
  participant_count bigint,
  max_participants int,
  host_name text,
  photo_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mo.id,
    mo.title,
    mo.description,
    mo.category,
    mo.tags,
    mo.starts_at AS start_time,
    mo.location_name,
    mo.lat,
    mo.lng,
    (ST_Distance(
      mo.location::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) / 1000.0)::double precision AS distance_km,
    (SELECT COUNT(*)::bigint FROM moment_participants mp WHERE mp.moment_id = mo.id) AS participant_count,
    mo.max_participants,
    (SELECT p.display_name FROM profiles p WHERE p.id = mo.creator_id LIMIT 1) AS host_name,
    (SELECT mp2.photo_url FROM moment_photos mp2
     WHERE mp2.moment_id = mo.id AND mp2.is_preview = true
     LIMIT 1) AS photo_url
  FROM moments mo
  WHERE mo.status = 'active'
    AND mo.starts_at > now()
    AND mo.ends_at > now()
    AND ST_DWithin(
      mo.location::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_km * 1000
    )
    AND (SELECT COUNT(*) FROM moment_participants mp WHERE mp.moment_id = mo.id) < mo.max_participants
    AND (
      p_interests IS NULL
      OR cardinality(p_interests) = 0
      OR EXISTS (
        SELECT 1 FROM unnest(p_interests) AS t(term)
        WHERE NULLIF(trim(term), '') IS NOT NULL
        AND (
          (mo.category IS NOT NULL AND mo.category ILIKE '%' || trim(term) || '%')
          OR mo.title ILIKE '%' || trim(term) || '%'
          OR (mo.tags IS NOT NULL AND EXISTS (
            SELECT 1 FROM unnest(mo.tags) AS tag
            WHERE tag ILIKE '%' || trim(term) || '%'
          ))
        )
      )
    )
  ORDER BY ST_Distance(
    mo.location::geography,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
  )
  LIMIT GREATEST(1, LEAST(p_limit, 50));
$$;

REVOKE ALL ON FUNCTION api_nearby_moments(double precision, double precision, double precision, text[], int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api_nearby_moments(double precision, double precision, double precision, text[], int) TO service_role;
