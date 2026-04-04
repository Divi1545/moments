/**
 * Vercel serverless: exposes public env to the browser as window.ENV.
 * Static HTML is not processed by Express on Vercel, so pages load this first.
 */
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    MAPBOX_TOKEN: process.env.MAPBOX_TOKEN || '',
    PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || '',
  };
  res.status(200).send(`window.ENV=${JSON.stringify(env)};`);
};
