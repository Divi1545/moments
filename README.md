# Moments MVP

A mobile-first web app for discovering spontaneous, time-limited social gatherings nearby. Built for embedding in GoodBarber WebView.

## 🎯 Core Concept

Moments is **NOT** a social network. It's about **spontaneous gatherings**, not profiles or browsing people.

- Users discover **active Moments** happening nearby
- Each Moment has a time window and auto-expires
- Users can join, chat temporarily, and leave
- Context badges show diversity (e.g., "International", "English friendly") without segregation
- No permanent DMs, no profiles browsing, no follows

## 🛠 Tech Stack

- **Frontend**: HTML, CSS, Vanilla JavaScript (no frameworks)
- **Backend**: Supabase (PostgreSQL + PostGIS, Auth, Realtime, Edge Functions)
- **Map**: Mapbox GL JS
- **Hosting**: Replit (or any Node.js hosting)
- **Target**: Mobile browsers inside GoodBarber WebView

## 📂 Project Structure

```
moments-mvp/
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql    # Complete database schema
│   └── functions/
│       ├── expire-moments/           # Cron job to expire past moments
│       └── moderate-moment/          # Optional auto-moderation
├── public/
│   ├── index.html                    # Main map view
│   ├── moment.html                   # Moment details + join
│   ├── chat.html                     # Real-time group chat
│   ├── styles.css                    # Mobile-first styles
│   └── js/
│       ├── config.js                 # Supabase client init
│       ├── map.js                    # Map + nearby query
│       ├── moment.js                 # Join/leave logic
│       └── chat.js                   # Real-time chat
├── .replit                           # Replit configuration
├── replit.nix                        # Replit dependencies
├── server.js                         # Express server
├── package.json                      # Dependencies
└── README.md
```

## 🚀 Quick Start

### Prerequisites

