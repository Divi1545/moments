# Moments MVP

## Overview

Moments MVP is a mobile-first web application for discovering spontaneous, time-limited social gatherings nearby. It's designed to be embedded in GoodBarber WebView as part of the IslandLoaf app ecosystem.

**Core Concept:** This is NOT a social network. It focuses on spontaneous gatherings - users discover active Moments happening nearby, join temporarily, chat in real-time, and leave when the Moment expires. No permanent DMs, no profile browsing, no follows.

**Key Features:**
- Map-based discovery of nearby gatherings (5km radius)
- Time-limited Moments that auto-expire
- Real-time group chat for participants
- Context badges showing diversity (International, English-friendly) without segregation
- Moderation system with flagging and auto-hide
- Pink/coral themed UI (IslandLoaf branding)

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Technology:** Vanilla HTML, CSS, and JavaScript (no frameworks)
- **Styling:** Mobile-first CSS with IslandLoaf pink/coral theme (#FF6B8A primary)
- **Map:** Mapbox GL JS v3.0.0 for geospatial visualization
- **PWA Support:** Service worker (sw.js) and manifest.json for offline capabilities
- **Pages:**
  - `index.html` - Main map view with welcome screen and auth
  - `moment.html` - Moment details and join/leave actions
  - `chat.html` - Real-time group chat for participants

### Backend Architecture
- **Server:** Express.js serving static files with environment variable injection
- **Authentication:** Supabase Magic Link (passwordless email auth)
- **Database:** Supabase PostgreSQL with PostGIS extension for geospatial queries
- **Real-time:** Supabase Realtime for live chat updates and participant tracking
- **Security:** Row Level Security (RLS) policies on all tables

### Data Storage
- **Database Schema** (in `supabase/migrations/001_initial_schema.sql`):
  - `profiles` - User profiles with privacy hardening
  - `moments` - Gatherings with geospatial data (PostGIS geometry)
  - `moment_participants` - Join/leave tracking
  - `moment_messages` - Temporary group chat (participant-only access)
  - `flags` - Moderation system (race-condition safe)
  - `user_roles` - Admin/moderator roles

### Key SQL Functions
- `get_nearby_moments()` - PostGIS spatial query (5km default radius)
- `get_moment_context()` - Privacy-safe context badges
- `can_join_moment()` - Race-condition safe capacity check with row locks
- `expire_past_moments()` - Batch expiry for cron job

### Environment Variable Handling
The Express server injects secrets into HTML via `window.ENV` object. This approach avoids VITE_ prefixes and works seamlessly with Replit Secrets.

## External Dependencies

### Third-Party Services
| Service | Purpose | Configuration |
|---------|---------|---------------|
| **Supabase** | Database, Auth, Realtime, Edge Functions | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| **Mapbox** | Map tiles and GL JS library | `MAPBOX_TOKEN` |
| **Replit** | Hosting platform | Automatic via `.replit` config |
| **GoodBarber** | Mobile app wrapper (WebView embedding) | Manual URL configuration |

### NPM Dependencies
- `express@^4.18.2` - Web server for static file serving and env injection

### Edge Functions (Supabase)
- `expire-moments` - Cron job (every 5 min) to expire past moments
- `moderate-moment` - Optional auto-moderation on moment creation

### Required Supabase Extensions
- `postgis` - Geospatial queries
- `pg_trgm` - Text search optimization