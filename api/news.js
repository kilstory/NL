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

  function isWithin3Days(pubDateStr) {
    if (!pubDateStr) return true;
    const now = new Date();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    // 상대 한국어 날짜 (네이버)
    if (/\d+[분초]\s*전/.test(pubDateStr)) return true;
    if (/\d+시간\s*전/.test(pubDateStr)) return true;
    const daysMatch = pubDateStr.match(/(\d+)\s*일\s*전/);
    if (daysMatch) return parseInt(daysMatch[1]) <= 3;
    // 표준 날짜 파싱 (RSS)
    const d = new Date(pubDateStr);
    if (!isNaN(d.getTime())) return (now - d) <= threeDaysMs;
    return true; // 파싱 불가 → 유지
  }

  try {
    const { keyword, source } = req.query;
    let q = (keyword || '최신뉴스').trim().toLowerCase();

    // 0. aitimes.kr (인공지능신문) — Google News RSS 경유
    if (source === 'aitimes_kr') {
      const kw = keyword ? `${keyword} ` : 'AI ';
      const gnUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`site:aitimes.kr ${kw}`)}&hl=ko&gl=KR&ceid=KR:ko`;
      const gnRes = await fetch(gnUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (gnRes.ok) {
        const xml = await gnRes.text();
        const all = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let m;
        while ((m = itemRegex.exec(xml)) !== null) {
          if (all.length >= 20) break;
          const ix = m[1];
          const titleM = ix.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || ix.match(/<title>(.*?)<\/title>/);
          const linkM  = ix.match(/<link>(.*?)<\/link>/);
          const dateM  = ix.match(/<pubDate>(.*?)<\/pubDate>/);
          const descM  = ix.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || ix.match(/<description>(.*?)<\/description>/);
          if (!titleM || !linkM) continue;
          // Google News 링크에서 실제 URL 추출
          let link = linkM[1].trim();
          const urlParam = link.match(/url=([^&]+)/);
          if (urlParam) link = decodeURIComponent(urlParam[1]);
          const rawDesc = descM ? descM[1] : '';
          all.push({
            title: titleM[1].replace(/<[^>]+>/g, '').trim(),
            link,
            pubDate: dateM ? dateM[1].trim() : '',
            description: rawDesc.replace(/<[^>]+>/g, '').trim(),
            thumbnail: extractDescThumbnail(rawDesc)
          });
        }
        const recent = all.filter(it => isWithin3Days(it.pubDate));
        const items = (recent.length > 0 ? recent : all).slice(0, 10);
        if (items.length > 0) return res.status(200).json({ items, source: 'aitimes_kr' });
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
        const all = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        while ((match = itemRegex.exec(xmlText)) !== null) {
          if (all.length >= 60) break;
          const itemXml = match[1];
          const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || itemXml.match(/<title>(.*?)<\/title>/);
          const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
          const descMatch = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || itemXml.match(/<description>(.*?)<\/description>/);
          const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);
          if (titleMatch && linkMatch) {
            const rawDesc = descMatch ? descMatch[1] : '';
            const thumbnail = extractRssThumbnail(itemXml) || extractDescThumbnail(rawDesc);
            all.push({
              title: titleMatch[1].trim(),
              link: linkMatch[1].trim(),
              description: rawDesc.replace(/<[^>]+>/g, '').replace(/\\'/g, "'").trim(),
              pubDate: pubDateMatch ? pubDateMatch[1].trim() : '',
              thumbnail
            });
          }
        }
        // 3일 이내 기사만 필터
        const recentAll = all.filter(it => isWithin3Days(it.pubDate));
        // 키워드 관련성 점수 필터링
        let items = recentAll.length > 0 ? recentAll : all;
        if (keyword && keyword.trim() && !keyword.includes('it now') && !keyword.includes('itnow')) {
          const words = keyword.trim().toLowerCase().split(/\s+/).filter(w => w.length > 1);
          if (words.length > 0) {
            const scored = all.map(item => {
              const text = (item.title + ' ' + item.description).toLowerCase();
              const score = words.reduce((acc, w) => acc + (item.title.toLowerCase().includes(w) ? 3 : 0) + (text.includes(w) ? 2 : 0), 0);
              return { item, score };
            });
            scored.sort((a, b) => b.score - a.score);
            const matched = scored.filter(x => x.score > 0).map(x => x.item);
            items = (matched.length > 0 ? matched : all).slice(0, 5);
          } else {
            items = all.slice(0, 5);
          }
        } else {
          items = all.slice(0, 5);
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

        const recentNaver = items.filter(it => isWithin3Days(it.pubDate));
        if (recentNaver.length > 0) return res.status(200).json({ items: recentNaver, source: 'naver' });
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

    const recentBing = items.filter(it => isWithin3Days(it.pubDate));
    res.status(200).json({ items: recentBing.length > 0 ? recentBing : items, source: 'bing' });
  } catch (error) {
    console.error('API /news error:', error);
    res.status(500).json({ error: error.message });
  }
}
