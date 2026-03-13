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

    const { model, fullPrompt } = req.body;
    
    if (!model || !fullPrompt) {
       return res.status(400).json({ error: 'Missing model or fullPrompt in request body.' });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini Image fetch failed: ${response.status} ${response.statusText}`);
    }

    const d = await response.json();
    const p = d.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    
    if (!p) {
        return res.status(404).json({ error: 'No image returned from Gemini' });
    }

    const imgBase64 = `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
    return res.status(200).json({ image: imgBase64 });

  } catch (error) {
    console.error('API /gemini-image error:', error);
    res.status(500).json({ error: error.message });
  }
}
