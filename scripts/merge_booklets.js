import fs from 'fs';
import path from 'path';

const urls = [
  'https://raw.githubusercontent.com/Lawrie3607/booklet_library_backup_2025-12-31/refs/heads/main/1.json',
  'https://raw.githubusercontent.com/Lawrie3607/booklet_library_backup_2025-12-31/refs/heads/main/2.json',
  'https://raw.githubusercontent.com/Lawrie3607/booklet_library_backup_2025-12-31/refs/heads/main/3.json',
  'https://raw.githubusercontent.com/Lawrie3607/booklet_library_backup_2025-12-31/refs/heads/main/4.json',
  'https://raw.githubusercontent.com/Lawrie3607/booklet_library_backup_2025-12-31/refs/heads/main/5.json',
  'https://raw.githubusercontent.com/Lawrie3607/booklet_library_backup_2025-12-31/refs/heads/main/6.json',
  'https://raw.githubusercontent.com/Lawrie3607/booklet_library_backup_2025-12-31/refs/heads/main/7.json',
  'https://raw.githubusercontent.com/Lawrie3607/booklet_library_backup_2025-12-31/refs/heads/main/8.json'
];

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function tryParseJSON(text) {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    // err.pos may not exist; try to find numeric position in message
    const posMatch = message.match(/at position (\d+)/i) || message.match(/position (\d+)/i);
    const pos = posMatch ? parseInt(posMatch[1], 10) : null;
    const start = pos ? Math.max(0, pos - 80) : 0;
    const end = pos ? pos + 80 : Math.min(text.length, 200);
    return { ok: false, error: message, snippet: text.slice(start, end), pos };
  }
}

export default async function mergeAndWrite() {
  console.log('Downloading', urls.length, 'files...');
  const parts = [];

  // Fetch raw text fragments and concatenate them in order
  const texts = [];
  for (const url of urls) {
    try {
      console.log('Fetching', url);
      const text = await fetchText(url);
      texts.push(text);
    } catch (e) {
      console.error('Fetch error for', url, e.message || e);
      process.exit(3);
    }
  }

  // Many chunked JSON exports are each a partial array like '[ {...}, {...} ]'.
  // Normalize by stripping leading `[` and trailing `]` from each chunk, then
  // join with commas and wrap in a single array before parsing.
  const stripped = texts.map(t => t.trim()).map(t => t.replace(/^\s*\[/, '').replace(/\]\s*$/, '')).filter(Boolean);
  const mergedText = '[' + stripped.join(',') + ']';
  console.log('Attempting to parse concatenated JSON (total bytes):', mergedText.length);
  const parsedAll = tryParseJSON(mergedText);
  if (!parsedAll.ok) {
    console.error('Combined JSON parse error:', parsedAll.error || 'unknown');
    if (parsedAll.pos !== null) console.error('Error position:', parsedAll.pos);
    if (parsedAll.snippet) console.error('Snippet around error:\n', parsedAll.snippet);
    process.exit(4);
  }

  const merged = parsedAll.data;

  const outDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'booklet_library_backup.json');
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2), 'utf8');
  console.log('Wrote merged file to', outPath);
}

(async () => {
  await mergeAndWrite();
})();
