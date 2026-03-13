export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader('Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

  // ── 공통 헬퍼 ──────────────────────────────────────────
  function extractRssThumbnail(itemXml) {
    const patterns = [
      /<media:thumbnail[^>]+url=["']([^"']+)["']/i,
      /<media:content[^>]+url=["']([^"']+)["'][^>]*type=["']image/i,
      /<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i,
      /<enclosure[^>]+type=["']image[^"']*["'][^>]+url=["']([^"']+)["']/i,
    ]
    for (const re of patterns) { const m = itemXml.match(re); if (m?.[1]) return m[1].trim() }
    return ''
  }

  function extractDescThumbnail(rawDesc) {
    const m = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i)
    return m ? m[1].trim() : ''
  }

  async function fetchOgImage(url) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!r.ok) return ''
      const html = await r.text()
      const m = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
             || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
      return m ? m[1].replace(/&amp;/g, '&') : ''
    } catch { return '' }
  }

  // aitimes.com 검색 페이지 HTML 파싱 (iNews24 CMS 구조 대응)
  function parseAitimesHtml(html, baseUrl = 'https://www.aitimes.com') {
    const items = []
    const seen = new Set()

    // 방법 1: <li> 기사 항목 파싱 (type2 리스트)
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/g
    let m
    while ((m = liRegex.exec(html)) !== null) {
      if (items.length >= 8) break
      const li = m[1]
      if (!li.includes('articleView.html')) continue

      const linkM = li.match(/href=["']([^"']*articleView\.html\?[^"']+)["']/)
      if (!linkM) continue
      const rawLink = linkM[1].replace(/&amp;/g, '&')
      const link = rawLink.startsWith('http') ? rawLink : baseUrl + rawLink
      if (seen.has(link)) continue
      seen.add(link)

      // 제목: titles 클래스 a태그 또는 h4 안 a태그
      const titleM = li.match(/class=["'][^"']*titles[^"']*["'][\s\S]*?<a[^>]*>([^<]{4,})<\/a>/)
                  || li.match(/<h[2-5][^>]*>[\s\S]*?<a[^>]*>([^<]{4,})<\/a>/)
      if (!titleM) continue
      const title = titleM[1].replace(/<[^>]+>/g, '').trim()
      if (title.length < 4) continue

      // 썸네일
      let thumbnail = ''
      const thumbM = li.match(/data-src=["']([^"']+)["']/i)
                  || li.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)
      if (thumbM) {
        thumbnail = thumbM[1]
        if (thumbnail.startsWith('//')) thumbnail = 'https:' + thumbnail
        else if (thumbnail.startsWith('/')) thumbnail = baseUrl + thumbnail
      }

      // 설명
      const descM = li.match(/class=["'][^"']*lead[^"']*["'][^>]*>([\s\S]{5,300}?)<[/]/)
      const description = descM ? descM[1].replace(/<[^>]+>/g, '').trim() : ''

      const pubM = li.match(/(\d{4}\.\d{2}\.\d{2})/)
      items.push({ title, link, thumbnail, description, pubDate: pubM ? pubM[1] : '' })
    }

    // 방법 2: div 기반 레이아웃 (view-col 등) - 방법1로 못 찾은 경우
    if (items.length === 0) {
      const segments = html.split(/href=["'][^"']*articleView\.html/)
      for (const seg of segments.slice(1)) {
        if (items.length >= 8) break
        const linkM = seg.match(/^[?][^"']+/)
        if (!linkM) continue
        const rawLink = '/news/articleView.html' + linkM[0].replace(/&amp;/g, '&').replace(/".*/, '')
        const link = baseUrl + rawLink
        if (seen.has(link)) continue
        seen.add(link)

        const titleM = seg.match(/^[^>]*>([가-힣\w ,.\-:!?·…「」()%]{4,})/)
                    || seg.match(/>([가-힣\w ,.\-:!?·…「」()%]{4,})</)
        if (!titleM) continue
        const title = titleM[1].trim()
        if (title.length < 4) continue

        let thumbnail = ''
        const thumbM = seg.match(/data-src=["']([^"']+)["']/i)
                    || seg.match(/<img[^>]+src=["']([^"']+\.(jpg|jpeg|png|gif|webp))["']/i)
        if (thumbM) {
          thumbnail = thumbM[1]
          if (thumbnail.startsWith('//')) thumbnail = 'https:' + thumbnail
          else if (thumbnail.startsWith('/')) thumbnail = baseUrl + thumbnail
        }

        items.push({ title, link, thumbnail, description: '', pubDate: '' })
      }
    }

    return items
  }

  // aitimes RSS 전체 파싱 (키워드 점수 기반 필터링)
  async function fetchAitimesRss(keyword) {
    const rssUrl = 'https://cdn.aitimes.com/rss/gn_rss_allArticle.xml'
    const r = await fetch(rssUrl, { headers: { 'User-Agent': UA } })
    if (!r.ok) return []
    const xml = await r.text()
    const all = []
    const re = /<item>([\s\S]*?)<\/item>/g
    let m
    while ((m = re.exec(xml)) !== null) {
      if (all.length >= 60) break
      const x = m[1]
      const titleM = x.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || x.match(/<title>([\s\S]*?)<\/title>/)
      const linkM  = x.match(/<link>([\s\S]*?)<\/link>/)
      const descM  = x.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || x.match(/<description>([\s\S]*?)<\/description>/)
      const pubM   = x.match(/<pubDate>([\s\S]*?)<\/pubDate>/)
      if (!titleM || !linkM) continue
      const rawDesc = descM ? descM[1] : ''
      const thumbnail = extractRssThumbnail(x) || extractDescThumbnail(rawDesc)
      all.push({
        title: titleM[1].trim(),
        link: linkM[1].trim(),
        description: rawDesc.replace(/<[^>]+>/g, '').replace(/\\'/g, "'").trim().slice(0, 200),
        pubDate: pubM ? pubM[1].trim() : '',
        thumbnail
      })
    }
    if (!keyword || !keyword.trim()) return all.slice(0, 5)

    // 키워드 관련도 점수 계산
    const kw = keyword.trim().toLowerCase()
    const words = kw.split(/\s+/).filter(w => w.length > 1)
    const scored = all.map(item => {
      const text = (item.title + ' ' + item.description).toLowerCase()
      const score = words.reduce((acc, w) => acc + (text.includes(w) ? 2 : 0) +
        (item.title.toLowerCase().includes(w) ? 3 : 0), 0)
      return { item, score }
    })
    scored.sort((a, b) => b.score - a.score)
    const matched = scored.filter(x => x.score > 0).map(x => x.item)
    return (matched.length > 0 ? matched : all).slice(0, 5)
  }

  try {
    const { keyword, source } = req.query
    const q = (keyword || '').trim().toLowerCase()

    // ── 0. KT DS 공식 블로그 ───────────────────────────────
    if (source === 'ktds_blog') {
      const rssUrl = 'https://rss.blog.naver.com/ktds_official.xml'
      const response = await fetch(rssUrl, { headers: { 'User-Agent': UA } })
      if (response.ok) {
        const xmlText = await response.text()
        const items = []
        const itemRegex = /<item>([\s\S]*?)<\/item>/g
        let match
        while ((match = itemRegex.exec(xmlText)) !== null) {
          if (items.length >= 5) break
          const x = match[1]
          const titleM = x.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || x.match(/<title>([\s\S]*?)<\/title>/)
          const linkM  = x.match(/<link>([\s\S]*?)<\/link>/)
          const descM  = x.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || x.match(/<description>([\s\S]*?)<\/description>/)
          const pubM   = x.match(/<pubDate>([\s\S]*?)<\/pubDate>/)
          if (!titleM || !linkM) continue
          const rawDesc = descM ? descM[1] : ''
          const thumbnail = extractRssThumbnail(x) || extractDescThumbnail(rawDesc)
          const description = rawDesc.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().slice(0, 200)
          items.push({ title: titleM[1].trim(), link: linkM[1].trim(), description, pubDate: pubM ? pubM[1].trim() : '', thumbnail })
        }
        if (items.length > 0) return res.status(200).json({ items, source: 'ktds_blog' })
      }
    }

    // ── 1. AI Times - 키워드 기반 크롤링 ────────────────────
    if (source === 'aitimes') {
      let items = []

      // 1a. aitimes.com 검색 페이지 직접 크롤
      if (keyword) {
        try {
          const searchUrl = `https://www.aitimes.com/news/articleList.html?sc_word=${encodeURIComponent(keyword)}&view_type=sm`
          const resp = await fetch(searchUrl, { headers: { 'User-Agent': UA } })
          if (resp.ok) {
            const html = await resp.text()
            items = parseAitimesHtml(html)
          }
        } catch (e) { console.warn('aitimes search crawl failed:', e.message) }
      }

      // 1b. 검색 실패 시 RSS 키워드 필터링 폴백
      if (items.length === 0) {
        items = await fetchAitimesRss(keyword)
      }

      // 1c. 썸네일 없는 기사는 og:image 직접 fetch (최대 3개)
      let ogFetchCount = 0
      for (let i = 0; i < items.length && ogFetchCount < 3; i++) {
        if (!items[i].thumbnail && items[i].link) {
          items[i].thumbnail = await fetchOgImage(items[i].link)
          ogFetchCount++
        }
      }

      items = items.slice(0, 5)
      if (items.length > 0) return res.status(200).json({ items, source: 'aitimes' })
    }

    // ── 2. Naver (KT DS 키워드) ───────────────────────────
    const isNaverTarget = q.includes('kt ds') || q.includes('ktds')
    if (isNaverTarget) {
      const naverUrl = `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(keyword)}`
      const response = await fetch(naverUrl, { headers: { 'User-Agent': UA } })
      if (response.ok) {
        const html = await response.text()
        const items = []
        const splitItems = html.split('data-fender-root="true"').slice(1)
        for (let itemHtml of splitItems) {
          if (items.length >= 5) break
          const titleM = itemHtml.match(/sds-comps-text-ellipsis-1[^>]*>(.*?)<\/span><\/a>/)
          const linkM  = itemHtml.match(/href=\"(https?:\/\/[^\"]+)\"[^>]*class=\"[^\"]*fender-ui[^\"]*\"/)
          const descM  = itemHtml.match(/sds-comps-text-ellipsis-3[^>]*>(.*?)<\/span><\/a>/)
          const pubM   = itemHtml.match(/class=\"[^\"]*info[^\"]*\">([^<]+)<\/span>/)
          const thumbM = itemHtml.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*class="[^"]*thumb[^"]*"/i)
                      || itemHtml.match(/data-lazy-src=["'](https?:\/\/[^"']+)["']/i)
          if (titleM && linkM) {
            items.push({
              title: titleM[1].replace(/<[^>]+>/g, '').trim(),
              link: linkM[1],
              description: descM ? descM[1].replace(/<[^>]+>/g, '').trim() : '',
              pubDate: pubM ? pubM[1].trim() : '',
              thumbnail: thumbM ? thumbM[1].trim() : ''
            })
          }
        }
        if (items.length > 0) return res.status(200).json({ items, source: 'naver' })
      }
    }

    // ── 3. Bing News RSS (최후 폴백) ─────────────────────
    let bingQ = keyword || '최신뉴스'
    if (!bingQ.includes('2026') && !isNaverTarget) bingQ += ' 2026'
    const bingUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(bingQ)}&cc=kr&format=rss`
    const bingResponse = await fetch(bingUrl, { headers: { 'User-Agent': UA } })
    if (!bingResponse.ok) throw new Error(`Bing RSS failed: ${bingResponse.status}`)

    const xmlText = await bingResponse.text()
    const items = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match
    while ((match = itemRegex.exec(xmlText)) !== null) {
      if (items.length >= 5) break
      const x = match[1]
      const titleM = x.match(/<title>([\s\S]*?)<\/title>/)
      let title = titleM ? titleM[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : ''
      const linkM = x.match(/<link>([\s\S]*?)<\/link>/)
      let link = linkM ? linkM[1] : ''
      const urlP = link.match(/url=([^&<]+)/)
      if (urlP) link = decodeURIComponent(urlP[1])
      const pubM   = x.match(/<pubDate>([\s\S]*?)<\/pubDate>/)
      const descM  = x.match(/<description>([\s\S]*?)<\/description>/)
      const rawDesc = descM ? descM[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') : ''
      const thumbnail = extractRssThumbnail(x) || extractDescThumbnail(rawDesc)
      const description = rawDesc.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
      items.push({ title, link, pubDate: pubM ? pubM[1] : '', description, thumbnail })
    }
    res.status(200).json({ items, source: 'bing' })

  } catch (error) {
    console.error('API /news error:', error)
    res.status(500).json({ error: error.message })
  }
}
