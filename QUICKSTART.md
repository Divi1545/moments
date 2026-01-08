# Moments MVP - Replit Quick Start

Deploy your app in 30-40 minutes with this checklist.

---

## ⚡ Speed Run Deployment (30-40 min)

### □ Step 1: Supabase (15 min)

1. □ Create account at [supabase.com](https://supabase.com)
2. □ Create new project
3. □ Copy **Project URL** and **anon key** (Settings → API)
4. □ Enable PostGIS extension (SQL Editor):
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
5. □ Run migration (copy entire `supabase/migrations/001_initial_schema.sql`)
6. □ Enable Realtime (Database → Replication):
   - `moment_messages` → ON
   - `moment_participants` → ON
7. □ Add redirect URL (Authentication → URL Configuration):
   - `http://localhost:5000/*`

### □ Step 2: Mapbox (5 min)

1. □ Create account at [mapbox.com](https://mapbox.com)
2. □ Copy **Default public token** (Account → Access tokens)

### □ Step 3: Deploy to Replit (10 min)

1. □ Go to [replit.com](https://replit.com)
2. □ Click **"+ Create Repl"** → **"Import from GitHub"**
3. □ Paste your repository URL
4. □ In Replit, click **"Secrets"** (lock icon) and add:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `MAPBOX_TOKEN`
5. □ Click **"Run"**
6. □ Copy your Replit URL from console or browser bar

### □ Step 4: Edge Functions (10 min)

1. □ Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```
2. □ Login and link:
   ```bash
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   ```
3. □ Deploy functions:
   ```bash
   supabase functions deploy expire-moments
   supabase functions deploy moderate-moment
   ```
4. □ Set up cron job (SQL Editor):
   ```sql
   SELECT cron.schedule(
     'expire-moments-job',
     '*/5 * * * *',
     $$
     SELECT net.http_post(
       url := 'https://YOUR-PROJECT.supabase.co/functions/v1/expire-moments',
       headers := jsonb_build_object(
         'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
         'Content-Type', 'application/json'
       )
     );
     $$
   );
   ```

### □ Step 5: GoodBarber Integration (10 min)

1. □ Update Supabase redirect URL with Replit URL:
   - Supabase → Authentication → URL Configuration
   - Add: `https://your-repl.username.repl.co/*`
2. □ In GoodBarber, add **WebView** section
3. □ Set URL to your Replit URL
4. □ Enable permissions:
   - ✅ Geolocation
   - ✅ JavaScript
   - ✅ Local storage
   - ✅ DOM storage
5. □ Set navigation:
   - ✅ Use internal navigation
   - ❌ Open external links in browser
6. □ Save and test in GoodBarber Preview App

### □ Step 6: Create Admin (5 min)

1. □ Sign up on your app
2. □ Get user UUID from Supabase → Authentication → Users
3. □ Run in SQL Editor:
   ```sql
   INSERT INTO user_roles (user_id, role) 
   VALUES ('YOUR-UUID', 'admin');
   ```

### □ Step 7: Test Everything

- □ Create moment
- □ Join moment
- □ Send chat message
- □ Flag content
- □ Verify real-time updates work

---

## 🎉 Done!

Your app is live at:
- **Replit**: `https://your-repl.username.repl.co`
- **GoodBarber**: Embedded in your mobile app

---

## 🔄 Keep Repl Alive (Optional)

**Free Repls sleep after 1 hour of inactivity.**

**Option 1**: Upgrade to Replit Hacker ($7/month) for "Always On"

**Option 2**: Use [UptimeRobot](https://uptimerobot.com) (free) to ping every 5 min

---

## 📚 Need More Details?

- **Full deployment guide**: See [DEPLOYMENT.md](DEPLOYMENT.md)
- **GoodBarber integration**: See [GOODBARBER.md](GOODBARBER.md)
- **Configuration options**: See [README.md](README.md)
- **Architecture overview**: See [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)

---

## 🆘 Quick Troubleshooting

| Problem | Fix |
|---------|-----|
| Map not loading | Check Mapbox token in Replit Secrets |
| Can't sign in | Add Replit URL to Supabase Auth redirect URLs |
| Messages not real-time | Enable Realtime replication + DOM storage |
| Can't create moment | Check PostGIS extension is enabled |
| Repl sleeping | Use UptimeRobot or upgrade to Hacker plan |
| Blank screen in GoodBarber | Enable JavaScript in WebView settings |

---

**Good luck with your launch! 🚀**
