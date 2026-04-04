// Simple Express server for Replit deployment
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Android WebView compatibility headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Browser env (used on Vercel where static HTML does not get Express injection)
function serveBrowserEnv(req, res) {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    MAPBOX_TOKEN: process.env.MAPBOX_TOKEN || '',
    PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || '',
  };
  res.status(200).send(`window.ENV=${JSON.stringify(env)};`);
}
app.get('/api/env', serveBrowserEnv);
app.get('/api/env.js', serveBrowserEnv);

// IslandLoaf Stay — public JSON API (requires SUPABASE_SERVICE_ROLE_KEY on server)
const apiHandlers = require('./lib/moments-api-handlers');
app.use(express.json({ limit: '48kb' }));

app.use('/api/moments', (req, res, next) => {
  apiHandlers.applyCors(req, res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/moments/nearby', apiHandlers.getNearby);
app.post('/api/moments/:id/join', apiHandlers.postJoin);
app.get('/api/moments/guest/verify', apiHandlers.getGuestVerify);
app.get('/api/moments/guest/messages', apiHandlers.getGuestMessages);
app.post('/api/moments/guest/messages', apiHandlers.postGuestMessage);

// Inject environment variables into HTML
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    const filePath = req.path === '/' ? 
      path.join(__dirname, 'public', 'index.html') : 
      path.join(__dirname, 'public', req.path);
    
    fs.readFile(filePath, 'utf8', (err, html) => {
      if (err) {
        return next();
      }
      
      // Inject environment variables as window.ENV
      const envScript = `
        <script>
          window.ENV = {
            SUPABASE_URL: '${process.env.SUPABASE_URL || ''}',
            SUPABASE_ANON_KEY: '${process.env.SUPABASE_ANON_KEY || ''}',
            MAPBOX_TOKEN: '${process.env.MAPBOX_TOKEN || ''}',
            PUBLIC_SITE_URL: '${process.env.PUBLIC_SITE_URL || ''}'
          };
        </script>
      `;
      
      const modifiedHtml = html.replace('</head>', envScript + '</head>');
      res.send(modifiedHtml);
    });
  } else {
    next();
  }
});

// Serve static files from 'public' directory
app.use(express.static('public'));

const PORT = process.env.PORT || 5000;

function logStartup() {
  console.log(`✅ Moments MVP running on port ${PORT}`);
  console.log(`🌐 Local: http://localhost:${PORT}`);

  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    console.log(`📱 Replit URL: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.MAPBOX_TOKEN) {
    console.warn('⚠️  WARNING: Environment variables not set!');
    console.warn('Add these in Replit Secrets / Vercel env:');
    console.warn('  - SUPABASE_URL');
    console.warn('  - SUPABASE_ANON_KEY');
    console.warn('  - MAPBOX_TOKEN');
  } else {
    console.log('✅ Environment variables loaded');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('⚠️  SUPABASE_SERVICE_ROLE_KEY not set — IslandLoaf /api/moments/* will fail');
  }
}

// Vercel invokes `api/index.js` (no listen). Local/dev runs this file directly.
module.exports = app;

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', logStartup);
}
