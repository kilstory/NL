export default async function handler(req, res) {
  // CORS setup
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
    const { keyword } = req.query;

    // Append after:2026-01-01 to ensure recent/future news
    const query = keyword ? `${keyword} after:2026-01-01` : `최신뉴스 after:2026-01-01`;
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google News RSS fetch failed: ${response.status} ${response.statusText}`);
    }

    const xmlText = await response.text();

    // Parse RSS XML manually using Regex since we don't have DOMParser in Node.js
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xmlText)) !== null) {
      if (items.length >= 5) break; // Limit to top 5 news items
      
      const itemXml = match[1];
      
      const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/);
      let title = titleMatch ? titleMatch[1] : '';
      
      // Clean up title (remove CDATA if present)
      title = title.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();

      const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/);
      const link = linkMatch ? linkMatch[1] : '';

      const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const pubDate = pubDateMatch ? pubDateMatch[1] : '';

      const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/);
      let description = descMatch ? descMatch[1] : '';
      description = description.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
                               .replace(/<[^>]+>/g, '') // strip HTML tags
                               .replace(/&nbsp;/g, ' ')
                               .trim();

      items.push({ title, link, pubDate, description });
    }

    res.status(200).json({ items });
  } catch (error) {
    console.error('API /news error:', error);
    res.status(500).json({ error: error.message });
  }
}
