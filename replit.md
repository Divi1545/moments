# Moments MVP

## Overview
Moments is a spontaneous social moments discovery app that allows users to create and join ephemeral gatherings on a map. Users can see nearby moments, join them, chat with participants, and even trigger SOS alerts if needed.

## Architecture

### Stack
- **Backend**: Node.js with Express + TypeScript
- **Database**: PostgreSQL (Replit's built-in Neon-backed database)
- **ORM**: Drizzle ORM
- **Frontend**: Vanilla JavaScript with ES Modules
- **Maps**: Mapbox GL JS
- **Authentication**: Session-based auth with bcrypt password hashing

### Project Structure
```
/
├── server/                 # Backend code
│   ├── index.ts           # Express server entry point
│   ├── routes.ts          # API routes and auth setup
│   ├── storage.ts         # Database operations
│   └── db.ts              # Drizzle database connection
├── shared/
│   └── schema.ts          # Drizzle schema definitions
├── public/                 # Frontend static files
│   ├── js/
│   │   ├── config.js      # API client functions
│   │   ├── map.js         # Main map page logic
│   │   ├── moment.js      # Moment detail page
│   │   ├── chat.js        # Chat page
│   │   └── imageUtils.js  # Image processing utilities
│   ├── index.html         # Main map page
│   ├── moment.html        # Moment detail page
│   ├── chat.html          # Chat page
│   └── styles.css         # Global styles
├── uploads/               # User uploaded files (avatars, photos)
├── drizzle.config.ts      # Drizzle configuration
├── package.json
└── tsconfig.json
```

### Database Schema
- **users**: Authentication accounts (email, password hash)
- **profiles**: User profiles (display name, country, languages, user type)
- **moments**: Time-limited gatherings with location
- **moment_participants**: Users who joined a moment
- **moment_messages**: Chat messages in moments
- **moment_photos**: Photos uploaded to moments
- **sos_alerts**: Emergency alerts from users
- **flags**: Content reports
- **user_roles**: Admin/moderator roles
- **sessions**: Express session storage

## Development

### Running the App
```bash
npm run dev
```

### Database Operations
```bash
npm run db:push      # Push schema changes to database
npm run db:generate  # Generate migrations
```

## Environment Variables
- **DATABASE_URL**: PostgreSQL connection string (auto-configured)
- **MAPBOX_TOKEN**: Mapbox API token for maps (required)
- **SESSION_SECRET**: Secret for session encryption (optional, has default)

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/user` - Get current user

### Profiles
- `POST /api/profiles` - Create profile
- `GET /api/profiles/:id` - Get profile

### Moments
- `POST /api/moments` - Create moment
- `GET /api/moments/:id` - Get moment details
- `GET /api/moments/nearby` - Get nearby moments
- `GET /api/moments/search` - Search moments
- `GET /api/moments/:id/context` - Get moment context (badges, participant count)
- `POST /api/moments/:id/join` - Join a moment
- `POST /api/moments/:id/leave` - Leave a moment
- `GET /api/moments/:id/participants` - Get participants
- `GET /api/moments/:id/messages` - Get chat messages
- `POST /api/moments/:id/messages` - Send message
- `GET /api/moments/:id/photos` - Get photos
- `POST /api/moments/:id/photos` - Upload photo

### Other
- `GET /api/sos-alerts` - Get active SOS alerts
- `POST /api/sos-alerts` - Create SOS alert
- `POST /api/flags` - Report content
- `POST /api/upload/avatar` - Upload profile photo

## Recent Changes
- Migrated from Supabase to Replit's built-in PostgreSQL
- Replaced Supabase auth with session-based authentication
- Replaced Supabase client calls with REST API endpoints
- Added file upload support for avatars and moment photos
- Removed Supabase Edge Functions (moderation logic moved to server)

## User Preferences
- None recorded yet

## Notes
- The app requires a MAPBOX_TOKEN to display the map
- User passwords are hashed with bcrypt
- Sessions are stored in PostgreSQL for persistence
- Photos are stored locally in the /uploads directory
