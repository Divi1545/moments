# 🚀 Deployment Guide - Moments App

## ✅ COMPLETE FEATURE LIST

### Core Features
- ✅ User authentication & profile creation with photo upload
- ✅ Interactive map with location-based moments
- ✅ Create moments (2-100 participants, with preview photos)
- ✅ Join/leave moments (host 1, join many)
- ✅ Real-time group chat with profile avatars
- ✅ Flag inappropriate content

### NEW Features Implemented
- ✅ **Search** - Find moments by keyword within 10km
- ✅ **Multi-Join** - Host 1 moment, join unlimited others
- ✅ **Ephemeral Images** - Share photos in chat that disappear after 5 minutes
- ✅ **SOS Safety System** - Emergency alerts with location tracking
- ✅ **Auto Photo Cleanup** - Moment photos deleted 2 days after end, profiles after 60 days inactivity

---

## 📋 DEPLOYMENT STEPS

### Step 1: Database Setup

1. **Go to Supabase SQL Editor**
   - Navigate to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new

2. **Run Complete Migration**
   - Copy contents from: `supabase/migrations/004_complete_setup.sql`
   - Paste into SQL Editor
   - Click "Run"
   - ✅ Verify success message appears

**Expected Result:**
```
✅ Database setup complete! All tables, functions, and policies ready!
```

---

### Step 2: Deploy Edge Functions

#### A. Install Supabase CLI (if not already installed)

**Windows:**
```powershell
scoop install supabase
```

**Mac:**
```bash
brew install supabase/tap/supabase
```

**Linux:**
```bash
brew install supabase/tap/supabase
```

#### B. Login to Supabase
```bash
supabase login
```

#### C. Link Your Project
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Find your project ref in the Supabase URL:
`https://supabase.com/dashboard/project/[YOUR_PROJECT_REF]`

#### D. Deploy Functions

**Deploy Ephemeral Image Cleanup (runs every 5 minutes):**
```bash
supabase functions deploy cleanup-ephemeral-images --no-verify-jwt
```

**Deploy Photo Cleanup (runs daily):**
```bash
supabase functions deploy cleanup-photos --no-verify-jwt
```

**Expected Output:**
```
✓ Deploying function...
✓ Function deployed successfully!
```

---

### Step 3: Configure Cron Jobs

1. **Go to Supabase Dashboard** → **Database** → **Cron Jobs**
2. **Add Two Cron Jobs:**

#### Job 1: Cleanup Ephemeral Images
- **Name**: `cleanup-ephemeral-images`
- **Schedule**: `*/5 * * * *` (every 5 minutes)
- **Command**:
```sql
SELECT net.http_post(
  url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/cleanup-ephemeral-images',
  headers:=jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))
);
```

#### Job 2: Cleanup Photos
- **Name**: `cleanup-photos`
- **Schedule**: `0 3 * * *` (daily at 3 AM UTC)
- **Command**:
```sql
SELECT net.http_post(
  url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/cleanup-photos',
  headers:=jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))
);
```

**Note:** Replace `YOUR_PROJECT_REF` with your actual Supabase project reference.

---

### Step 4: Verify Supabase Setup

#### Check Storage Buckets
1. Go to **Storage** in Supabase Dashboard
2. Verify buckets exist:
   - ✅ `avatars` (public)
   - ✅ `moment-photos` (public)

#### Check Database Tables
Run this query in SQL Editor:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

**Expected Tables:**
- ✅ profiles
- ✅ moments
- ✅ moment_participants
- ✅ moment_messages
- ✅ moment_photos
- ✅ sos_alerts
- ✅ flags
- ✅ user_roles

#### Test Functions
```sql
-- Test search function
SELECT * FROM search_moments('coffee', 6.9271, 79.8612, 10000, 10);

-- Test hosting check
SELECT * FROM check_user_active_hosted_moment('YOUR_USER_ID');
```

---

### Step 5: Update Replit Secrets

1. **Go to Replit** → Your Project → **Secrets** (lock icon)
2. **Ensure these secrets exist:**
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anon key
   - `MAPBOX_TOKEN`: Your Mapbox access token

