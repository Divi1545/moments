# Embedding Moments in GoodBarber

Complete guide to integrate your Moments MVP into your GoodBarber app.

---

## 🎯 Overview

Your Moments app will run on Replit and be embedded in GoodBarber using a **WebView** component. Users will interact with it as if it's a native app section.

---

## Part 1: Get Your Replit URL (5 min)

### Step 1.1: Deploy to Replit

1. Go to [replit.com](https://replit.com)
2. Click **"+ Create Repl"**
3. Select **"Import from GitHub"**
4. Paste your repository URL
5. Click **"Import from GitHub"**

### Step 1.2: Add Secrets

1. Click **"Secrets"** (lock icon) in left sidebar
2. Add these 3 secrets:

| Key | Value | Where to Get |
|-----|-------|--------------|
| `SUPABASE_URL` | `https://yourproject.supabase.co` | Supabase Dashboard → Settings → API |
| `SUPABASE_ANON_KEY` | `eyJ...` | Supabase Dashboard → Settings → API |
| `MAPBOX_TOKEN` | `pk.eyJ...` | Mapbox Dashboard → Access tokens |

### Step 1.3: Run the App

1. Click **"Run"** (green button at top)
2. Wait 10-15 seconds for server to start
3. You'll see: `✅ Moments MVP running on port 3000`
4. Copy the URL from the **Webview** pane (looks like `https://your-repl.username.repl.co`)

**Important:** Keep your Repl running (it will stay online automatically)

---

## Part 2: Configure GoodBarber (10 min)

### Step 2.1: Add WebView Section

1. Log in to [goodbarber.com](https://www.goodbarber.com)
2. Go to your app backend
3. Click **"Sections"** → **"+ Add Section"**
4. Choose **"Custom URL"** or **"WebView"**
5. Name it: `Moments` (or whatever you prefer)

### Step 2.2: WebView Settings

In the WebView section configuration:

#### **URL Settings:**
- **URL**: Paste your Replit URL
  ```
  https://your-repl.username.repl.co
  ```
- **Load in**: WebView (not external browser)

#### **Navigation Settings:**
- ✅ Enable **"Use internal navigation"**
- ✅ Enable **"Display navigation bar"** (if you want back button)
- ❌ Disable **"Open external links in browser"** (keep in WebView)

#### **Display Settings:**
- **Orientation**: Portrait
- **Pull to refresh**: Enabled ✅
- **Zoom**: Disabled ❌
- **Bounce effect**: Disabled ❌

#### **Permissions (CRITICAL):**
- ✅ Enable **"Geolocation"** (required for nearby moments)
- ✅ Enable **"JavaScript"** (required)
- ✅ Enable **"Local storage"** (required for auth)
- ✅ Enable **"DOM Storage"** (required)

### Step 2.3: Icon & Design

1. Upload an icon for the section (use a map pin or location icon)
2. Choose your tab bar position
3. Set colors to match your brand

### Step 2.4: Save & Publish

1. Click **"Save"**
2. Go to **"Preview"** to test
3. When ready, click **"Publish"** to push to production

---

## Part 3: Update Supabase Redirect URLs (5 min)

### Why This Matters
For magic link authentication to work, Supabase needs to allow redirects from your Replit and GoodBarber domains.

### Add Redirect URLs

1. Go to Supabase Dashboard
2. Navigate to **Authentication** → **URL Configuration**
3. Add these URLs to **Redirect URLs**:

```
https://your-repl.username.repl.co/*
http://localhost:3000/*
```

4. If GoodBarber uses a custom domain for WebViews, add that too:
```
https://your-app.goodbarber.app/*
```

5. Click **"Save"**

---

## Part 4: Testing in GoodBarber (10 min)

### Step 4.1: Test on Preview App

1. Download **GoodBarber Preview App** (iOS/Android)
2. Scan QR code from your backend
3. Navigate to **Moments** section

### Step 4.2: Test Core Features

- [ ] **App loads** - No blank screen
- [ ] **Map displays** - Mapbox renders correctly
- [ ] **Location access** - Prompt appears and works
- [ ] **Auth works** - Magic link email arrives
- [ ] **Create moment** - Map tap works, form submits
- [ ] **Join moment** - Join button works
- [ ] **Chat works** - Messages send and receive in real-time
- [ ] **Navigation** - Back button works correctly

### Step 4.3: Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Blank screen | JS not enabled | Enable JavaScript in WebView settings |
| Map not loading | Mapbox token wrong | Check Replit Secrets |
| Can't get location | Permission not granted | Enable Geolocation in WebView settings |
| Auth fails | Redirect URL missing | Add Replit URL to Supabase Auth settings |
| Messages not real-time | DOM storage disabled | Enable DOM Storage in WebView settings |

---

## Part 5: Optional Enhancements

### 5.1: Custom Domain for Replit

If you want a cleaner URL (optional):

1. In Replit, go to your Repl settings
2. Click **"Deployments"**
3. Add a custom domain
4. Update GoodBarber WebView URL
5. Update Supabase redirect URLs

### 5.2: Splash Screen

In GoodBarber:
1. Go to **Design** → **Splash Screen**
2. Upload a Moments-branded splash image
3. This shows while WebView loads

### 5.3: Push Notifications

Future enhancement (requires backend work):
- Use GoodBarber's push notification API
- Notify users when moments nearby
- Notify when someone joins your moment

### 5.4: Deep Linking

Link directly to a specific moment:
```
https://your-repl.username.repl.co/moment.html?id=MOMENT_ID
```

Add this in push notifications or other sections.

---

## Part 6: Going Live Checklist

Before publishing to app stores:

### Security
- [ ] Supabase RLS policies enabled
- [ ] Service role key NOT exposed in frontend
- [ ] Replit Secrets properly set
- [ ] Auth redirect URLs configured

### Performance
- [ ] Replit Repl is **Always On** (paid feature, optional)
- [ ] Or: Set up **Uptime Robot** to ping your Repl every 5 min
- [ ] Test with slow network (3G simulation)

### UX
- [ ] Test on iOS and Android
- [ ] Test on different screen sizes
- [ ] Back button works correctly
- [ ] No popups that break WebView

### Legal
- [ ] Privacy policy added (GoodBarber → Settings → Legal)
- [ ] Terms of service
- [ ] Data collection disclosure

---

## 🐛 Troubleshooting

### "Repl keeps sleeping"

**Problem**: Free Repls sleep after inactivity  
**Fix**: 
- Upgrade to Replit Hacker plan for Always On
- Or use [UptimeRobot](https://uptimerobot.com) to ping every 5 minutes

### "WebView shows old version"

**Problem**: GoodBarber cache  
**Fix**: 
1. Clear cache in GoodBarber backend
2. Re-publish the app
3. Force-close preview app and reopen

### "Can't tap map in WebView"

**Problem**: GoodBarber intercepting touch events  
**Fix**: 
- Ensure "Use internal navigation" is ON
- Check zoom is disabled

### "Auth redirects to external browser"

**Problem**: Redirect URL opens outside WebView  
**Fix**: 
- Check Supabase redirect URLs include your Replit domain
- Ensure "Open external links in browser" is OFF in GoodBarber

---

## 📱 User Flow in GoodBarber

Here's what your users will experience:

1. **Open app** → Tap "Moments" in tab bar
2. **First time**: See auth screen → Enter email → Check email for magic link
3. **Click magic link**: Redirects back to GoodBarber WebView
4. **Complete profile**: Enter name, country, languages, user type
5. **See map**: View nearby moments as pins
6. **Tap pin** → See details → Join moment
7. **Open chat** → Send messages in real-time
8. **Leave moment** → Returns to map

**Seamless experience** - Users won't know it's a WebView!

---

## 📊 Monitoring

### Track Usage

1. **Supabase Dashboard** → Database → Check:
   - `profiles` count (total users)
   - `moments` count (total moments created)
   - `moment_messages` count (engagement)

2. **Replit Analytics** (if on paid plan):
   - Page views
   - Active users
   - Load times

3. **GoodBarber Analytics**:
   - Section views
   - Time spent
   - User retention

---

## 🎉 You're Live in GoodBarber!

Your users can now discover and join spontaneous moments directly from your app.

**Questions?** Check:
- [README.md](README.md) - General documentation
- [DEPLOYMENT.md](DEPLOYMENT.md) - Backend setup
- [QUICKSTART.md](QUICKSTART.md) - Speed-run guide

---

## 🆘 Need Help?

- **Replit Issues**: [replit.com/support](https://replit.com/support)
- **GoodBarber Issues**: [support.goodbarber.com](https://support.goodbarber.com)
- **Supabase Issues**: [supabase.com/docs](https://supabase.com/docs)
- **App Issues**: Check your GitHub repo issues

**Good luck with your launch! 🚀**

