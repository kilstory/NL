export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version')
  
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  try {
    const { keyword } = req.query;
    if (!keyword) {
      return res.status(400).json({ error: 'Keyword is required' });
    }

    const searchUrl = `https://www.pinterest.co.kr/search/pins/?q=${encodeURIComponent(keyword)}&rs=typed`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Pinterest fetch failed: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    // Extract pin image URLs
    const match = html.match(/https:\/\/i\.pinimg\.com\/[^\"]+\.jpg/g);
    
    if (match && match.length > 0) {
      const uniqueUrls = [...new Set(match)];
      // Prioritize high-quality versions (736x or originals)
      let bestUrl = uniqueUrls.find(u => u.includes('736x') || u.includes('originals')) || uniqueUrls[0];
      return res.status(200).json({ url: bestUrl });
    } else {
      return res.status(404).json({ error: 'No image found on Pinterest' });
    }

  } catch (error) {
    console.error('API /pinterest error:', error);
    res.status(500).json({ error: error.message });
  }
}