1. **Supabase Account** → [supabase.com](https://supabase.com)
2. **Mapbox Account** → [mapbox.com](https://mapbox.com)
3. **Replit Account** → [replit.com](https://replit.com)
4. **GoodBarber App** → [goodbarber.com](https://goodbarber.com)

### Local Development

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd moments-mvp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   For Replit: Add these as Secrets (Tools → Secrets):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `MAPBOX_TOKEN`

   For local testing: You can modify `public/js/config.js` directly (don't commit credentials).

4. **Run local server**
   ```bash
   npm start
   ```
   
   Open `http://localhost:5000`

## 📊 Database Setup

### 1. Enable PostGIS Extension

In Supabase SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 2. Run Migration

Copy the entire contents of `supabase/migrations/001_initial_schema.sql` and run it in Supabase SQL Editor.

This creates:
- All tables (profiles, moments, participants, messages, flags, roles)
- RLS policies (privacy-hardened)
- SQL functions (nearby search, context badges, capacity checks)
- Triggers (auto-join creator, auto-hide on flags)

### 3. Enable Realtime

In Supabase Dashboard → Database → Replication:

Enable replication for:
- `moment_messages`
- `moment_participants`

### 4. Create First Admin

After your first login, get your user UUID from Supabase Dashboard → Authentication → Users.

Run in SQL Editor:

```sql
INSERT INTO user_roles (user_id, role) 
VALUES ('YOUR-USER-UUID-HERE', 'admin');
```

## ⚡ Edge Functions Setup

### 1. Install Supabase CLI

```bash
npm install -g supabase
```

### 2. Login to Supabase

```bash
supabase login
```

### 3. Link Project

```bash
supabase link --project-ref your-project-ref
```

### 4. Deploy Functions

```bash
supabase functions deploy expire-moments
supabase functions deploy moderate-moment
```

### 5. Set Up Cron Job

In Supabase Dashboard → Database → Cron Jobs (or use pg_cron):

```sql
-- Run every 5 minutes
SELECT cron.schedule(
  'expire-moments',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/expire-moments',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
      'Content-Type', 'application/json'
    )
  );
  $$
);
```

## 🌐 Replit Deployment

### 1. Import to Replit

1. Go to [replit.com](https://replit.com)
2. Click **"+ Create Repl"**
3. Select **"Import from GitHub"**
4. Paste your repository URL
5. Click **"Import from GitHub"**

### 2. Add Secrets

In Replit, click **"Secrets"** (lock icon) and add:

- `SUPABASE_URL` → Your Supabase project URL
- `SUPABASE_ANON_KEY` → Your Supabase anon/public key
- `MAPBOX_TOKEN` → Your Mapbox public token

### 3. Run

Click **"Run"** button. Your app will be live at:
```
https://your-repl.username.repl.co
```

Copy this URL for use in GoodBarber!

## 🔒 Security Features

### Privacy Hardening
- Profiles are NOT publicly readable (only owner + admin)
- Context badges computed via aggregated RPC (no individual exposure)
- Country/language data never used for segregation

### Race-Condition Safety
- Flag counts computed dynamically from source table
- Moment capacity checks use row-level locks
- No denormalized counters that can drift

### Moderation
- Auto-hide Moments/messages at 3 flags (configurable)
- Optional keyword-based auto-moderation on creation
- Admin role can override all policies

## 🧪 Testing Checklist

- [ ] Auth flow (magic link email)
- [ ] Profile creation
- [ ] Create Moment (with map location selection)
- [ ] View Moments on map (nearby query)
- [ ] Join/leave Moment
- [ ] Context badges display correctly
- [ ] Real-time chat works
- [ ] Message sending and receiving
- [ ] Flag Moment/message
- [ ] Auto-expiry (wait for cron or test manually)

## 📱 GoodBarber Integration

### Quick Setup

1. In GoodBarber, add a **Custom URL / WebView** section
2. Set URL to your Replit URL: `https://your-repl.username.repl.co`
3. Enable:
   - ✅ **Geolocation** (required for nearby moments)
   - ✅ **JavaScript**
   - ✅ **Local storage**
   - ✅ **DOM storage**
4. Settings:
   - **Orientation**: Portrait
   - **Pull to refresh**: Enabled
   - **Zoom**: Disabled
   - **Use internal navigation**: ON

### Detailed Guide

See **[GOODBARBER.md](GOODBARBER.md)** for complete step-by-step integration guide.

## 🐛 Troubleshooting

### Map not loading
- Check Mapbox token is correct
- Verify location permissions granted
- Check browser console for CORS errors

### Messages not appearing in real-time
- Verify Realtime replication enabled for tables
- Check Supabase Dashboard → Database → Replication
- Test websocket connection in Network tab

### Can't join Moment
- Check RLS policies in Supabase
- Verify moment is still active (not expired)
- Check capacity not exceeded

### Auth not working
- Verify redirect URLs in Supabase Dashboard → Authentication → URL Configuration
- Add your Replit URL to allowed redirect URLs: `https://your-repl.username.repl.co/*`

## 🔧 Configuration

### Adjust Search Radius

In `public/js/map.js`, modify:

```javascript
radius_meters: 5000  // Default 5km
```

### Adjust Flag Threshold

In `supabase/migrations/001_initial_schema.sql`, modify:

```sql
flag_threshold INT := 3;  -- Auto-hide at 3 flags
```

### Adjust Max Moment Duration

In RLS policy for moment creation:

```sql
AND ends_at <= now() + interval '24 hours'  -- Max 24 hours
```

## 📖 API Reference

### Key SQL Functions

#### `get_nearby_moments(lat, lng, radius, limit)`
Returns active moments within radius, sorted by distance.

#### `get_moment_context(moment_id)`
Returns context badges and participant count (aggregated, privacy-safe).

#### `can_join_moment(moment_id)`
Checks if moment is joinable (race-condition safe with row lock).

#### `is_participant(moment_id, user_id)`
Checks if user is a participant of a moment.

## 🤝 Contributing

This is a production MVP. For changes:
1. Test thoroughly in staging environment
2. Review RLS policies for security implications
3. Update migration file if schema changes
4. Document breaking changes

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Acknowledgments

Built with:
- [Supabase](https://supabase.com)
- [Mapbox](https://mapbox.com)
- [Vercel](https://vercel.com)

---

**Need help?** Check `DEPLOYMENT.md` for detailed step-by-step deployment guide.

#   i s l a n d l o a f - m o m e n t s 
 
 #   m o m e n t s  
 #   m o m e n t s  
 #   m o m e n t s  
 