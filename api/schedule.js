import { kv } from '@vercel/kv';

const KEY = 'nl_schedule';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const cfg = await kv.get(KEY);
      return res.status(200).json(cfg || null);
    }

    if (req.method === 'POST') {
      const cfg = req.body;
      if (!cfg || typeof cfg !== 'object') {
        return res.status(400).json({ error: 'Invalid body' });
      }
      await kv.set(KEY, cfg);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      await kv.del(KEY);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('/api/schedule error:', e);
    return res.status(500).json({ error: e.message });
  }
}
