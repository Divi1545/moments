# Deployment Checklist - Apple 1.2 Compliance

## Pre-Deployment Checklist

### ✅ Database Setup

- [ ] Run `005_add_blocking.sql` migration in Supabase SQL Editor
- [ ] Verify `blocked_users` table exists
- [ ] Verify updated RLS policies are active
- [ ] Test blocking functionality in development

### ✅ Edge Functions

- [ ] Deploy `moderate-message` function
  ```bash
  supabase functions deploy moderate-message
  ```
- [ ] Deploy `moderate-image` function
  ```bash
  supabase functions deploy moderate-image
  ```
- [ ] Test functions with sample data
- [ ] Configure environment variables for image moderation API (optional)

### ✅ Frontend Updates

- [ ] Verify all new pages are accessible:
  - `/support.html`
  - `/guidelines.html`
  - `/settings.html`
  - `/admin.html`
- [ ] Test support links on all pages
- [ ] Test block user functionality
- [ ] Test admin dashboard with test data

### ✅ Configuration

- [ ] Update support email in:
  - `public/support.html`
  - `public/guidelines.html`
- [ ] Create first admin user:
  ```sql
  INSERT INTO user_roles (user_id, role)
  VALUES ('YOUR-USER-UUID', 'admin');
  ```
- [ ] Test admin access to dashboard

### ✅ Content Moderation

- [ ] Review and update banned words list in `moderate-message/index.ts`
- [ ] Test automated filtering with sample inappropriate content
- [ ] Verify auto-hide works at 3 flags
- [ ] Test admin moderation actions

### ✅ Documentation

- [ ] Review `APPLE_COMPLIANCE.md`
- [ ] Prepare App Store submission notes
- [ ] Create demo admin account for Apple reviewers
- [ ] Document response time commitments

---

## Testing Checklist

### User Blocking

- [ ] Block a user from chat
- [ ] Verify blocked user's messages are hidden
- [ ] Verify cannot join same moment as blocked user
- [ ] Unblock user from settings
- [ ] Verify unblock works correctly

### Content Reporting

- [ ] Flag a moment - verify flag is recorded
- [ ] Flag a message - verify flag is recorded
- [ ] Flag same content 3 times - verify auto-hide
- [ ] View flagged content in admin dashboard

### Content Filtering

- [ ] Create moment with banned keyword - verify auto-hide
- [ ] Send message with profanity - verify auto-delete
- [ ] Upload image (test framework is ready)

### Admin Dashboard

- [ ] Login as admin
- [ ] Access `/admin.html`
- [ ] View flagged content list
- [ ] Hide a moment
- [ ] Delete a message
- [ ] Dismiss flags
- [ ] Ban a user (test account only!)

### Support & Guidelines

- [ ] Access support page from all pages
- [ ] Verify email is correct and working
- [ ] Read through community guidelines
- [ ] Test all links in support page

---

## App Store Submission

### Required Information

**App Review Notes**:
```
CONTENT MODERATION SYSTEM:

1. Automated Filtering:
   - All moment titles and messages are filtered for inappropriate content
   - Banned keywords, profanity, spam patterns are blocked
   - Content is automatically deleted or hidden

2. User Reporting:
   - Flag button (🚩) on all moments and messages
   - Content auto-hides after 3 reports
   - Admin dashboard for human review within 24 hours

3. User Blocking:
   - Users can block others from chat
   - Blocked users cannot interact or join same moments
   - Manage blocked users in Settings

4. Contact Information:
   - Support email: support@moments-app.com
   - Response time: 24-48 hours
   - Support page accessible from all screens

DEMO ADMIN ACCOUNT:
Email: [Your demo admin email]
Password: [Your demo password]

To test moderation:
1. Go to /admin.html after login
2. View flagged content
3. Test moderation actions

SAFETY FEATURES:
- Community Guidelines at /guidelines.html
- Meet in public places recommendations
- Ephemeral content (auto-deletes)
- No private residence locations
```

### Screenshots to Include

1. Support page showing contact email
2. Community Guidelines page
3. Block user button in chat
4. Flag/report button on content
5. Admin dashboard (if comfortable sharing)
6. Settings page with blocked users

### Questions to Expect

**Q: How do you moderate user-generated content?**
A: Multi-layer approach: (1) Automated keyword filtering, (2) User reporting with auto-hide at 3 flags, (3) Admin dashboard for 24-hour human review, (4) User blocking system.

**Q: How quickly do you respond to reports?**
A: Automated response is immediate (auto-hide at 3 flags). Human review via admin dashboard within 24 hours. Support emails answered within 24-48 hours.

**Q: How can users block abusive users?**
A: "Block User" button appears below every message in chat. Users can manage blocked users in Settings. Blocking prevents all interaction including joining same moments.

**Q: Where is your contact information?**
A: Support email (support@moments-app.com) is displayed on: Support page (linked in footer of all pages), Community Guidelines, and mentioned in report modals. Response time commitment is 24-48 hours.

---

## Post-Approval Monitoring

### Daily Tasks

- [ ] Check admin dashboard for flagged content
- [ ] Respond to support emails
- [ ] Review moderation logs

### Weekly Tasks

- [ ] Review moderation statistics
- [ ] Update banned words if needed
- [ ] Check for spam patterns
- [ ] Review user feedback

### Monthly Tasks

- [ ] Analyze moderation trends
- [ ] Update Community Guidelines if needed
- [ ] Review and improve filters
- [ ] Train additional moderators if needed

---

## Emergency Response

### Severe Violations

If you discover:
- Illegal content (CSAM, terrorism, etc.)
- Credible threats of violence
- Human trafficking

**Immediate Actions**:
1. Delete content immediately via admin dashboard
2. Ban user permanently
3. Report to NCMEC (US) or appropriate authority
4. Document incident
5. Preserve evidence if requested by law enforcement

### Contact Authorities

- **US**: NCMEC CyberTipline (cybertipline.org)
- **EU**: INHOPE (inhope.org)
- **UK**: IWF (iwf.org.uk)

---

## Compliance Maintenance

### Keep Updated

- [ ] Monitor Apple App Store guidelines for changes
- [ ] Update moderation systems as needed
- [ ] Maintain response time commitments
- [ ] Keep contact information current
- [ ] Regular security audits

### Documentation

- [ ] Keep this checklist updated
- [ ] Document all major moderation actions
- [ ] Maintain incident response logs
- [ ] Track compliance metrics

---

**Status**: Ready for deployment ✅

**Last Updated**: February 2026
