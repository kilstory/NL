export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const key = process.env.PIXABAY_KEY;
  if (!key) return res.status(500).json({ error: 'PIXABAY_KEY 환경변수가 설정되지 않았습니다.' });

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q(검색어) 파라미터가 필요합니다.' });

  const trySearch = async (query, category = '') => {
    let url = `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal&per_page=20&min_width=1200&safesearch=true&lang=en`;
    if (category) url += `&category=${category}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Pixabay API error: ${r.status}`);
    const data = await r.json();
    return data.hits || [];
  };

  try {
    // 1차: 'backgrounds' 카테고리로 검색
    let hits = await trySearch(q, 'backgrounds');

    // 2차: 카테고리 없이 재시도
    if (hits.length === 0) {
      hits = await trySearch(q);
    }

    // 3차: 키워드 첫 단어만으로 재시도
    if (hits.length === 0) {
      const firstWord = q.split(/[\s,]+/)[0];
      if (firstWord && firstWord !== q) hits = await trySearch(firstWord);
    }

    if (hits.length === 0) {
      return res.status(404).json({ error: '검색 결과가 없습니다.' });
    }

    // 상위 10개 중 랜덤 선택
    const pick = hits[Math.floor(Math.random() * Math.min(hits.length, 10))];
    return res.status(200).json({
      url: pick.largeImageURL || pick.webformatURL,
      preview: pick.webformatURL,
      tags: pick.tags,
    });
  } catch (e) {
    console.error('Pixabay API error:', e);
    return res.status(500).json({ error: e.message });
  }
}
