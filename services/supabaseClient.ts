import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zqpdbmqneebjsytgkodl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxcGRibXFuZWVianN5dGdrb2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0OTI4NjgsImV4cCI6MjA4MzA2ODg2OH0.zS7yZxjCLhxj66cR7M0y0JYEEHhhmLnMRbUvRfcSifc';

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
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: {
    fetch: proxyFetch as any
  }
});

// Direct client: bypasses proxy (use for large reads like booklets)
// Uses anon key so it's safe for browser + RLS policies protect data
export const supabaseDirect = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
