import { createClient } from '@supabase/supabase-js';

// Read from Vite env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) with safe fallbacks.
const SUPABASE_URL = (
	(typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_SUPABASE_URL) ||
	(typeof process !== 'undefined' && (process as any).env && (process as any).env.VITE_SUPABASE_URL) ||
	'https://zqpdbmqneebjsytgkodl.supabase.co'
);

const SUPABASE_ANON_KEY = (
	(typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_SUPABASE_ANON_KEY) ||
	(typeof process !== 'undefined' && (process as any).env && (process as any).env.VITE_SUPABASE_ANON_KEY) ||
	'sb_publishable_uzntFr0d7j95V6UQBAPl8Q_Qwmy4Cup'
);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
	console.warn('Supabase config missing: falling back to defaults. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
