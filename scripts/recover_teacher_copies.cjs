#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE || '';

if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL (set SUPABASE_URL or VITE_SUPABASE_URL in env)');
  process.exit(1);
}

if (!SERVICE_ROLE) {
  console.error('Missing SUPABASE_SERVICE_ROLE. Provide a service-role key in env to run the recovery.');
  console.error('For a dry-run you may pass --dry-run to only print intended actions.');
}

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run') || argv.includes('-n');
const APPLY = argv.includes('--apply');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function main() {
  console.log('Recovery script started', { SUPABASE_URL, dryRun: DRY_RUN, apply: APPLY });

  // 1) Find published reading-only booklets
  const { data: published, error: pubErr } = await supabase
    .from('booklets')
    .select('*')
    .eq('is_published', true)
    .eq('type', 'Reading Material Only');

  if (pubErr) {
    console.error('Failed to fetch published booklets:', pubErr);
    process.exit(1);
  }

  console.log('Found published reading-only booklets:', (published || []).length);

  let created = 0;
  for (const b of (published || [])) {
    const baseTopic = (b.topic || '').toString().replace(/\s*\(Published\)\s*$/i, '').trim() || b.topic || '';

    // Check if a WITH_SOLUTIONS exists with same grade/subject/topic
    const { data: existing, error: existErr } = await supabase
      .from('booklets')
      .select('id')
      .eq('grade', b.grade || '')
      .eq('subject', b.subject || '')
      .eq('topic', baseTopic)
      .eq('type', 'With Solutions')
      .limit(1)
      .maybeSingle();

    if (existErr) {
      console.warn('Error checking existing solutions for', b.id, existErr.message || existErr);
      continue;
    }

    if (existing) {
      console.log('Skipping (solutions exists):', b.id, baseTopic);
      continue;
    }

    console.log('Will create teacher copy for published booklet:', b.id, baseTopic || b.topic);

    const newId = require('crypto').randomUUID();
    const now = Date.now();
    const newBooklet = {
      id: newId,
      related_booklet_id: b.id,
      title: b.title ? `${b.title} (Recovered)` : (b.title || 'Recovered Booklet'),
      subject: b.subject,
      grade: b.grade,
      topic: baseTopic || b.topic,
      compiler: 'AUTO-RECOVER',
      type: 'With Solutions',
      is_published: false,
      created_at: now,
      updated_at: now,
      questions: Array.isArray(b.questions) ? b.questions.map(q => ({ ...q, id: require('crypto').randomUUID(), createdAt: now, updatedAt: now })) : []
    };

    if (DRY_RUN && !APPLY) {
      console.log('DRY-RUN: would upsert:', { id: newBooklet.id, title: newBooklet.title, topic: newBooklet.topic, questions: newBooklet.questions.length });
      continue;
    }

    try {
      const { data: upserted, error: upErr } = await supabase.from('booklets').upsert(newBooklet, { onConflict: 'id' }).select('id');
      if (upErr) {
        console.error('Upsert failed for', b.id, upErr);
      } else {
        created++;
        console.log('Created recovered booklet id=', newBooklet.id, 'from published', b.id);
      }
    } catch (e) {
      console.error('Exception upserting recovered booklet for', b.id, e);
    }
  }

  console.log('Recovery complete. created=', created);
}

main().catch(e => { console.error('Fatal', e); process.exit(1); });
