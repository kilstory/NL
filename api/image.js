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

    // 2. Fallback to Google Image Search
    if (!keyword) {
      return res.status(400).json({ error: 'Keyword is required if URL extraction fails' });
    }

    // Use tbm=isch for Google Image Search
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbm=isch&asearch=ichunk&async=_id:rg_s,_pms:s,_fmt:pc`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
      }
    });

    if (!response.ok) {
      throw new Error(`Google Image fetch failed: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();

    // Google uses data-src for lazy loading images in search results
    // We look for the first occurrence of an image URL that looks like a real image (jpg, png)
    // and is not a small thumbnail if possible.
    const imgMatches = html.match(/\"(https:\/\/[^\"]+?\.(?:jpg|jpeg|png|gif))\"/g) || [];
    let imgUrl = null;

    for (let m of imgMatches) {
      let candidate = m.replace(/\"/g, '');
      // Filter out small icons or trackers
      if (candidate.includes('googleusercontent') || candidate.includes('gstatic')) continue;
      imgUrl = candidate;
      break;
    }

    if (!imgUrl) {
      // Fallback: search for any https image link
      const fallbackMatches = html.match(/https:\/\/[^\s"']+?\.(?:jpg|jpeg|png|gif)/gi) || [];
      imgUrl = fallbackMatches.find(u => !u.includes('gstatic') && !u.includes('googleusercontent'));
    }

    if (imgUrl) {
      return res.status(200).json({ url: imgUrl });
    } else {
      return res.status(404).json({ error: 'No image found on Google' });
    }

  } catch (error) {
    console.error('API /image error:', error);
    res.status(500).json({ error: error.message });
  }
}
