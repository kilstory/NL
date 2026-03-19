import sharp from 'sharp';

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

    // ── Supabase Storage 업로드 (서버사이드) ──
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    const bucket = 'newsletter-images';

    if (supabaseUrl && supabaseKey) {
      try {
        // PNG → JPEG 변환 + 최대 1200px 리사이즈 (Outlook 용량 최적화)
        const rawBuffer = Buffer.from(p.inlineData.data, 'base64');
        const imageBuffer = await sharp(rawBuffer)
          .resize({ width: 1200, withoutEnlargement: true })
          .jpeg({ quality: 82 })
          .toBuffer();
        const mimeType = 'image/jpeg';
        const ext = 'jpg';
        const fileName = `ai_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

        const uploadRes = await fetch(
          `${supabaseUrl}/storage/v1/object/${bucket}/${fileName}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': mimeType,
              'x-upsert': 'true'
            },
            body: imageBuffer
          }
        );

        if (uploadRes.ok) {
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${fileName}`;
          console.log('Supabase 업로드 성공:', publicUrl);
          return res.status(200).json({ url: publicUrl });
        } else {
          const errText = await uploadRes.text();
          console.error('Supabase 업로드 실패:', uploadRes.status, errText);
        }
      } catch (uploadErr) {
        console.error('Supabase 업로드 오류:', uploadErr.message);
      }
    } else {
      console.warn('SUPABASE_URL 또는 SUPABASE_SERVICE_KEY 환경변수 없음 → base64 fallback');
    }

    // Fallback: base64 반환
    const imgBase64 = `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
    return res.status(200).json({ image: imgBase64 });

  } catch (error) {
    console.error('API /gemini-image error:', error);
    res.status(500).json({ error: error.message });
  }
}
