export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is missing.' });
    }

    const { model, p, supportsJson } = req.body;
    
    if (!model || !p) {
       return res.status(400).json({ error: 'Missing model or prompt (p) in request body.' });
    }

    const cfg = { temperature: 0.9 };
    if (supportsJson) cfg.responseMimeType = 'application/json';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: p }] }],
          generationConfig: cfg
        })
      }
    );

    if (!response.ok) {
      const eb = await response.json().catch(() => ({}));
      throw new Error(eb?.error?.message || response.statusText);
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Attempt parsing json directly if possible to catch errors early
    try {
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
        res.status(200).json({ parsed });
    } catch(err) {
        // Just return raw text if parsing fails (in case the client wants to parse or fallback)
        res.status(200).json({ rawText: text });
    }

  } catch (error) {
    console.error('API /gemini-copy error:', error);
    res.status(500).json({ error: error.message });
  }
}
