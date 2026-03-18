export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  let targetUrl;
  try {
    targetUrl = decodeURIComponent(url);
    new URL(targetUrl); // validate
  } catch {
    return res.status(400).json({ error: 'invalid url' });
  }

  try {
    const imgRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': new URL(targetUrl).origin,
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });

    if (!imgRes.ok) {
      return res.status(imgRes.status).json({ error: `upstream ${imgRes.status}` });
    }

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ error: 'not an image' });
    }

    const buffer = await imgRes.arrayBuffer();
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
