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
    let q = (keyword || '최신뉴스').trim();
    const isNaverTarget = q.toLowerCase().includes('kt ds') || q.toLowerCase().includes('ktds');

    if (isNaverTarget) {
      // 1. Fetch from Naver News Search if it's KT DS related
      const naverUrl = `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(q)}`;
      const response = await fetch(naverUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });
      if (response.ok) {
        const html = await response.text();
        const items = [];
        // Naver's Fender renderer structure analysis (as found in testing)
        // Headlines are in sds-comps-text-ellipsis-1, snippets in sds-comps-text-ellipsis-3
        // Links are in <a> tags with fender-ui classes
        const splitItems = html.split('data-fender-root="true"').slice(1);
        
        for (let itemHtml of splitItems) {
          if (items.length >= 5) break;

          const titleMatch = itemHtml.match(/sds-comps-text-ellipsis-1[^>]*>(.*?)<\/span><\/a>/);
          const linkMatch = itemHtml.match(/href=\"(https?:\/\/[^\"]+)\"[^>]*class=\"[^\"]*fender-ui[^\"]*\"/);
          const descMatch = itemHtml.match(/sds-comps-text-ellipsis-3[^>]*>(.*?)<\/span><\/a>/);
          const pubMatch = itemHtml.match(/class=\"[^\"]*info[^\"]*\">([^<]+)<\/span>/);

          if (titleMatch && linkMatch) {
            items.push({
              title: titleMatch[1].replace(/<[^>]+>/g, '').trim(),
              link: linkMatch[1],
              description: descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '',
              pubDate: pubMatch ? pubMatch[1].trim() : ''
            });
          }
        }
        
        // If we found results, return them
        if (items.length > 0) {
          return res.status(200).json({ items, source: 'naver' });
        }
      }
    }

    // 2. Fallback to Bing News RSS for general news or if Naver fails
    if (!q.includes('2026') && !isNaverTarget) {
      q += ' 2026';
    }
    const bingUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&cc=kr&format=rss`;

    const bingResponse = await fetch(bingUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      }
    });
    if (!bingResponse.ok) {
      throw new Error(`Bing News RSS fetch failed: ${bingResponse.status} ${bingResponse.statusText}`);
    }

    const xmlText = await bingResponse.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xmlText)) !== null) {
      if (items.length >= 5) break;
      const itemXml = match[1];
      
      const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/);
      let title = titleMatch ? titleMatch[1] : '';
      title = title.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();

      const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/);
      let link = linkMatch ? linkMatch[1] : '';
      const urlParamMatch = link.match(/url=([^&<]+)/);
      if (urlParamMatch) link = decodeURIComponent(urlParamMatch[1]);

      const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const pubDate = pubDateMatch ? pubDateMatch[1] : '';

      const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/);
      let description = descMatch ? descMatch[1] : '';
      description = description.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
                               .replace(/<[^>]+>/g, '')
                               .replace(/&nbsp;/g, ' ')
                               .trim();

      items.push({ title, link, pubDate, description });
    }

    res.status(200).json({ items, source: 'bing' });
  } catch (error) {
    console.error('API /news error:', error);
    res.status(500).json({ error: error.message });
  }
}
