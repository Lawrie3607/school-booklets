const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set' });
  }

  const { model, contents, config } = req.body || {};
  if (!model || !contents) {
    return res.status(400).json({ error: 'model and contents are required' });
  }

  try {
    const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    const body = {
      contents: Array.isArray(contents) ? contents : [contents],
      generationConfig: config || {},
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      const status = upstream.status;
      const message = data?.error?.message || 'Gemini API error';
      return res.status(status).json({ error: message, raw: data });
    }

    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('\n') || '';
    return res.status(200).json({ text, raw: data });
  } catch (err: any) {
    console.error('Gemini proxy failure:', err);
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
}
