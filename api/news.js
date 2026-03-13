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

  // Extract thumbnail from item XML (RSS media tags)
  function extractRssThumbnail(itemXml) {
    const patterns = [
      /<media:thumbnail[^>]+url=["']([^"']+)["']/i,
      /<media:content[^>]+url=["']([^"']+)["'][^>]*type=["']image/i,
      /<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i,
      /<enclosure[^>]+type=["']image[^"']*["'][^>]+url=["']([^"']+)["']/i,
    ];
    for (const re of patterns) {
      const m = itemXml.match(re);
      if (m && m[1]) return m[1].trim();
    }
    return '';
  }

  // Extract thumbnail from description HTML (e.g. Bing wraps <img> in description)
  function extractDescThumbnail(rawDesc) {
    const m = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
    return m ? m[1].trim() : '';
  }

  try {
    const { keyword, source } = req.query;
    let q = (keyword || '최신뉴스').trim().toLowerCase();

    // 0. KT DS 공식 블로그 (네이버 블로그)
    if (source === 'ktds_blog') {
      const rssUrl = 'https://rss.blog.naver.com/ktds_official.xml';
      const response = await fetch(rssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });
      if (response.ok) {
        const xmlText = await response.text();
        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        while ((match = itemRegex.exec(xmlText)) !== null) {
          if (items.length >= 5) break;
          const itemXml = match[1];

          const titleMatch = itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || itemXml.match(/<title>([\s\S]*?)<\/title>/);
          const linkMatch  = itemXml.match(/<link>([\s\S]*?)<\/link>/);
          const descMatch  = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || itemXml.match(/<description>([\s\S]*?)<\/description>/);
          const pubMatch   = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

          if (!titleMatch || !linkMatch) continue;

          const rawDesc = descMatch ? descMatch[1] : '';
          // 네이버 블로그 RSS description 안 첫 번째 <img src>를 썸네일로 사용
          const thumbnail = extractRssThumbnail(itemXml) || extractDescThumbnail(rawDesc);
          const description = rawDesc.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().slice(0, 200);

          items.push({
            title: titleMatch[1].trim(),
            link: linkMatch[1].trim(),
            description,
            pubDate: pubMatch ? pubMatch[1].trim() : '',
            thumbnail
          });
        }
        if (items.length > 0) return res.status(200).json({ items, source: 'ktds_blog' });
      }
    }

    // 1. Explicit AI Times check or keyword-based detection
    const isAiTimesTarget = source === 'aitimes' || q.includes('it now') || q.includes('itnow') || q.includes('ai times');

    if (isAiTimesTarget) {
      const aiTimesUrl = 'https://cdn.aitimes.com/rss/gn_rss_allArticle.xml';
      const response = await fetch(aiTimesUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });
      if (response.ok) {
        const xmlText = await response.text();
        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        while ((match = itemRegex.exec(xmlText)) !== null) {
          if (items.length >= 5) break;
          const itemXml = match[1];

          const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || itemXml.match(/<title>(.*?)<\/title>/);
          const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
          const descMatch = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || itemXml.match(/<description>(.*?)<\/description>/);
          const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);

          if (titleMatch && linkMatch) {
            const rawDesc = descMatch ? descMatch[1] : '';
            const thumbnail = extractRssThumbnail(itemXml) || extractDescThumbnail(rawDesc);
            items.push({
              title: titleMatch[1].trim(),
              link: linkMatch[1].trim(),
              description: rawDesc.replace(/<[^>]+>/g, '').replace(/\\'/g, "'").trim(),
              pubDate: pubDateMatch ? pubDateMatch[1].trim() : '',
              thumbnail
            });
          }
        }
        if (items.length > 0) return res.status(200).json({ items, source: 'aitimes' });
      }
    }

    const isNaverTarget = q.includes('kt ds') || q.includes('ktds');

    if (isNaverTarget) {
      const naverUrl = `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(keyword)}`;
      const response = await fetch(naverUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });
      if (response.ok) {
        const html = await response.text();
        const items = [];
        const splitItems = html.split('data-fender-root="true"').slice(1);

        for (let itemHtml of splitItems) {
          if (items.length >= 5) break;

          const titleMatch = itemHtml.match(/sds-comps-text-ellipsis-1[^>]*>(.*?)<\/span><\/a>/);
          const linkMatch = itemHtml.match(/href=\"(https?:\/\/[^\"]+)\"[^>]*class=\"[^\"]*fender-ui[^\"]*\"/);
          const descMatch = itemHtml.match(/sds-comps-text-ellipsis-3[^>]*>(.*?)<\/span><\/a>/);
          const pubMatch = itemHtml.match(/class=\"[^\"]*info[^\"]*\">([^<]+)<\/span>/);
          // Naver thumbnail
          const thumbMatch = itemHtml.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*class="[^"]*thumb[^"]*"/i)
                          || itemHtml.match(/data-lazy-src=["'](https?:\/\/[^"']+)["']/i);

          if (titleMatch && linkMatch) {
            items.push({
              title: titleMatch[1].replace(/<[^>]+>/g, '').trim(),
              link: linkMatch[1],
              description: descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '',
              pubDate: pubMatch ? pubMatch[1].trim() : '',
              thumbnail: thumbMatch ? thumbMatch[1].trim() : ''
            });
          }
        }

        if (items.length > 0) return res.status(200).json({ items, source: 'naver' });
      }
    }

    // 3. Fallback to Bing News RSS for general news or if others fail
    let bingQ = keyword || '최신뉴스';
    if (!bingQ.includes('2026') && !isNaverTarget && !isAiTimesTarget) {
      bingQ += ' 2026';
    }
    const bingUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(bingQ)}&cc=kr&format=rss`;

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
      const rawDesc = descMatch ? descMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') : '';
      // Extract thumbnail BEFORE stripping HTML tags
      const thumbnail = extractRssThumbnail(itemXml) || extractDescThumbnail(rawDesc);
      const description = rawDesc.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

      items.push({ title, link, pubDate, description, thumbnail });
    }

    res.status(200).json({ items, source: 'bing' });
  } catch (error) {
    console.error('API /news error:', error);
    res.status(500).json({ error: error.message });
  }
}
