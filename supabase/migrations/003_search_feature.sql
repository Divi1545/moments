-- ============================================================================
-- Migration 003: Search Feature
-- ============================================================================
-- Adds location and keyword search functionality for moments

-- Search moments by keyword and location
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
  -- If user location provided, create geography point
  IF user_lat IS NOT NULL AND user_lng IS NOT NULL THEN
    user_location := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography;
  END IF;
  
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
    CASE 
      WHEN user_location IS NOT NULL THEN ST_Distance(m.location, user_location)::NUMERIC
      ELSE 0::NUMERIC
    END as distance_meters
  FROM moments m
  LEFT JOIN moment_participants mp ON m.id = mp.moment_id
  WHERE m.status = 'active' 
  AND m.ends_at > now()
  -- Location filter (if provided)
  AND (
    user_location IS NULL OR
    ST_DWithin(m.location, user_location, radius_meters)
  )
  -- Keyword filter (if provided)
  AND (
    search_query IS NULL OR
    search_query = '' OR
    m.title ILIKE '%' || search_query || '%'
  )
  GROUP BY m.id
  ORDER BY 
    -- Prioritize keyword matches
    CASE 
      WHEN search_query IS NOT NULL AND search_query != '' AND m.title ILIKE '%' || search_query || '%'
      THEN 0
      ELSE 1
    END,
    -- Then by start time (soonest first)
    m.starts_at ASC,
    -- Then by distance (closest first)
    distance_meters ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION search_moments(TEXT, NUMERIC, NUMERIC, INT, INT) TO authenticated;

-- Success message
SELECT 'Search feature migration completed successfully! 🔍' as status;

