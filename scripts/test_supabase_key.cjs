const fetch = require('node-fetch');
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxcGRibXFuZWVianN5dGdrb2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0OTI4NjgsImV4cCI6MjA4MzA2ODg2OH0.YwpDLldJQ--WoATcF9l3XtgvEKVAH65iXhaLug4mAi8';

(async function run() {
  console.log('--- Test 1: Direct to Supabase (remote)');
  try {
    const res = await fetch('https://zqpdbmqneebjsytgkodl.supabase.co/rest/v1/users?select=id', {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      }
    });
    console.log('remote status', res.status);
    const text = await res.text();
    console.log('remote body (first 1000 chars):\n', text.slice(0, 1000));
  } catch (err) {
    console.error('remote error', err && err.message ? err.message : err);
  }

  console.log('\n--- Test 2: Via local proxy (http://localhost:3002)');
  try {
    const res2 = await fetch('http://localhost:3002/rest/v1/users?select=id', { method: 'GET' });
    console.log('proxy status', res2.status);
    const text2 = await res2.text();
    console.log('proxy body (first 1000 chars):\n', text2.slice(0, 1000));
  } catch (err) {
    console.error('proxy error', err && err.message ? err.message : err);
  }
})();
