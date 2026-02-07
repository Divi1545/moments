# Security Fixes

## RLS on PostGIS System Table (spatial_ref_sys)

### Issue
Supabase Security Advisor flagged: "RLS Disabled in Public" for the `public.spatial_ref_sys` table.

### Root Cause
When the PostGIS extension is enabled, it creates the `spatial_ref_sys` system table without Row-Level Security (RLS) enabled. Supabase requires RLS on all public tables.

### Solution
```sql
-- Enable RLS on PostGIS system table
ALTER TABLE spatial_ref_sys ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access (it's reference data)
CREATE POLICY "Allow public read access to spatial reference systems" 
  ON spatial_ref_sys 
  FOR SELECT 
  USING (true);
```

### Why This is Safe
- `spatial_ref_sys` is a PostGIS system table containing coordinate reference system data
- It's read-only reference data (EPSG codes, projection parameters, etc.)
- No user-generated content or sensitive information
- Standard practice is to allow public read access
- The table is managed by PostGIS, not by application code

### Impact
- ✅ Resolves Security Advisor error
- ✅ Maintains full app functionality
- ✅ No performance impact
- ✅ Complies with Supabase security best practices

### Date Fixed
February 7, 2026

### Related Files
- `supabase/migrations/006_complete_setup_with_compliance.sql` (Section 11)

---

## Infinite Recursion in moment_participants RLS Policy

### Issue
Error: "infinite recursion detected in policy for relation 'moment_participants'"

### Root Cause
The INSERT policy on `moment_participants` was querying the same table to check for blocked participants, triggering recursive SELECT policy evaluation.

### Solution
Created a `SECURITY DEFINER` function that bypasses RLS when checking for blocked participants:

```sql
CREATE OR REPLACE FUNCTION has_blocked_participants_in_moment(
  check_moment_id UUID,
  check_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM moment_participants mp2
    JOIN blocked_users bu ON (
      (bu.blocker_id = check_user_id AND bu.blocked_id = mp2.user_id)
      OR (bu.blocker_id = mp2.user_id AND bu.blocked_id = check_user_id)
    )
    WHERE mp2.moment_id = check_moment_id
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;
```

Updated INSERT policy:
```sql
CREATE POLICY "Users join moments" ON moment_participants FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND NOT has_blocked_participants_in_moment(moment_id, auth.uid())
);
```

### Impact
- ✅ Resolved infinite recursion error
- ✅ Users can now create and join moments successfully
- ✅ Blocking functionality preserved
- ✅ No security compromise

### Date Fixed
February 7, 2026

### Related Files
- `supabase/migrations/006_complete_setup_with_compliance.sql` (Section 4 - Functions, Section 7 - Policies)
