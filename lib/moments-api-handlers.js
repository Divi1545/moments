/**
 * IslandLoaf Stay — public API handlers (service role; CORS applied in server.js)
 */
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const ALLOWED_ORIGINS = new Set(['https://islandloafstay.com', 'https://www.islandloafstay.com']);

function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  const origin = req.get('Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
}

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function publicSiteBase() {
  const raw = (process.env.PUBLIC_SITE_URL || 'https://www.momentsbyislandloaf.com').trim().replace(/\/$/, '');
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseInterests(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : null;
}

async function getNearby(req, res) {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = req.query.radius != null ? parseFloat(req.query.radius) : 20;
    const limit = req.query.limit != null ? parseInt(req.query.limit, 10) : 5;
    const interests = parseInterests(req.query.interests || '');

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: 'Invalid or missing lat/lng' });
    }
    if (!Number.isFinite(radius) || radius <= 0 || radius > 500) {
      return res.status(400).json({ error: 'Invalid radius (km), use 0 < radius <= 500' });
    }
    if (!Number.isFinite(limit) || limit < 1 || limit > 50) {
      return res.status(400).json({ error: 'Invalid limit (1–50)' });
    }

    const supabase = getServiceClient();
    const interestArray = interests && interests.length ? interests : null;

    const { data: rows, error } = await supabase.rpc('api_nearby_moments', {
      p_lat: lat,
      p_lng: lng,
      p_radius_km: radius,
      p_interests: interestArray,
      p_limit: limit,
    });

    if (error) {
      console.error('api_nearby_moments', error);
      return res.status(500).json({ error: 'Database error', detail: error.message });
    }

    const moments = (rows || []).map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description ?? '',
      category: r.category ?? '',
      tags: r.tags || [],
      start_time: r.start_time,
      location_name: r.location_name ?? '',
      lat: r.lat != null ? Number(r.lat) : null,
      lng: r.lng != null ? Number(r.lng) : null,
      distance_km: r.distance_km != null ? Math.round(r.distance_km * 100) / 100 : null,
      spots_left: Math.max(0, (r.max_participants || 0) - Number(r.participant_count || 0)),
      max_participants: r.max_participants,
      host_name: r.host_name ?? '',
      photo_url: r.photo_url ?? null,
    }));

    return res.status(200).json({ moments });
  } catch (e) {
    console.error(e);
    if (e.message && e.message.includes('Missing SUPABASE')) {
      return res.status(500).json({ error: 'Server not configured' });
    }
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function postJoin(req, res) {
  try {
    const momentId = req.params.id;
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!momentId || !uuidRe.test(momentId)) {
      return res.status(400).json({ error: 'Invalid moment id' });
    }

    const email = (req.body && req.body.email != null ? String(req.body.email) : '').trim();
    const name = (req.body && req.body.name != null ? String(req.body.name) : '').trim();

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!name || name.length < 1 || name.length > 80) {
      return res.status(400).json({ error: 'Name must be 1–80 characters' });
    }

    const supabase = getServiceClient();

    const { data: moment, error: mErr } = await supabase
      .from('moments')
      .select('id, title, starts_at, ends_at, status, max_participants, location_name')
      .eq('id', momentId)
      .maybeSingle();

    if (mErr || !moment) {
      return res.status(404).json({ error: 'Moment not found' });
    }

    const now = new Date();
    if (moment.status !== 'active' || new Date(moment.ends_at) <= now) {
      return res.status(400).json({ error: 'Moment is not open for joins' });
    }

    const { count: pc, error: cErr } = await supabase
      .from('moment_participants')
      .select('*', { count: 'exact', head: true })
      .eq('moment_id', momentId);

    if (cErr) {
      console.error(cErr);
      return res.status(500).json({ error: 'Could not check capacity' });
    }

    if ((pc || 0) >= moment.max_participants) {
      return res.status(409).json({ error: 'Moment is full' });
    }

    const guest_token = crypto.randomUUID();
    const { data: existing } = await supabase
      .from('moment_guest_participants')
      .select('id, guest_token')
      .eq('moment_id', momentId)
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existing) {
      const base = publicSiteBase();
      return res.status(200).json({
        success: true,
        joinLink: `${base}/moment.html?id=${momentId}&guest=${encodeURIComponent(existing.guest_token)}&open=chat`,
        moment_title: moment.title,
        start_time: moment.starts_at,
        location_name: moment.location_name || '',
        reused: true,
      });
    }

    const { error: insErr } = await supabase.from('moment_guest_participants').insert({
      moment_id: momentId,
      email: email.toLowerCase(),
      display_name: name,
      guest_token,
    });

    if (insErr) {
      if (insErr.code === '23505') {
        return res.status(409).json({ error: 'Already joined with this email' });
      }
      console.error(insErr);
      return res.status(500).json({ error: 'Could not create guest participant' });
    }

    const base = publicSiteBase();
    return res.status(200).json({
      success: true,
      joinLink: `${base}/moment.html?id=${momentId}&guest=${encodeURIComponent(guest_token)}&open=chat`,
      moment_title: moment.title,
      start_time: moment.starts_at,
      location_name: moment.location_name || '',
    });
  } catch (e) {
    console.error(e);
    if (e.message && e.message.includes('Missing SUPABASE')) {
      return res.status(500).json({ error: 'Server not configured' });
    }
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function getGuestVerify(req, res) {
  try {
    const token = req.query.token != null ? String(req.query.token).trim() : '';
    if (!token) {
      return res.status(400).json({ error: 'token required' });
    }

    const supabase = getServiceClient();
    const { data: row, error } = await supabase
      .from('moment_guest_participants')
      .select('guest_token, display_name, moment_id')
      .eq('guest_token', token)
      .maybeSingle();

    if (error || !row) {
      return res.status(404).json({ valid: false, error: 'Invalid or expired guest link' });
    }

    const { data: m, error: mErr } = await supabase
      .from('moments')
      .select('id, title, starts_at, ends_at, status')
      .eq('id', row.moment_id)
      .maybeSingle();

    if (mErr || !m) {
      return res.status(404).json({ valid: false, error: 'Moment not found' });
    }

    const now = new Date();
    if (m.status !== 'active' || new Date(m.ends_at) <= now) {
      return res.status(400).json({ valid: false, error: 'Moment is no longer active' });
    }

    return res.status(200).json({
      valid: true,
      moment_id: m.id,
      display_name: row.display_name,
      moment_title: m.title,
      start_time: m.starts_at,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function getGuestMessages(req, res) {
  try {
    const momentId = req.query.momentId != null ? String(req.query.momentId).trim() : '';
    const token = req.query.token != null ? String(req.query.token).trim() : '';
    if (!momentId || !token) {
      return res.status(400).json({ error: 'momentId and token required' });
    }

    const supabase = getServiceClient();
    const { data: gp, error: gErr } = await supabase
      .from('moment_guest_participants')
      .select('id, display_name')
      .eq('moment_id', momentId)
      .eq('guest_token', token)
      .maybeSingle();

    if (gErr || !gp) {
      return res.status(403).json({ error: 'Invalid guest token' });
    }

    const { data: msgs, error: mErr } = await supabase
      .from('guest_chat_messages')
      .select('id, content, created_at, guest_participant_id')
      .eq('moment_id', momentId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (mErr) {
      console.error(mErr);
      return res.status(500).json({ error: 'Could not load messages' });
    }

    const { data: names } = await supabase
      .from('moment_guest_participants')
      .select('id, display_name')
      .eq('moment_id', momentId);

    const nameMap = {};
    (names || []).forEach((n) => {
      nameMap[n.id] = n.display_name;
    });

    const messages = (msgs || []).map((msg) => ({
      id: msg.id,
      content: msg.content,
      created_at: msg.created_at,
      sender_name: nameMap[msg.guest_participant_id] || 'Guest',
      is_own: msg.guest_participant_id === gp.id,
    }));

    return res.status(200).json({ messages });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function postGuestMessage(req, res) {
  try {
    const momentId = req.body && req.body.momentId != null ? String(req.body.momentId).trim() : '';
    const token = req.body && req.body.token != null ? String(req.body.token).trim() : '';
    const content = req.body && req.body.content != null ? String(req.body.content).trim() : '';

    if (!momentId || !token) {
      return res.status(400).json({ error: 'momentId and token required' });
    }
    if (!content || content.length > 500) {
      return res.status(400).json({ error: 'Message must be 1–500 characters' });
    }

    const supabase = getServiceClient();

    const { data: moment } = await supabase
      .from('moments')
      .select('id, ends_at, status')
      .eq('id', momentId)
      .maybeSingle();

    if (!moment || moment.status !== 'active' || new Date(moment.ends_at) <= new Date()) {
      return res.status(400).json({ error: 'Moment is closed' });
    }

    const { data: gp, error: gErr } = await supabase
      .from('moment_guest_participants')
      .select('id')
      .eq('moment_id', momentId)
      .eq('guest_token', token)
      .maybeSingle();

    if (gErr || !gp) {
      return res.status(403).json({ error: 'Invalid guest token' });
    }

    const { error: insErr } = await supabase.from('guest_chat_messages').insert({
      moment_id: momentId,
      guest_participant_id: gp.id,
      content,
    });

    if (insErr) {
      console.error(insErr);
      return res.status(500).json({ error: 'Could not send message' });
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal error' });
  }
}

module.exports = {
  applyCors,
  getNearby,
  postJoin,
  getGuestVerify,
  getGuestMessages,
  postGuestMessage,
};
