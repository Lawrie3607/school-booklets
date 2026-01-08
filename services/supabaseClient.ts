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
export let supabase: any;
export let supabaseDirect: any;

if (HAS_ANON_KEY) {
  // Normal case: create Supabase clients that use the ANON key directly in the browser.
  // This avoids routing every request through the Vercel proxy which can trigger
  // platform bot/WAF pages. The `proxyFetch` remains available for environments
  // that explicitly need it.
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  supabaseDirect = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  // No anon key available in this environment (preview). Provide a minimal
  // wrapper compatible with our usage: expose `.from(table)` with select/upsert/range
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
      select(sel: string = '*') {
        return {
          async range(start: number, end: number) {
            const path = `/${table}?select=${encodeURIComponent(sel)}&offset=${start}&limit=${end - start + 1}`;
            const r = await proxyRequest('GET', path);
            return { data: (r as any).data || [], error: (r as any).error };
          },
          // also support calling without range: await .select().then? Provide a `then` to make it awaitable
          then: async (onfulfilled: any, onrejected?: any) => {
            const r = await proxyRequest('GET', `/${table}?select=${encodeURIComponent(sel)}`);
            const result = { data: (r as any).data || [], error: (r as any).error };
            return onfulfilled ? onfulfilled(result) : result;
          }
        };
      },
      range(start: number, end: number) {
        // allow direct .from(table).range(...) usage
        return (async () => {
          const path = `/${table}?select=*&offset=${start}&limit=${end - start + 1}`;
          const r = await proxyRequest('GET', path);
          return { data: (r as any).data || [], error: (r as any).error };
        })();
      },
      upsert(payload: any, opts?: any) {
        const onConflict = opts?.onConflict || 'id';
        return {
          async select(sel: string = '*') {
            const path = `/${table}?on_conflict=${encodeURIComponent(onConflict)}`;
            const r = await proxyRequest('POST', path, payload, { Prefer: 'return=representation' });
            // mimic supabase-js response shape
            return { data: (r as any).data || null, error: (r as any).error };
          }
        };
      },
      insert(payload: any, opts?: any) {
        return {
          async select(sel: string = '*') {
            const path = `/${table}`;
            const r = await proxyRequest('POST', path, payload, { Prefer: 'return=representation' });
            return { data: (r as any).data || null, error: (r as any).error };
          }
        };
      },
      async delete() { return { data: null, error: null }; }
    };
  };

  supabase = { from: (table: string) => makeFrom(table) };
  supabaseDirect = supabase;
}

// NOTE: The chainable proxy wrapper for no-anon-key environments is defined
// earlier in the file (inside the `else` branch when `HAS_ANON_KEY` is false).
// We intentionally avoid redefining it here to preserve the chainable API
// shape (`.from(...).select(...).range()` and `.from(...).upsert(...).select()`).
