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
    
    // 1. Try to extract image directly from the article URL
    if (url) {
      try {
        const urlFetchRes = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
          }
        });
        if (urlFetchRes.ok) {
          const html = await urlFetchRes.text();
          // Look for og:image meta tag
          const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
                          html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i);
          if (ogMatch && ogMatch[1]) {
            let imgUrl = ogMatch[1].replace(/&amp;/g, '&');
            return res.status(200).json({ url: imgUrl });
          }
        }
      } catch (err) {
        console.warn('Failed to extract image from URL:', err.message);
      }
    }

    // 2. Fallback to Bing Image Search
    if (!keyword) {
      return res.status(400).json({ error: 'Keyword is required if URL extraction fails' });
    }

    const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(keyword)}&qft=+filterui:photo-photo`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Bing Image fetch failed: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();

    // Extract first image URL using Regex
    // Bing images usually have m="{murl:'https://...'}"
    const match = html.match(/murl&quot;:&quot;(.*?)&quot;/);
    
    if (match && match[1]) {
      let imgUrl = match[1];
      // Clean up encoded ampersands if any
      imgUrl = imgUrl.replace(/&amp;/g, '&');
      return res.status(200).json({ url: imgUrl });
    } else {
      // Fallback regex pattern for Bing
      const fallBackMatch = html.match(/(http|https):\/\/([^\s"']+?\.(?:jpg|jpeg|png|gif))/i);
      if (fallBackMatch && fallBackMatch[0]) {
        return res.status(200).json({ url: fallBackMatch[0] });
      }
      return res.status(404).json({ error: 'No image found' });
    }

  } catch (error) {
    console.error('API /image error:', error);
    res.status(500).json({ error: error.message });
  }
}
