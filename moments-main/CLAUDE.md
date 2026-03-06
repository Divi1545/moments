# CLAUDE.md — Moments by IslandLoaf (moments)

## Owner
Divindu Edirisinghe — AI Code Agency Pvt Ltd, Sri Lanka

## What This Project Is
A spontaneous experiences and gatherings platform for Sri Lanka.
Locals and travelers can create or join real-time "moments" — boat trips, beach meetups, cooking sessions, hikes, anything.
Think of it as the social/community layer on top of IslandLoaf Stay.

## Tech Stack
- Backend: Node.js + Express (server.js)
- Frontend: Vanilla HTML/CSS/JS (PWA)
- Maps: Google Maps API
- Auth: Email OTP
- Real-time: WebSockets (chat)
- Hosting: Target is Vercel or Railway
- Domain: momentsbyislandloaf.com

## How It Works
1. User signs up with email OTP
2. Sets profile (country, languages, local/traveler/expat)
3. Creates a Moment (location, time, max participants, photo)
4. Nearby users see it on a map and join
5. Chat opens between participants
6. Experience happens

## Current State
- Core app is built and functional
- Needs to be connected to isvv vendor system
- Vendor experiences should appear as Moments automatically
- Needs proper production deployment (currently on Replit)

## Environment Variables Required
- FIREBASE_API_KEY or SUPABASE credentials
- GOOGLE_MAPS_API_KEY
- ANTHROPIC_API_KEY (for AI features)
- SESSION_SECRET
- PORT

## Connected Platforms
- isvv (vendor backend) — vendor experiences become Moments
- IslandLoaf Stay — cross-promote experiences

## Current Priorities
1. Deploy off Replit to proper hosting
2. Connect vendor experiences from isvv as auto-generated Moments
3. Add AI-powered moment recommendations using Claude
4. Build notification system for nearby moments

## Rules for Claude
- Always use Anthropic Claude API (claude-sonnet-4-6), never OpenAI
- After completing any task, push changes to GitHub (Divi1545/moments)
- Keep it lightweight and fast — mobile-first PWA
- Focus on Galle area for launch, expand later
