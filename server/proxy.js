const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const bodyParser = require('body-parser');

const APP_PORT = process.env.PORT || 3001;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zqpdbmqneebjsytgkodl.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || '';
const ANON = process.env.VITE_SUPABASE_ANON_KEY || '';

const app = express();
app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] }));
app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

app.all('/rest/v1/*', async (req, res) => {
  try {
    const url = `${SUPABASE_URL}${req.originalUrl}`; // includes /rest/v1/...
    console.log('[proxy] forwarding', req.method, url);

    const key = SERVICE_ROLE || ANON;
    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: req.get('Prefer') || 'return=representation'
    };
    if (req.get('content-type')) headers['content-type'] = req.get('content-type');

    const options = { method: req.method, headers };
    if (!['GET', 'HEAD'].includes(req.method)) {
      // forward parsed body as JSON; if body is already a string, send as-is
      options.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    }

    const upstream = await fetch(url, options);

    // copy status and most headers, but let CORS be handled by express
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
