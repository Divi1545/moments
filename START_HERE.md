# 🎉 Welcome to Moments MVP - Replit Edition!

Your app is ready to deploy to Replit and embed in GoodBarber!

---

## ⚡ Quick Start (30-40 minutes)

### Step 1: Read This First
**📖 [QUICKSTART.md](QUICKSTART.md)** - Follow this for fastest deployment

### Step 2: Deploy to Replit
1. Go to [replit.com](https://replit.com)
2. Click **"Import from GitHub"**
3. Paste your repo URL
4. Add 3 Secrets (see below)
5. Click **"Run"**

### Step 3: Add Secrets in Replit
Click **"Secrets"** (lock icon) and add:
```
SUPABASE_URL        → Get from supabase.com
SUPABASE_ANON_KEY   → Get from supabase.com
MAPBOX_TOKEN        → Get from mapbox.com
```

### Step 4: Embed in GoodBarber
1. Copy your Replit URL
2. Add **WebView** section in GoodBarber
3. Paste URL and enable permissions
4. Done! ✅

---

## 📚 Documentation

| File | Purpose |
|------|---------|
| **[QUICKSTART.md](QUICKSTART.md)** | 30-minute deployment checklist ⭐ START HERE |
| **[GOODBARBER.md](GOODBARBER.md)** | Complete GoodBarber integration guide |
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | Detailed step-by-step guide |
| **[README.md](README.md)** | General documentation |
| **[REPLIT_MIGRATION_COMPLETE.md](REPLIT_MIGRATION_COMPLETE.md)** | What changed from Vercel |

---

## 🔧 What You Need

### Accounts (All Free Tier OK)
- ✅ **Supabase** → [supabase.com](https://supabase.com) - Database & Auth
- ✅ **Mapbox** → [mapbox.com](https://mapbox.com) - Maps API
- ✅ **Replit** → [replit.com](https://replit.com) - Hosting
- ✅ **GoodBarber** → [goodbarber.com](https://goodbarber.com) - Mobile app

### Time Required
- Supabase setup: 15 minutes
- Replit deployment: 10 minutes
- GoodBarber integration: 10 minutes
- **Total: 30-40 minutes**

---

## 🎯 What This App Does

**Moments** is a spontaneous social discovery app where users:
- 📍 Discover time-limited gatherings nearby
- 👥 Join moments and chat temporarily
- 🗺️ See everything on a live map
- 🌍 Get context badges (International, English-friendly, etc.)
- ⏰ Auto-expire when time ends

**Not** a social network. No profiles browsing, no permanent DMs, no likes/follows.

---

## ✅ Ready to Launch?

Follow these steps in order:

1. **Deploy Supabase Database**
   - Run `supabase/migrations/001_initial_schema.sql`
   - Enable PostGIS extension
   - Enable Realtime for tables

2. **Get API Tokens**
   - Supabase: Project URL + anon key
   - Mapbox: Public token

3. **Deploy to Replit**
   - Import GitHub repo
   - Add 3 Secrets
   - Click "Run"

4. **Embed in GoodBarber**
   - Add WebView section
   - Paste Replit URL
   - Enable permissions

5. **Test Everything**
   - Create moment
   - Join moment
   - Send chat message
   - Verify real-time works

---

## 🐛 Troubleshooting

### "Where do I add secrets?"
In Replit: **Tools** → **Secrets** (or lock icon in sidebar)

### "My Repl keeps sleeping"
Use [UptimeRobot](https://uptimerobot.com) to ping every 5 min (free)

### "Blank screen in GoodBarber"
Enable **JavaScript** in WebView settings

### "Map not loading"
Check **Mapbox token** in Replit Secrets

---

## 🆘 Need Help?

- **Quick answers**: Check [QUICKSTART.md](QUICKSTART.md) troubleshooting section
- **Detailed help**: See [DEPLOYMENT.md](DEPLOYMENT.md)
- **GoodBarber issues**: See [GOODBARBER.md](GOODBARBER.md)
- **Platform docs**:
  - Replit: [docs.replit.com](https://docs.replit.com)
  - Supabase: [supabase.com/docs](https://supabase.com/docs)
  - GoodBarber: [support.goodbarber.com](https://support.goodbarber.com)

---

## 🚀 Let's Go!

**Your next step:** Open [QUICKSTART.md](QUICKSTART.md) and start deploying!

**Estimated time to live app:** 30-40 minutes

**Good luck! 🎉**

