const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/upsert_users.cjs <path-to-json>');
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), inputPath);
if (!fs.existsSync(resolvedPath)) {
  console.error(`Input file not found: ${resolvedPath}`);
  process.exit(1);
}

let payload;
try {
  const raw = fs.readFileSync(resolvedPath, 'utf8');
  payload = JSON.parse(raw);
} catch (err) {
  console.error('Failed to read or parse input JSON:', err.message);
  process.exit(1);
}

const records = Array.isArray(payload) ? payload : [payload];
if (records.length === 0) {
  console.error('No user records found in input JSON.');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zqpdbmqneebjsytgkodl.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY 
  || process.env.SUPABASE_ANON_KEY 
  || 'sb_publishable_uzntFr0d7j95V6UQBAPl8Q_Qwmy4Cup';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

(async () => {
  const normalized = records.map(r => ({
    ...r,
    email: (r.email || '').toLowerCase().trim(),
    created_at: typeof r.created_at === 'number' ? r.created_at : Date.now()
  }));

  const { data, error } = await supabase
    .from('users')
    .upsert(normalized, { onConflict: 'id' })
    .select('id,email,status,grade,role');

  if (error) {
    console.error('Upsert failed:', error.message);
    process.exit(1);
  }

  console.log(`Upserted ${data?.length || 0} user(s).`);
  console.table(data || []);
})();
