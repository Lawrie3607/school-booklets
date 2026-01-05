import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zqpdbmqneebjsytgkodl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_uzntFr0d7j95V6UQBAPl8Q_Qwmy4Cup';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
