import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zqpdbmqneebjsytgkodl.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const HAS_ANON_KEY = !!SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.trim().length > 0;

// Detect if running in Electron (desktop) vs web browser
const isElectron = (): boolean => {
  if (typeof window === 'undefined') return false;
  const win = window as any;
  return !!(win.electron && typeof win.electron === 'object');
};

// Custom fetch that routes through proxy on web, direct on Electron
const proxyFetch = async (url: string, options?: RequestInit): Promise<Response> => {
  // Electron/desktop: use native fetch (no CORS with Node environment)
  if (isElectron()) {
    console.log('[Supabase] Direct fetch (Electron)');
    return fetch(url, options);
  }

  // Web: route through /api/supabase-proxy to avoid CORS
  console.log('[Supabase] Proxy fetch (Web)');
  
  try {
    const supabaseUrl = 'https://zqpdbmqneebjsytgkodl.supabase.co';
    const path = url.replace(`${supabaseUrl}/rest/v1`, '');
    
    // Parse request body if it exists (for POST/PATCH/PUT)
    let parsedBody: any = undefined;
    if (options?.body && typeof options.body === 'string') {
      try {
        parsedBody = JSON.parse(options.body);
      } catch {
        parsedBody = options.body; // If not JSON, pass as-is
      }
    }

    const res = await fetch('/api/supabase-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: options?.method || 'GET',
        path,
        body: parsedBody,
        headers: options?.headers as Record<string, string> || {}
      })
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ 
        error: 'Proxy request failed',
        status: res.status 
      }));
      console.error('[Supabase] Proxy error:', error);
      throw new Error(error.error || `Proxy error: ${res.status}`);
    }

    const data = await res.json();
    
    // Return a proper Response object that Supabase client expects
    return new Response(JSON.stringify(data), {
      status: 200,
      statusText: 'OK',
      headers: { 
        'Content-Type': 'application/json',
        'Content-Length': String(JSON.stringify(data).length)
      }
    });
    
  } catch (err: any) {
    console.error('[Supabase] proxyFetch error:', err);
    // Return error as failed Response
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Main client: uses proxy on web (for mutations), direct on Electron
export const supabase = createClient(SUPABASE_URL, HAS_ANON_KEY ? SUPABASE_ANON_KEY : undefined as any, {
  global: {
    fetch: proxyFetch as any
  }
});

// Direct client: bypasses proxy (use for large reads like booklets)
// If anon key missing (web), fall back to proxy-backed client to avoid 401s.
export const supabaseDirect = HAS_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : supabase;

// If anon key is missing in this environment, create a lightweight proxy wrapper
// that forwards REST-style requests to our server-side `/api/supabase-proxy`.
// This prevents `supabase-js` from throwing "supabaseKey is required" and
// allows the app to operate using the server proxy.
if (!HAS_ANON_KEY) {
  const proxyRequest = async (method: string, path: string, body?: any, headers?: Record<string,string>) => {
    try {
      const res = await fetch('/api/supabase-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, path, body, headers })
      });
      const text = await res.text();
      try { return { data: JSON.parse(text), status: res.status }; } catch { return { data: text, status: res.status }; }
    } catch (err: any) {
      return { error: { message: err.message || String(err) } };
    }
  };

  const makeFrom = (table: string) => {
    return {
      async select(sel: string = '*') {
        const path = `/${table}?select=${encodeURIComponent(sel)}`;
        const r = await proxyRequest('GET', path);
        return { data: Array.isArray((r as any).data) ? (r as any).data : [], error: (r as any).error };
      },
      async range(start: number, end: number) {
        // Not directly used; helpers will call select then range via supabaseDirect in normal flow.
        const path = `/${table}?select=*&offset=${start}&limit=${end - start + 1}`;
        const r = await proxyRequest('GET', path);
        return { data: (r as any).data || [], error: (r as any).error };
      },
      async upsert(payload: any, opts?: any) {
        const onConflict = opts?.onConflict || 'id';
        const path = `/${table}?on_conflict=${encodeURIComponent(onConflict)}`;
        const r = await proxyRequest('POST', path, payload, { Prefer: 'return=representation' });
        return { data: (r as any).data || null, error: (r as any).error };
      },
      async insert(payload: any, opts?: any) {
        const path = `/${table}`;
        const r = await proxyRequest('POST', path, payload, { Prefer: 'return=representation' });
        return { data: (r as any).data || null, error: (r as any).error };
      },
      async delete() {
        // minimal stub - not currently used in codepaths that require this fallback
        return { data: null, error: null };
      }
    };
  };

  // Replace exported `supabase` and `supabaseDirect` with wrapper objects that
  // expose `from(table)` compatible API used by our codebase.
  (supabase as any) = {
    from: (table: string) => makeFrom(table)
  };
  (supabaseDirect as any) = (supabase as any);
}
