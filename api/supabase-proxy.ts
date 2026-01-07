// Server-side proxy for Supabase REST API to avoid CORS issues.
// Forwards requests using service role key (stored securely in Vercel env).

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://zqpdbmqneebjsytgkodl.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

interface ProxyRequest {
  method?: string;
  path: string;
  body?: any;
  headers?: Record<string, string>;
}

export default async function handler(req: any, res: any) {
  // Only allow POST requests to this endpoint
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify service role key is configured
  if (!SERVICE_ROLE) {
    console.error('[Supabase Proxy] SUPABASE_SERVICE_ROLE not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Parse and validate request body
  const { method = 'GET', path, body, headers: clientHeaders }: ProxyRequest = req.body || {};
  
  if (!path) {
    return res.status(400).json({ error: 'path is required' });
  }

  try {
    // Build full URL with path (path already includes query params from Supabase client)
    const fullPath = path.startsWith('/') ? path : '/' + path;
    const url = `${SUPABASE_URL}/rest/v1${fullPath}`;
    
    console.log(`[Supabase Proxy] ${method} ${fullPath}`);

    // Prepare headers for Supabase
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE,
      'Authorization': `Bearer ${SERVICE_ROLE}`,
      'Prefer': clientHeaders?.Prefer || 'return=representation'
    };

    // Forward additional client headers if needed
    if (clientHeaders) {
      Object.keys(clientHeaders).forEach(key => {
        if (!['Content-Type', 'apikey', 'Authorization'].includes(key)) {
          headers[key] = clientHeaders[key];
        }
      });
    }

    // Make request to Supabase
    const upstream = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    // Parse response (could be JSON or empty)
    let data: any;
    const contentType = upstream.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      data = await upstream.json().catch(() => null);
    } else {
      const text = await upstream.text();
      data = text ? { message: text } : null;
    }

    // Handle non-OK responses
    if (!upstream.ok) {
      console.error('[Supabase Proxy] Error:', upstream.status, data);
      return res.status(upstream.status).json({ 
        error: data?.message || data?.error || 'Supabase request failed', 
        details: data,
        status: upstream.status
      });
    }

    // Success - return data
    return res.status(200).json(data || {});
    
  } catch (err: any) {
    console.error('[Supabase Proxy] Exception:', err);
    return res.status(500).json({ 
      error: err?.message || 'Proxy server error',
      details: process.env.NODE_ENV === 'development' ? err?.stack : undefined
    });
  }
}
