const OPENAI_BASE = 'https://api.openai.com/v1';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });

  const { type = 'image', prompt, size = '1024x1024', model = 'dall-e-3' } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  try {
    if (type === 'image') {
      const upstream = await fetch(`${OPENAI_BASE}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ prompt, model, size })
      });
      const data = await upstream.json();
      if (!upstream.ok) return res.status(upstream.status).json({ error: data?.error?.message || 'OpenAI image error', raw: data });
      const url = data?.data?.[0]?.url || '';
      return res.status(200).json({ url, raw: data });
    }

    return res.status(400).json({ error: 'Unsupported type' });
  } catch (err: any) {
    console.error('OpenAI proxy failure:', err);
    return res.status(500).json({ error: err?.message || 'Unexpected OpenAI proxy error' });
  }
}