**Get values from:**
- Supabase Dashboard → Settings → API
- Mapbox Dashboard → Access Tokens

---

### Step 6: Push Code to Git

```bash
git add .
git commit -m "Complete app: search, multi-join, ephemeral images, SOS, auto-cleanup"
git push origin main
```

---

### Step 7: Deploy to Replit

1. **Pull latest code** in Replit (if using Git sync)
2. **Click "Run"** button
3. **Wait for server to start**

**Expected Console Output:**
```
Server running on port 3000
Environment variables loaded
Mapbox token configured
```

---

## 🧪 TESTING CHECKLIST

### Test 1: Sign Up & Profile
- [ ] Click "Get Started"
- [ ] Enter email/password → Creates account
- [ ] Upload profile photo → Appears in preview
- [ ] Complete profile form → Redirects to map

### Test 2: Map View
- [ ] Map loads with user location
- [ ] Search bar appears in header
- [ ] Type "coffee" → Shows filtered moments
- [ ] Clear search → Shows all nearby moments

### Test 3: Create Moment (Multi-Join)
- [ ] Click "+ Create" → Modal opens
- [ ] Fill form, upload preview photo
- [ ] Submit → Moment created
- [ ] Try creating another moment → **BLOCKED** with message
- [ ] Can still join other moments

### Test 4: Moment Detail & SOS
- [ ] Click moment marker → View details
- [ ] Click "Join Moment" → Joins successfully
- [ ] SOS button appears for participants
- [ ] Long-press SOS (2 seconds) → Confirmation modal
- [ ] Confirm → Alert sent, appears on map

### Test 5: Chat & Ephemeral Images
- [ ] Open chat from moment detail
- [ ] Send text message → Appears instantly
- [ ] Click 📷 button → Upload image
- [ ] Image appears with "Disappears in 5 min" badge
- [ ] Wait 5 minutes → Image shows "🚫 Image expired"

### Test 6: Profile Photos in Chat
- [ ] Chat avatars show profile photos
- [ ] If no photo → Shows initial letter

---

## 🎉 SUCCESS CRITERIA

✅ **All features working:**
- Search finds moments
- Can only host 1 moment at a time
- Can join multiple moments
- Chat images disappear after 5 minutes
- SOS alerts show on map
- Profile/moment photos upload correctly

✅ **No console errors**

✅ **Database queries run successfully**

✅ **Storage buckets accessible**

---

## 📊 MONITOR CLEANUP FUNCTIONS

### Check Ephemeral Image Cleanup Logs
```bash
supabase functions logs cleanup-ephemeral-images
```

### Check Photo Cleanup Logs
```bash
supabase functions logs cleanup-photos
```

**Expected Output:**
```json
{
  "success": true,
  "message": "Photo cleanup completed",
  "momentPhotosDeleted": 12,
  "profilePhotosDeleted": 3,
  "errors": 0
}
```

---

## 🐛 TROUBLESHOOTING

### Issue: "relation does not exist"
**Solution:** Re-run `004_complete_setup.sql` migration

### Issue: Storage bucket not found
**Solution:** Check Supabase Storage dashboard, manually create buckets if needed

### Issue: SOS markers not appearing
**Solution:** Check browser console for RLS policy errors, verify user is authenticated

### Issue: Ephemeral images not deleting
**Solution:** Check cron job is running, verify Edge Function deployed correctly

### Issue: Can't create moment
**Solution:** Check `check_user_active_hosted_moment` function exists and returns data

---

## 🎯 READY TO GO!

Once all tests pass, your app is **LIVE** and ready for users! 🚀

**App URL:** `https://your-replit-username.repl.co`

---

## 📝 NOTES

- **Data Retention:**
  - Chat images: 5 minutes
  - Moment photos: 2 days after moment ends
  - Profile photos: 60 days after last activity

- **Storage Costs:** Near $0 due to aggressive cleanup

- **Security:** All RLS policies active, users can only modify their own data

- **Performance:** Real-time updates via Supabase Realtime

---

**Questions? Check the code comments or Supabase logs for detailed debugging!** 🎉
