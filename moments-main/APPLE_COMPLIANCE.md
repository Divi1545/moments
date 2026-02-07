# Apple App Store 1.2 Compliance Documentation

## Overview

This document outlines how the Moments app complies with Apple App Store Review Guideline 1.2 regarding user-generated content.

---

## ✅ Compliance Checklist

### 1. Method for Filtering Objectionable Material ✅

**Requirement**: "A method for filtering objectionable material from being posted to the app"

**Implementation**:

- **Automated Content Filtering**:
  - `supabase/functions/moderate-moment/index.ts` - Filters moment titles for banned keywords and suspicious patterns
  - `supabase/functions/moderate-message/index.ts` - Real-time message filtering with comprehensive profanity filter
  - `supabase/functions/moderate-image/index.ts` - Image moderation framework (ready for AWS Rekognition/Google Vision integration)

- **Banned Content Categories**:
  - Profanity and offensive language
  - Hate speech and slurs
  - Sexual/explicit content
  - Drug-related content
  - Violence and threats
  - Spam and commercial activity
  - URLs, phone numbers, and external platform links

- **Auto-Hide Mechanism**:
  - Content receiving 3+ user reports is automatically hidden
  - Triggered by database trigger in `005_add_blocking.sql`

### 2. Mechanism to Report Offensive Content ✅

**Requirement**: "A mechanism to report offensive content and timely responses to concerns"

**Implementation**:

- **User Reporting**:
  - Flag button (🚩) on all moments (`moment.html`)
  - "Report" button on all chat messages (`chat.html`)
  - Report reasons: Spam, Inappropriate, Harassment, Other
  - Database table: `flags` with unique constraint to prevent duplicate reports

- **Admin Dashboard** (`admin.html`):
  - Real-time view of all flagged content
  - Filter by content type (moments/messages) and reason
  - Quick action buttons: Hide, Delete, Dismiss, Ban User
  - Statistics overview: Total flags, pending reviews, hidden moments

- **Timely Response**:
  - Automated response: Content auto-hidden at 3 flags
  - Human review: Admin dashboard enables 24-hour review commitment
  - Contact email: support@moments-app.com (displayed on all pages)

### 3. Ability to Block Abusive Users ✅

**Requirement**: "The ability to block abusive users from the service"

**Implementation**:

- **User Blocking System**:
  - Database table: `blocked_users` (`005_add_blocking.sql`)
  - "Block User" button in chat messages
  - Blocked users management in Settings page

- **Block Effects**:
  - Blocked users cannot see each other's messages (RLS policy)
  - Blocked users cannot join the same moments (RLS policy)
  - Blocked users are filtered from participant lists
  - Mutual blocking (both directions are blocked)

- **Unblock Feature**:
  - Settings → Blocked Users → Unblock button
  - Full control over blocked users list

### 4. Published Contact Information ✅

**Requirement**: "Published contact information so users can easily reach you"

**Implementation**:

- **Support Page** (`support.html`):
  - Email: support@moments-app.com
  - Response time commitment: 24-48 hours
  - Emergency contact information
  - Detailed safety guidelines

- **Visibility**:
  - Footer links on all pages (index.html, moment.html, chat.html)
  - Floating support button on map view
  - Mentioned in flag/report modals
  - Listed in Community Guidelines

- **Additional Resources**:
  - Community Guidelines (`guidelines.html`)
  - FAQ section
  - Safety tips
  - Appeals process

---

## 🛡️ Additional Safety Features

### Content Moderation Layers

1. **Pre-Post Filtering**: Automated keyword/pattern detection before content is posted
2. **Community Reporting**: User-driven flagging system
3. **Auto-Hide**: Automatic hiding at 3 reports
4. **Human Review**: Admin dashboard for manual moderation
5. **User Blocking**: Individual user-level blocking

### Safety Guidelines

- **Community Guidelines** (`guidelines.html`):
  - Clear rules and consequences
  - Examples of prohibited content
  - Safety tips for meeting in person
  - Privacy protection guidelines

- **In-App Safety**:
  - Meet in public places recommendation
  - No private residence moments
  - Location privacy (approximate locations only)
  - Ephemeral content (messages/photos auto-delete)

### Admin Tools

- **Admin Dashboard** (`admin.html`):
  - View all flagged content
  - Quick moderation actions
  - User banning capability
  - Statistics and analytics

