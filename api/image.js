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

  try {
    const { keyword, url } = req.query;
    
    // 1. Try to extract og:image directly from the article URL
    if (url) {
      const uaList = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Googlebot/2.1 (+http://www.google.com/bot.html)',
      ];
      for (const ua of uaList) {
        try {
          const urlFetchRes = await fetch(url, { headers: { 'User-Agent': ua } });
          if (!urlFetchRes.ok) continue;
          const html = await urlFetchRes.text();
          const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
                          html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i);
          if (ogMatch && ogMatch[1]) {
            let imgUrl = ogMatch[1].replace(/&amp;/g, '&');
            // 상대경로 처리
            if (imgUrl.startsWith('/')) {
              const base = new URL(url);
              imgUrl = `${base.protocol}//${base.host}${imgUrl}`;
            }
            return res.status(200).json({ url: imgUrl });
          }
          break; // 응답은 ok였으나 og:image 없음 → 다음 단계로
        } catch (err) {
          console.warn('og:image fetch failed:', err.message);
        }
      }
    }

    if (!keyword) {
      return res.status(400).json({ error: 'Keyword is required if URL extraction fails' });
    }

    const q = keyword.trim();
    const isNaverTarget = q.toLowerCase().includes('kt ds') || q.toLowerCase().includes('ktds');

    if (isNaverTarget) {
      // 2. Try Naver Image Search if it's KT DS related
      const naverUrl = `https://search.naver.com/search.naver?where=image&query=${encodeURIComponent(q)}`;
      const response = await fetch(naverUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });
      if (response.ok) {
        const html = await response.text();
        // Look for original image URLs in Naver's hosting domain
        const imgMatches = html.match(/https:\/\/search\.pstatic\.net\/[^\"]+/g);
        if (imgMatches && imgMatches.length > 0) {
          // Clean up encoded unicode or other characters if present
          let imgUrl = imgMatches[0].replace(/\\u0026/g, '&');
          // If it's a thumbnail service URL, try to extract the source URL if possible
          const srcMatch = imgUrl.match(/src=([^&]+)/);
          if (srcMatch) {
            imgUrl = decodeURIComponent(srcMatch[1]);
          }
          return res.status(200).json({ url: imgUrl, source: 'naver' });
        }
      }
    }

    // 3. Fallback to Google Image Search for general or if Naver fails
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=isch`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Google Image fetch failed: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();

    // Enhanced regex to find image URLs in the large Google HTML response
    const imgMatches = html.match(/https?:\/\/[^\s\"']+?\.(?:jpg|jpeg|png|gif)/gi) || [];
    let imgUrl = null;

    for (let candidate of imgMatches) {
      if (candidate.includes('gstatic') || candidate.includes('googleusercontent') || candidate.includes('al-icon')) continue;
      if (candidate.toLowerCase().includes('logo') || candidate.toLowerCase().includes('icon')) continue;
      imgUrl = candidate;
      break;
    }

    if (imgUrl) {
      return res.status(200).json({ url: imgUrl, source: 'google' });
    } else {
      return res.status(404).json({ error: 'No image found' });
    }

  } catch (error) {
    console.error('API /image error:', error);
    res.status(500).json({ error: error.message });
  }
}
