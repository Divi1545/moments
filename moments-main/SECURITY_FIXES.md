# Security Fixes

## RLS on PostGIS System Table (spatial_ref_sys)

### Issue
Supabase Security Advisor shows warning: "RLS Disabled in Public" for the `public.spatial_ref_sys` table.

### Root Cause
When the PostGIS extension is enabled, it creates the `spatial_ref_sys` system table without Row-Level Security (RLS) enabled. The table is owned by the postgres superuser, not by the database user.

### Why This Cannot Be Fixed
**ERROR: 42501: must be owner of table spatial_ref_sys**

In Supabase's managed environment:
- `spatial_ref_sys` is a PostGIS system table
- It's owned by the postgres superuser
- Users don't have permission to ALTER system tables
- This is by design for security and stability

### Resolution
**This Security Advisor warning can be safely ignored** because:
- `spatial_ref_sys` is a PostGIS system table, not user data
- Contains read-only EPSG coordinate reference data
- No sensitive information or user-generated content
- Standard PostGIS installation behavior
- Cannot be modified in managed database environments

### Workaround
None needed. The warning is cosmetic and does not represent a security risk.

### Impact
- ⚠️ Security Advisor shows 1 warning (expected behavior)
- ✅ No actual security risk
- ✅ Full app functionality maintained
- ✅ Standard for all PostGIS-enabled Supabase databases

### Date Investigated
February 7, 2026

### Related Documentation
- PostGIS documentation: spatial_ref_sys is a system catalog table
- Supabase limitation: Cannot modify ownership of extension-created tables

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
