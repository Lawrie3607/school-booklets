#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !KEY) {
  console.error('Missing SUPABASE_URL or key in environment (.env.local).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

async function run() {
  try {
    // Query for recovered booklets created recently
    const filter = `compiler.eq.AUTO-RECOVER,or(title.ilike.%25(Recovered)%25)`;
    // Use explicit OR by chaining two filters via supabase or() is easier
    const { data, error } = await supabase
      .from('booklets')
      .select('id,title,topic,compiler,created_at,updated_at')
      .or('compiler.eq.AUTO-RECOVER,title.ilike.%25(Recovered)%25')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Supabase query error:', error);
      process.exit(1);
    }

    console.log(`Found ${data.length} recovered booklets (showing up to 200):`);
    for (const b of data) {
      console.log(`${b.id} | ${b.title} | topic:${b.topic || ''} | compiler:${b.compiler || ''} | created:${b.created_at}`);
    }
  } catch (e) {
    console.error('Error querying Supabase:', e);
    process.exit(1);
  }
}

run();
