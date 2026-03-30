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

// Inject environment variables into HTML
app.use((req, res, next) => {
  // Handle HTML requests
  if (req.path.endsWith('.html') || req.path === '/' || req.path.match(/^\/[^.]+$/)) {
    let htmlPath = req.path === '/' ? '/index.html' : req.path;
    
    // Add .html extension if missing
    if (!htmlPath.endsWith('.html')) {
      htmlPath += '.html';
    }
    
    const filePath = path.join(__dirname, 'public', htmlPath);
    
    console.log('Trying to read:', filePath);
    console.log('Environment check:', {
      SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'MISSING',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'SET' : 'MISSING'
    });
    
    // Check if file exists first
    if (!fs.existsSync(filePath)) {
      console.log('File not found:', filePath);
      return next();
    }
    
    fs.readFile(filePath, 'utf8', (err, html) => {
      if (err) {
        console.error('Error reading file:', err);
        return next();
      }
      
      // Inject environment variables as window.ENV
      const envScript = `
        <script>
          window.ENV = {
            SUPABASE_URL: '${process.env.SUPABASE_URL || ''}',
            SUPABASE_ANON_KEY: '${process.env.SUPABASE_ANON_KEY || ''}',
            MAPBOX_TOKEN: '${process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''}'
          };
          console.log('✅ Environment variables injected by server');
          console.log('Supabase URL:', window.ENV.SUPABASE_URL || 'MISSING');
          console.log('Supabase Key:', window.ENV.SUPABASE_ANON_KEY ? 'Set (' + window.ENV.SUPABASE_ANON_KEY.substring(0, 20) + '...)' : 'MISSING');
          console.log('Mapbox Token:', window.ENV.MAPBOX_TOKEN ? 'Set' : 'MISSING');
        </script>
      `;
      
      const modifiedHtml = html.replace('</head>', envScript + '</head>');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(modifiedHtml);
    });
  } else {
    next();
  }
});

// Debug endpoint to check environment variables (remove in production)
app.get('/api/env-check', (req, res) => {
  res.json({
    supabaseUrlSet: !!process.env.SUPABASE_URL,
    supabaseKeySet: !!process.env.SUPABASE_ANON_KEY,
    mapboxTokenSet: !!process.env.MAPBOX_TOKEN,
    nodeEnv: process.env.NODE_ENV || 'development',
    // Don't expose actual values for security
    supabaseUrlPreview: process.env.SUPABASE_URL ? process.env.SUPABASE_URL.substring(0, 20) + '...' : 'NOT SET',
  });
});

// Serve static files from 'public' directory
app.use(express.static('public'));

// Port from Replit or default to 5000
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Moments MVP running on port ${PORT}`);
  console.log(`🌐 Local: http://localhost:${PORT}`);
  
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    console.log(`📱 Replit URL: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
  }
  
  // Check if environment variables are set
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.MAPBOX_TOKEN) {
    console.warn('⚠️  WARNING: Environment variables not set!');
    console.warn('Add these in Replit Secrets:');
    console.warn('  - SUPABASE_URL');
    console.warn('  - SUPABASE_ANON_KEY');
    console.warn('  - MAPBOX_TOKEN');
  } else {
    console.log('✅ Environment variables loaded');
  }
});

