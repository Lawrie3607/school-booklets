require('dotenv').config({ path: '.env.local' });
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const bodyParser = require('body-parser');

const APP_PORT = process.env.PORT || 3001;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://zqpdbmqneebjsytgkodl.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || '';
const ANON = process.env.VITE_SUPABASE_ANON_KEY || '';

const app = express();
// Manual CORS middleware to handle all origins and preflight for local dev
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  // Allow Supabase client headers (x-client-info, content-profile, accept-profile, etc.) and large payloads
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,apikey,Prefer,x-client-info,content-profile,accept-profile,accept,range');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});
// Increase payload limit to accommodate large booklet content during local sync
app.use(bodyParser.json({ limit: '200mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '200mb' }));

app.use(async (req, res, next) => {
  // Only forward Supabase REST requests; let other routes pass through
  if (!req.path.startsWith('/rest/v1')) return next();

  try {
    const url = `${SUPABASE_URL}${req.originalUrl}`; // includes /rest/v1/...
    console.log('[proxy] forwarding', req.method, url);

    const key = SERVICE_ROLE || ANON;

    // Forward original request headers to upstream so Supabase preflight headers are preserved.
    const headers = Object.assign({}, req.headers);
    // Remove host to avoid conflicts and ensure our auth keys override
    delete headers.host;
    // Ensure required auth headers for Supabase are present/overridden
    headers.apikey = key;
    headers.authorization = `Bearer ${key}`;
    headers.Prefer = req.get('Prefer') || headers.Prefer || 'return=representation';

    const options = { method: req.method, headers };
    if (!['GET', 'HEAD'].includes(req.method)) {
      options.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    }

    const upstream = await fetch(url, options);

    res.status(upstream.status);
    upstream.headers.forEach((v, k) => {
      const skip = ['content-encoding', 'transfer-encoding', 'content-length'];
      if (!skip.includes(k.toLowerCase())) res.setHeader(k, v);
    });

    const text = await upstream.text();
    try {
      const json = JSON.parse(text);
      return res.send(json);
    } catch (e) {
      return res.send(text);
    }
  } catch (err) {
    console.error('[proxy] error', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.listen(APP_PORT, () => console.log(`[proxy] Supabase proxy running on http://localhost:${APP_PORT}`));
