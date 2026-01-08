# Moments MVP - Replit + GoodBarber Deployment Guide

Complete step-by-step guide to deploy your Moments MVP on Replit and embed it in GoodBarber.

**Total Time:** ~30-40 minutes

---

## 📋 Pre-Deployment Checklist

Before starting, create accounts on:
- [ ] [Supabase](https://supabase.com) (Backend + Database)
- [ ] [Mapbox](https://mapbox.com) (Maps API)
- [ ] [Replit](https://replit.com) (Hosting)
- [ ] [GoodBarber](https://goodbarber.com) (Mobile app platform)

---

## Part 1: Supabase Setup (15-20 min)

### Step 1.1: Create Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **"New Project"**
3. Fill in:
   - **Project Name**: `moments-mvp` (or your choice)
   - **Database Password**: Generate strong password (save it!)
   - **Region**: Choose closest to your users
4. Click **"Create new project"**
5. Wait 2-3 minutes for provisioning

### Step 1.2: Get API Credentials

1. In your Supabase project dashboard, click **Settings** (gear icon)
2. Navigate to **API** section
3. Copy and save:
   - **Project URL** (e.g., `https://abcdefgh.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)
   - **service_role key** (⚠️ Keep secret! For Edge Functions only)

### Step 1.3: Enable PostGIS Extension

1. Click **SQL Editor** in left sidebar
2. Click **"+ New query"**
3. Paste and run:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

4. Click **RUN** (or press Ctrl/Cmd + Enter)
5. You should see: `Success. No rows returned`

### Step 1.4: Run Database Migration

1. Open the file `supabase/migrations/001_initial_schema.sql` from your project
2. Copy the **entire contents**
3. In Supabase SQL Editor, click **"+ New query"**
4. Paste the migration SQL
5. Click **RUN**
6. Wait ~10 seconds
7. Verify success:
   - Go to **Database** → **Tables**
   - You should see: `profiles`, `moments`, `moment_participants`, `moment_messages`, `flags`, `user_roles`

### Step 1.5: Enable Realtime for Tables

1. Go to **Database** → **Replication**
2. Find `moment_messages` table
   - Toggle **Realtime** to ON
   - Check ✅ **INSERT** events
3. Find `moment_participants` table
   - Toggle **Realtime** to ON
   - Check ✅ **INSERT** and **DELETE** events
4. Click **Save** (if prompted)

### Step 1.6: Configure Authentication

1. Go to **Authentication** → **Providers**
2. Find **Email** provider
   - Ensure it's **Enabled**
   - Enable **"Confirm email"** (recommended)
3. Go to **Authentication** → **URL Configuration**
4. Add your domains to **Redirect URLs** (add more later):
   ```
   http://localhost:3000/*
   ```

### Step 1.7: Deploy Edge Functions

#### Install Supabase CLI

```bash
# macOS/Linux
brew install supabase/tap/supabase

# Windows (via npm)
npm install -g supabase

# Or via Scoop (Windows)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

#### Login and Link Project

```bash
# Login to Supabase
supabase login

# Link your project (get project ref from dashboard URL)
supabase link --project-ref your-project-ref
```

#### Deploy Functions

```bash
# Deploy expire-moments function
supabase functions deploy expire-moments

# Deploy moderate-moment function (optional)
supabase functions deploy moderate-moment
```

#### Set Up Cron Job for Auto-Expiry

1. In Supabase Dashboard, go to **Database** → **Extensions**
2. Search for `pg_cron` and **Enable** it
3. Go to **SQL Editor**, create new query:

```sql
-- Run expire-moments every 5 minutes
SELECT cron.schedule(
  'expire-moments-job',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/expire-moments',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
      'Content-Type', 'application/json'
    )
  );
  $$
);
```

4. Replace:
   - `YOUR-PROJECT-REF` with your project reference
   - `YOUR_SERVICE_ROLE_KEY` with your service role key (from Step 1.2)
5. Run the query

---

## Part 2: Mapbox Setup (5 min)

### Step 2.1: Create Mapbox Account

1. Go to [mapbox.com/signup](https://mapbox.com/signup)
2. Sign up (free tier is sufficient for MVP)
3. Verify your email

### Step 2.2: Get Access Token

1. Go to [account.mapbox.com](https://account.mapbox.com)
2. Scroll to **Access tokens**
3. Copy the **Default public token** (starts with `pk.`)
4. Save it for next step

---

## Part 3: Replit Deployment (10-15 min)

### Step 3.1: Import to Replit

1. Go to [replit.com](https://replit.com)
2. Click **"+ Create Repl"**
3. Select **"Import from GitHub"**
4. Paste your repository URL
5. Click **"Import from GitHub"**
6. Wait for import to complete

### Step 3.2: Add Secrets

1. In Replit, click **"Tools"** → **"Secrets"** (or click lock icon in sidebar)
2. Click **"New secret"** and add these 3 secrets:

| Key | Value | Notes |
|-----|-------|-------|
| `SUPABASE_URL` | `https://yourproject.supabase.co` | From Supabase Step 1.2 |
| `SUPABASE_ANON_KEY` | `eyJ...` | From Supabase Step 1.2 |
| `MAPBOX_TOKEN` | `pk.eyJ...` | From Mapbox Step 2.2 |

**Important:** Use exact key names (no `VITE_` prefix)

### Step 3.3: Run the App

1. Click **"Run"** (big green button at top)
2. Wait 10-15 seconds for:
   - Dependencies to install
   - Server to start
3. You should see in console:
   ```
   ✅ Moments MVP running on port 5000
   🌐 Local: http://localhost:5000
   📱 Replit URL: https://your-repl.username.repl.co
   ```
4. **Copy the Replit URL** - you'll need it for GoodBarber!

### Step 3.4: Test the App

1. Click the **"Webview"** pane in Replit
2. The app should load and show:
   - Auth screen (if not logged in)
   - Map view (after login)
3. Try creating a test moment to verify everything works

---

## Part 4: GoodBarber Integration (10 min)

### Step 4.1: Update Supabase Redirect URLs

1. Go back to Supabase Dashboard
2. Navigate to **Authentication** → **URL Configuration**
3. Add your Replit URL to **Redirect URLs**:
   ```
   https://your-repl.username.repl.co/*
   ```
4. Click **Save**

### Step 4.2: Add WebView Section in GoodBarber

1. Log in to [goodbarber.com](https://www.goodbarber.com)
2. Go to your app backend
3. Click **"Sections"** → **"+ Add Section"**
4. Choose **"Custom URL"** or **"WebView"**
5. Name it: `Moments`

### Step 4.3: Configure WebView Settings

#### URL:
- Paste your Replit URL: `https://your-repl.username.repl.co`

#### Permissions (CRITICAL):
- ✅ **Geolocation** (required for nearby moments)
- ✅ **JavaScript** (required)
- ✅ **Local storage** (required for auth)
- ✅ **DOM Storage** (required for realtime)

#### Navigation:
- ✅ **Use internal navigation**: ON
- ❌ **Open external links in browser**: OFF
- ✅ **Display navigation bar**: ON (optional)

#### Display:
- **Orientation**: Portrait
- **Pull to refresh**: Enabled
- **Zoom**: Disabled
- **Bounce effect**: Disabled

### Step 4.4: Save and Test

1. Click **"Save"**
2. Open **GoodBarber Preview App** on your phone
3. Navigate to **Moments** section
4. Test:
   - [ ] App loads
   - [ ] Map displays
   - [ ] Location access works
   - [ ] Can create moment
   - [ ] Can join moment
   - [ ] Chat works

---

## Part 5: Create Admin Account (5 min)

### Step 5.1: Sign Up

1. Open your Replit URL
2. Enter your email and click "Send Magic Link"
3. Check your email and click the link
4. Complete your profile

### Step 5.2: Grant Admin Role

1. Go to Supabase Dashboard → **Authentication** → **Users**
2. Copy your **User ID (UUID)**
3. Go to **SQL Editor**, run:

```sql
INSERT INTO user_roles (user_id, role) 
VALUES ('YOUR-USER-UUID-HERE', 'admin');
```

4. Now you have admin access to view hidden/flagged content

---

## Part 6: Keep Repl Alive (Optional but Recommended)

### Problem
Free Repls sleep after 1 hour of inactivity.

### Solutions

**Option 1: Replit Hacker Plan** (Recommended)
- Upgrade to Replit Hacker ($7/month)
- Get "Always On" feature
- Your Repl never sleeps

**Option 2: UptimeRobot** (Free)
1. Go to [uptimerobot.com](https://uptimerobot.com)
2. Create free account
3. Add monitor:
   - **Type**: HTTP(s)
   - **URL**: Your Replit URL
   - **Interval**: Every 5 minutes
4. This pings your Repl to keep it awake

---

## 🎉 You're Live!

Your Moments MVP is now:
- ✅ Hosted on Replit
- ✅ Embedded in GoodBarber
- ✅ Database on Supabase
- ✅ Auto-expiry working

---

## 📊 Post-Deployment Checklist

### Security
- [ ] Supabase RLS policies enabled (done via migration)
- [ ] Service role key NOT in frontend code
- [ ] Replit Secrets properly configured
- [ ] Auth redirect URLs include Replit domain

### Testing
- [ ] Create moment works
- [ ] Join moment works
- [ ] Chat real-time works
- [ ] Flagging works (test with 3 flags)
- [ ] Auto-expiry works (wait or trigger manually)

### Monitoring
- [ ] Check Supabase Dashboard → Reports (API usage)
- [ ] Check Replit logs for errors
- [ ] Test on iOS and Android via GoodBarber Preview

---

## 🐛 Troubleshooting

### "Repl keeps sleeping"
**Fix**: Use UptimeRobot or upgrade to Hacker plan

### "Blank screen in GoodBarber"
**Fix**: Enable JavaScript in WebView settings

### "Map not loading"
**Fix**: Check Mapbox token in Replit Secrets

### "Auth redirects to external browser"
**Fix**: 
- Add Replit URL to Supabase redirect URLs
- Disable "Open external links in browser" in GoodBarber

### "Messages not real-time"
**Fix**: Enable DOM Storage in GoodBarber WebView settings

### "Can't join moment"
**Fix**: Check moment hasn't expired and isn't full

---

## 📱 Next Steps

1. **Beta Test**: Share with 10-20 users
2. **Monitor**: Check Supabase usage daily
3. **Gather Feedback**: What works? What doesn't?
4. **Iterate**: Add features based on user needs

---

## 📚 Additional Resources

- **Replit Docs**: [docs.replit.com](https://docs.replit.com)
- **GoodBarber Guide**: [GOODBARBER.md](GOODBARBER.md)
- **Supabase Docs**: [supabase.com/docs](https://supabase.com/docs)
- **General README**: [README.md](README.md)

---

**Congratulations! Your app is live! 🚀**