- **Database Functions**:
  - `is_user_blocked()` - Check block status
  - `get_flag_count()` - Count flags on content
  - Row-level security policies enforce blocks

---

## 📋 Files Added/Modified for Compliance

### New Files Created

1. **Database**:
   - `supabase/migrations/005_add_blocking.sql` - User blocking system

2. **Frontend Pages**:
   - `public/support.html` - Contact and support information
   - `public/guidelines.html` - Community guidelines
   - `public/settings.html` - Settings and blocked users management
   - `public/admin.html` - Admin moderation dashboard

3. **JavaScript**:
   - `public/js/settings.js` - Settings page logic
   - `public/js/admin.js` - Admin dashboard logic

4. **Edge Functions**:
   - `supabase/functions/moderate-message/index.ts` - Message filtering
   - `supabase/functions/moderate-image/index.ts` - Image moderation framework

### Modified Files

1. **Frontend**:
   - `public/chat.html` - Added block user modal
   - `public/chat.js` - Block user functionality
   - `public/moment.html` - Added support footer
   - `public/index.html` - Added support button
   - `public/styles.css` - Styles for new features

2. **Database**:
   - Updated RLS policies to respect user blocks
   - Enhanced message/participant filtering

---

## 🚀 Deployment Instructions

### 1. Database Setup

Run the blocking migration:
```sql
-- In Supabase SQL Editor
-- Run: supabase/migrations/005_add_blocking.sql
```

### 2. Deploy Edge Functions

```bash
supabase functions deploy moderate-message
supabase functions deploy moderate-image
```

### 3. Configure Environment Variables

For production image moderation, add API keys:
```bash
# AWS Rekognition (recommended)
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret

# OR Google Vision API
GOOGLE_VISION_API_KEY=your_key

# OR Sightengine
SIGHTENGINE_USER=your_user
SIGHTENGINE_SECRET=your_secret
```

### 4. Update Contact Email

Replace `support@moments-app.com` with your actual support email in:
- `public/support.html`
- `public/guidelines.html`

### 5. Create First Admin

```sql
-- In Supabase SQL Editor
INSERT INTO user_roles (user_id, role)
VALUES ('YOUR-USER-UUID', 'admin');
```

---

## 📝 App Store Submission Notes

When submitting to Apple App Store, include in **App Review Notes**:

### Demo Account

Provide admin credentials:
- **Email**: admin@moments-app.com
- **Password**: [Your demo password]

### Moderation System

Explain the multi-layer approach:
1. Automated keyword filtering on all content
2. User reporting with flag buttons on moments and messages
3. Auto-hide at 3 reports
4. Admin dashboard for human review within 24 hours
5. User blocking system

### Contact Information

- **Support Email**: support@moments-app.com
- **Response Time**: 24-48 hours
- **Emergency**: Users directed to local authorities (911, 999, 112)

### Safety Features

- Community Guidelines clearly displayed
- Block user feature in all chats
- Meet in public places recommendations
- No private residence locations
- Ephemeral content (auto-deletes)

### Testing Instructions

1. **Test Reporting**:
   - Create a moment with inappropriate title → Gets auto-hidden
   - Send a message with profanity → Gets auto-deleted
   - Flag content 3 times → Auto-hides

2. **Test Blocking**:
   - Block a user from chat
   - Verify blocked user's messages are hidden
   - Verify cannot join same moment

3. **Test Admin Dashboard**:
   - Login with admin account
   - Go to `/admin.html`
   - View flagged content
   - Take moderation actions

---

## 🔄 Ongoing Compliance

### Regular Monitoring

- Check admin dashboard daily
- Respond to support emails within 24-48 hours
- Update banned words list as needed
- Review and update Community Guidelines quarterly

### Updates

- Keep profanity filter updated
- Monitor for new spam patterns
- Adjust auto-hide threshold if needed
- Enhance image moderation with ML models

### Reporting

- Track moderation metrics
- Document response times
- Log major incidents
- Maintain appeals process

---

## ✅ Compliance Confirmed

All four requirements of Apple App Store Guideline 1.2 are fully implemented:

1. ✅ **Content Filtering**: Automated + manual moderation
2. ✅ **Reporting Mechanism**: Flag buttons + admin dashboard
3. ✅ **User Blocking**: Full blocking system with management UI
4. ✅ **Contact Information**: Support page + email on all pages

**Status**: Ready for App Store submission

**Last Updated**: February 2026
