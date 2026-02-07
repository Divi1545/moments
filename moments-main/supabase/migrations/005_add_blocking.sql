-- ============================================================================
-- Migration 005: User Blocking System (Apple App Store 1.2 Compliance)
-- ============================================================================
-- Adds ability for users to block other users from interacting with them

-- ============================================================================
-- 1. CREATE BLOCKED USERS TABLE
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

COMMENT ON TABLE blocked_users IS 'User blocking for safety and harassment prevention';
COMMENT ON COLUMN blocked_users.blocker_id IS 'User who initiated the block';
COMMENT ON COLUMN blocked_users.blocked_id IS 'User who is being blocked';

-- ============================================================================
-- 2. HELPER FUNCTION - Check if User is Blocked
-- ============================================================================

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

-- ============================================================================
-- 3. ROW LEVEL SECURITY FOR BLOCKED_USERS
-- ============================================================================

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- Users can view their own blocks (who they've blocked)
CREATE POLICY "Users view own blocks" ON blocked_users
  FOR SELECT USING (auth.uid() = blocker_id);

-- Users can create blocks
CREATE POLICY "Users can block others" ON blocked_users
  FOR INSERT WITH CHECK (
    auth.uid() = blocker_id
    AND blocker_id != blocked_id
  );

-- Users can unblock (delete their blocks)
CREATE POLICY "Users can unblock" ON blocked_users
  FOR DELETE USING (auth.uid() = blocker_id);

-- Admins can view all blocks
CREATE POLICY "Admins view all blocks" ON blocked_users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'moderator'))
  );

-- ============================================================================
-- 4. UPDATE EXISTING POLICIES TO RESPECT BLOCKS
-- ============================================================================

-- Update moment_messages policy to prevent blocked users from seeing each other's messages
DROP POLICY IF EXISTS "Participants read messages" ON moment_messages;
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

-- Update moment_participants policy to filter out blocked users
DROP POLICY IF EXISTS "Read participants" ON moment_participants;
CREATE POLICY "Read participants" ON moment_participants FOR SELECT USING (
  NOT EXISTS (
    SELECT 1 FROM blocked_users
    WHERE (blocker_id = auth.uid() AND blocked_id = moment_participants.user_id)
    OR (blocker_id = moment_participants.user_id AND blocked_id = auth.uid())
  )
);

-- Prevent blocked users from joining the same moment
DROP POLICY IF EXISTS "Users join moments" ON moment_participants;
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

-- ============================================================================
-- 5. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION is_user_blocked(UUID, UUID) TO authenticated;

-- ============================================================================
-- Migration Complete
-- ============================================================================

SELECT '✅ User blocking system created! Users can now block abusive users.' as status;
