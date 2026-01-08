# Moments MVP

## Overview
Moments is a spontaneous social moments discovery app that allows users to create and join ephemeral gatherings on a map. Users can see nearby moments, join them, chat with participants, and even trigger SOS alerts if needed.

## Architecture

### Stack
- **Backend**: Supabase (database, auth, storage, realtime)
- **Frontend**: Vanilla JavaScript with ES Modules
- **Maps**: Mapbox GL JS
- **Server**: Express.js (static file server only)

### Project Structure
```
/
├── public/                 # Frontend static files
│   ├── js/
│   │   ├── config.js      # Supabase client and API functions
│   │   ├── map.js         # Main map page logic
│   │   ├── moment.js      # Moment detail page
│   │   ├── chat.js        # Chat page
│   │   └── imageUtils.js  # Image processing utilities
│   ├── index.html         # Main map page
│   ├── moment.html        # Moment detail page
│   ├── chat.html          # Chat page
│   └── styles.css         # Global styles
├── supabase/
│   ├── migrations/        # Database migrations
│   └── functions/         # Edge functions
├── server.js              # Static file server
└── package.json
```

### Database (Supabase)
- **profiles**: User profiles (display name, country, languages, user type)
- **moments**: Time-limited gatherings with location
- **moment_participants**: Users who joined a moment
- **moment_messages**: Chat messages in moments
- **moment_photos**: Photos uploaded to moments
- **sos_alerts**: Emergency alerts from users
- **flags**: Content reports

## Development

### Running the App
```bash
node server.js
```

## Environment Variables (Required)
- **SUPABASE_URL**: Your Supabase project URL
- **SUPABASE_ANON_KEY**: Your Supabase anonymous key
- **MAPBOX_TOKEN**: Mapbox API token for maps

## Features
- Map-based moment discovery with geolocation
- Create and join ephemeral gatherings
- Real-time chat with participants
- Photo sharing with ephemeral images
- SOS alerts for emergencies
- Content moderation and reporting
- Multi-language support badges

## Supabase Edge Functions
- **cleanup-ephemeral-images**: Removes expired images
- **cleanup-photos**: Cleans up old photos
- **expire-moments**: Marks expired moments
- **moderate-moment**: Content moderation

## Notes
- Uses Supabase Realtime for live chat updates
- Uses Supabase Storage for photo uploads
- Uses Supabase Auth with magic links
- Express.js only serves static files and injects environment variables
