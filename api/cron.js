import { kv } from '@vercel/kv';
import nodemailer from 'nodemailer';
import juice from 'juice';

/* ══════════════════════════════════════════════
   SCHEDULE CHECK
══════════════════════════════════════════════ */
function shouldSendNow(cfg) {
  // 한국 시간 기준 체크
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const [h] = (cfg.time || '09:00').split(':').map(Number);
  if (now.getHours() !== h) return false;

  const type = cfg.type || 'once';
  if (type === 'daily') return true;

  if (type === 'once') {
    const yy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return cfg.date === `${yy}-${mm}-${dd}`;
  }

  if (type === 'weekly') {
    // dow: 1=월 ~ 7=일 (modal 기준)
    const jsDay = now.getDay(); // 0=일, 1=월 ...
    const dow = jsDay === 0 ? 7 : jsDay;
    return dow === +cfg.dow;
  }

  if (type === 'monthly') {
    return now.getDate() === +(cfg.dom || 1);
  }

  return false;
}

/* ══════════════════════════════════════════════
   SOURCE / KEYWORD HELPERS
══════════════════════════════════════════════ */
function getSectionSource(keys) {
  if (keys.includes('solution')) return 'digitaltoday';
  if (keys.includes('itnow') || keys.includes('axfield')) return 'aitimes';
  return null; // naver / bing fallback
}

function getSectionKeyword(sec) {
  if (sec.topic) return sec.topic;
  if (sec.keys.includes('dsnews')) return 'kt ds';
  if (sec.keys.includes('itnow')) return 'IT AI 기술';
  if (sec.keys.includes('axfield')) return 'AX 현장 사례';
  if (sec.keys.includes('solution')) return 'AI 솔루션';
  return sec.name;
}

/* ══════════════════════════════════════════════
   NEWS FETCH (inline — no self-call needed for basic sources)
══════════════════════════════════════════════ */
function extractRssThumbnail(itemXml) {
  const patterns = [
    /<media:thumbnail[^>]+url=["']([^"']+)["']/i,
    /<media:content[^>]+url=["']([^"']+)["'][^>]*type=["']image/i,
    /<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i,
  ];
  for (const re of patterns) {
    const m = itemXml.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

function extractDescThumbnail(rawDesc) {
  const m = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1].trim() : '';
}

function isWithin3Days(pubDateStr) {
  if (!pubDateStr) return true;
  if (/\d+[분초]\s*전/.test(pubDateStr)) return true;
  if (/\d+시간\s*전/.test(pubDateStr)) return true;
  const daysMatch = pubDateStr.match(/(\d+)\s*일\s*전/);
  if (daysMatch) return parseInt(daysMatch[1]) <= 3;
  const d = new Date(pubDateStr);
  if (!isNaN(d.getTime())) return (Date.now() - d) <= 3 * 24 * 60 * 60 * 1000;
  return true;
}

function parseRssItems(xml, srcLabel) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    if (items.length >= 10) break;
    const ix = m[1];
    const titleM = ix.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || ix.match(/<title>(.*?)<\/title>/);
    const linkM  = ix.match(/<link>(.*?)<\/link>/);
    const dateM  = ix.match(/<pubDate>(.*?)<\/pubDate>/);
    const descM  = ix.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || ix.match(/<description>([\s\S]*?)<\/description>/);
    if (!titleM || !linkM) continue;
    let link = linkM[1].trim();
    const urlParam = link.match(/url=([^&]+)/);
    if (urlParam) link = decodeURIComponent(urlParam[1]);
    const rawDesc = descM ? descM[1] : '';
    const thumbnail = extractRssThumbnail(ix) || extractDescThumbnail(rawDesc);
    items.push({
      title: titleM[1].replace(/<[^>]+>/g, '').trim(),
      link,
      pubDate: dateM ? dateM[1].trim() : '',
      description: rawDesc.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().slice(0, 300),
      thumbnail,
      source: srcLabel,
    });
  }
  return items;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function fetchNewsItems(keys, keyword) {
  const source = getSectionSource(keys);

  // 1) digitaltoday RSS
  if (source === 'digitaltoday') {
    const rssUrls = [
      'https://www.digitaltoday.co.kr/rss/S1N10.xml',
      'https://www.digitaltoday.co.kr/rss/allArticle.xml',
    ];
    for (const url of rssUrls) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!r.ok) continue;
        const xml = await r.text();
        const all = parseRssItems(xml, 'digitaltoday');
        if (all.length) {
          const recent = all.filter(it => isWithin3Days(it.pubDate));
          return (recent.length ? recent : all).slice(0, 5);
        }
      } catch {}
    }
    // Google News fallback
    const gnUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`site:digitaltoday.co.kr ${keyword}`)}&hl=ko&gl=KR&ceid=KR:ko`;
    try {
      const r = await fetch(gnUrl, { headers: { 'User-Agent': UA } });
      if (r.ok) {
        const xml = await r.text();
        const all = parseRssItems(xml, 'digitaltoday');
        const recent = all.filter(it => isWithin3Days(it.pubDate));
        return (recent.length ? recent : all).slice(0, 5);
      }
    } catch {}
    return [];
  }

  // 2) AI Times RSS
  if (source === 'aitimes') {
    try {
      const r = await fetch('https://cdn.aitimes.com/rss/gn_rss_allArticle.xml', { headers: { 'User-Agent': UA } });
      if (r.ok) {
        const xml = await r.text();
        const all = parseRssItems(xml, 'aitimes');
        if (!keyword) return all.slice(0, 5);
        const words = keyword.toLowerCase().split(/\s+/).filter(w => w.length > 1);
        const scored = all.map(item => {
          const text = (item.title + ' ' + item.description).toLowerCase();
          const score = words.reduce((acc, w) => acc + (item.title.toLowerCase().includes(w) ? 3 : 0) + (text.includes(w) ? 1 : 0), 0);
          return { item, score };
        }).sort((a, b) => b.score - a.score);
        const matched = scored.filter(x => x.score > 0).map(x => x.item);
        return (matched.length ? matched : all).slice(0, 5);
      }
    } catch {}
    return [];
  }

  // 3) Bing News RSS fallback
  try {
    const bingUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(keyword + ' 2026')}&cc=kr&format=rss`;
    const r = await fetch(bingUrl, { headers: { 'User-Agent': UA } });
    if (r.ok) {
      const xml = await r.text();
      return parseRssItems(xml, 'bing').slice(0, 5);
    }
  } catch {}

  return [];
}

/* ══════════════════════════════════════════════
   IMAGE FETCH (og:image from article URL)
══════════════════════════════════════════════ */
async function fetchOgImage(articleUrl) {
  if (!articleUrl) return '';
  const uaList = [UA, 'Googlebot/2.1 (+http://www.google.com/bot.html)'];
  for (const ua of uaList) {
    try {
      const r = await fetch(articleUrl, { headers: { 'User-Agent': ua } });
      if (!r.ok) continue;
      const html = await r.text();
      const m = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
                html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i);
      if (m?.[1]) {
        let imgUrl = m[1].replace(/&amp;/g, '&');
        if (imgUrl.startsWith('/')) {
          const base = new URL(articleUrl);
          imgUrl = `${base.protocol}//${base.host}${imgUrl}`;
        }
        return imgUrl;
      }
      break;
    } catch {}
  }
  return '';
}

/* ══════════════════════════════════════════════
   GEMINI COPY
══════════════════════════════════════════════ */
const COPY_PROMPTS = (t) => ({
  intro:    `인트로 인사말 2-3문장. 주제:"${t}"`,
  itnow:    `IT Now 아티클 — 제목(첫줄)+요약2문장. 주제:"${t}"`,
  axfield:  `AX현장 케이스 — 제목(첫줄)+임팩트지표2문장. 주제:"${t}"`,
  solution: `솔루션 카드 — 제목(첫줄)+설명2문장. 주제:"${t}"`,
  dsnews:   `KT DS 소식 3개, 각"제목\\n설명1문장", \\n\\n으로 구분. 주제들:"${t}"`,
  lead:     `리드 카피 2-3문장. 주제:"${t}"`,
  body1:    `본문1 3-4문장. 주제:"${t}"`,
  body2:    `본문2 3-4문장. 주제:"${t}"`,
  card1:    `피처카드1 — 제목(첫줄)+설명2문장. 주제:"${t}"`,
  card2:    `피처카드2 — 제목(첫줄)+설명2문장. 주제:"${t}"`,
  card3:    `피처카드3 — 제목(첫줄)+설명2문장. 주제:"${t}"`,
});

async function generateCopy(sec, newsItems) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return '';

  const keyword = getSectionKeyword(sec);
  const key = sec.keys[0];
  const promptMap = COPY_PROMPTS(keyword);
  const basePrompt = promptMap[key] || `"${sec.name}" 섹션 카피 2-3문장. 주제:"${keyword}"`;

  let fullPrompt = `당신은 B2B IT 기업 뉴스레터 카피라이터입니다.\n${basePrompt}`;

  if (newsItems?.length) {
    const pick = newsItems[0];
    const others = newsItems.slice(1, 4).map((it, i) => `[Related ${i + 1}] ${it.title}`).join('\n');
    const newsCtx = `[MAIN TARGET ARTICLE]\n제목: ${pick.title}\n내용: ${pick.description}\n\n(참고용)\n${others}`;
    fullPrompt = `당신은 B2B IT 기업 뉴스레터 카피라이터입니다.\n(규칙: [MAIN TARGET ARTICLE]의 내용을 바탕으로 핵심을 요약하여 카피를 작성할 것)\n\n${newsCtx}\n\n작업: ${basePrompt}`;
  }

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { temperature: 0.9 },
        }),
      }
    );
    if (!r.ok) return '';
    const data = await r.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  } catch {
    return '';
  }
}

/* ══════════════════════════════════════════════
   BUILD SECTION DATA (news + image + copy)
══════════════════════════════════════════════ */
async function buildSectionData(sec) {
  const keyword = getSectionKeyword(sec);
  const newsItems = await fetchNewsItems(sec.keys, keyword);
  const article = newsItems[0] || null;

  let imgUrl = article?.thumbnail || '';
  if (!imgUrl && article?.link) {
    imgUrl = await fetchOgImage(article.link);
  }

  const copy = await generateCopy(sec, newsItems) || `${sec.name}\n${keyword}에 관한 최신 소식입니다.`;

  return { ...sec, copy, imgUrl, link: article?.link || '' };
}

/* ══════════════════════════════════════════════
   HTML BUILDER
══════════════════════════════════════════════ */
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildEmailHTML(cfg, sectionsData) {
  const TF   = "'Noto Serif KR',Georgia,serif";
  const BF   = "'Noto Sans KR',Arial,sans-serif";
  const MF   = "'DM Mono','Courier New',monospace";
  const AC   = '#e5332a';
  const DARK = '#1a1816';

  const brand      = cfg.brand || 'KT DS';
  const brandSub   = cfg.brandSub || 'AX 전문 파트너';
  const heroSlogan = cfg.heroSlogan || '신뢰를 넘어 미래로 혁신하는 디지털 파트너, KT DS';
  const heroSub    = cfg.heroSub || '우리는 클라우드와 AI 기술을 선도하며 고객의 디지털 전환을 성공으로 이끕니다.';
  const heroImg    = cfg.heroImg || '';

  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const vol = `Vol. ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const footerDate = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  let rows = '';

  // ── 히어로 ──
  rows += `
  <tr><td bgcolor="${DARK}" style="background-color:${DARK};padding:0;">
    ${heroImg ? `<img src="${heroImg}" width="600" alt="" style="display:block;width:600px;max-width:100%;height:240px;object-fit:cover;border:0;outline:none;">` : ''}
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr><td bgcolor="${DARK}" style="background-color:${DARK};padding:28px 36px 34px;">
        <p style="margin:0 0 12px;font-family:${TF};font-size:28px;font-weight:900;color:#ffffff;line-height:1.2;">${esc(heroSlogan)}</p>
        <p style="margin:0;font-family:${BF};font-size:13px;color:rgba(255,255,255,0.65);line-height:1.75;">${esc(heroSub)}</p>
      </td></tr>
    </table>
  </td></tr>`;

  // ── 헤더 바 ──
  rows += `
  <tr><td bgcolor="${AC}" style="background-color:${AC};padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>
        <td width="150" bgcolor="#c12b23" style="background-color:#c12b23;padding:14px 22px;vertical-align:middle;">
          <p style="margin:0;font-family:${TF};font-size:16px;font-weight:900;color:#ffffff;">${esc(brand)}</p>
          <p style="margin:3px 0 0;font-family:${BF};font-size:7px;color:rgba(255,255,255,0.5);letter-spacing:2px;">NEWSLETTER</p>
        </td>
        <td style="padding:14px 18px;vertical-align:middle;">
          <p style="margin:0;font-family:${MF};font-size:9px;color:rgba(255,255,255,0.75);font-weight:500;">${esc(vol)}</p>
          <p style="margin:3px 0 0;font-family:${BF};font-size:8px;color:rgba(255,255,255,0.4);">${esc(brandSub)}가 드리는 소식지</p>
        </td>
      </tr>
    </table>
  </td></tr>`;

  // ── 섹션들 ──
  for (const sec of sectionsData) {
    if (!sec.copy) continue;

    const lines  = sec.copy.split('\n').map(l => l.trim()).filter(Boolean);
    const title  = lines[0] || sec.name;
    const desc   = lines.slice(1).join('\n');
    const img    = sec.imgUrl || '';
    const link   = sec.link || '';
    const lay    = sec.layout || 'full';
    const isIntro = sec.keys?.includes('intro');

    // 섹션 라벨 바
    if (!isIntro) {
      rows += `
  <tr><td bgcolor="#18171a" style="background-color:#18171a;padding:8px 24px;">
    <p style="margin:0;font-family:${BF};font-size:11px;font-weight:800;color:#ffffff;">${sec.icon || ''} ${esc(sec.name)}</p>
  </td></tr>`;
    }

    const ctaBtn = link
      ? `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;border-collapse:collapse;"><tr><td align="center" bgcolor="${AC}" style="border-radius:4px;background-color:${AC};"><a href="${link}" target="_blank" style="background-color:${AC};border-radius:4px;color:#ffffff;display:inline-block;font-family:${BF};font-size:12px;font-weight:700;line-height:1;padding:10px 22px;text-decoration:none;">자세히 보기 →</a></td></tr></table>`
      : '';

    if (isIntro) {
      rows += `
  <tr><td bgcolor="#ffffff" style="background-color:#ffffff;border-bottom:1px solid #e8e4dc;padding:22px 36px;">
    <p style="margin:0;font-family:${BF};font-size:13px;color:#444444;line-height:1.9;">${esc(sec.copy).replace(/\n/g, '<br>')}</p>
  </td></tr>`;

    } else if (lay === 'solution') {
      const LC  = '#1a56db';
      const BG2 = '#f0f4ff';
      const shortDesc = desc.length > 160 ? desc.slice(0, 160) + '…' : desc;
      rows += `
  <tr><td bgcolor="${BG2}" style="background-color:${BG2};border-bottom:1px solid #d0d9f5;padding:0;">
    ${img
      ? `<img src="${img}" width="600" alt="" style="display:block;width:600px;max-width:100%;height:220px;object-fit:cover;border:0;outline:none;">`
      : `<table width="600" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${LC}" height="8" style="background-color:${LC};height:8px;font-size:0;line-height:0;">&nbsp;</td></tr></table>`}
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;table-layout:fixed;">
      <tr><td bgcolor="${BG2}" style="background-color:${BG2};padding:20px 32px 26px;">
        <p style="margin:0 0 8px;font-family:${BF};font-size:9px;font-weight:700;color:${LC};letter-spacing:1.5px;text-transform:uppercase;mso-line-height-rule:exactly;">${esc(sec.name)}</p>
        <p style="margin:0 0 12px;font-family:${TF};font-size:20px;font-weight:900;color:#1a1816;line-height:1.3;mso-line-height-rule:exactly;">${esc(title)}</p>
        ${shortDesc ? `<p style="margin:0 0 18px;font-family:${BF};font-size:13px;color:#444444;line-height:1.8;mso-line-height-rule:exactly;">${esc(shortDesc)}</p>` : ''}
        ${link ? `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td align="center" bgcolor="#1a1816" style="border-radius:4px;"><a href="${link}" target="_blank" style="background-color:#1a1816;border-radius:4px;color:#ffffff;display:inline-block;font-family:${BF};font-size:12px;font-weight:700;line-height:1;padding:11px 24px;text-decoration:none;">기사 보기 →</a></td></tr></table>` : ''}
      </td></tr>
    </table>
  </td></tr>`;

    } else if (lay === 'side' || lay === 'side-r') {
      const IW = 200;
      const imgTd = `<td width="${IW}" valign="top" style="width:${IW}px;vertical-align:top;padding:0;">${img ? `<img src="${img}" width="${IW}" alt="" style="display:block;width:${IW}px;height:170px;object-fit:cover;border:0;outline:none;">` : ''}</td>`;
      const txtTd = `<td valign="top" style="vertical-align:top;padding:20px 24px;">
        <p style="margin:0 0 6px;font-family:${BF};font-size:9px;font-weight:700;color:${AC};letter-spacing:1.5px;text-transform:uppercase;">${esc(sec.name)}</p>
        <p style="margin:0 0 10px;font-family:${TF};font-size:17px;font-weight:900;color:#1a1816;line-height:1.35;">${esc(title)}</p>
        ${desc ? `<p style="margin:0;font-family:${BF};font-size:12px;color:#555555;line-height:1.75;">${esc(desc).replace(/\n/g, '<br>')}</p>` : ''}
        ${ctaBtn}
      </td>`;
      const rev = lay === 'side-r';
      rows += `
  <tr><td bgcolor="#ffffff" style="background-color:#ffffff;border-bottom:1px solid #e8e4dc;padding:0;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>${rev ? txtTd + imgTd : imgTd + txtTd}</tr>
    </table>
  </td></tr>`;

    } else {
      // full / default
      rows += `
  <tr><td bgcolor="#ffffff" style="background-color:#ffffff;border-bottom:1px solid #e8e4dc;padding:0;">
    ${img ? `<img src="${img}" width="600" alt="" style="display:block;width:600px;max-width:100%;height:220px;object-fit:cover;border:0;outline:none;">` : ''}
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:20px 36px 26px;">
        <p style="margin:0 0 8px;font-family:${BF};font-size:9px;font-weight:700;color:${AC};letter-spacing:1.5px;text-transform:uppercase;">${esc(sec.name)}</p>
        <p style="margin:0 0 12px;font-family:${TF};font-size:20px;font-weight:900;color:#1a1816;line-height:1.35;">${esc(title)}</p>
        ${desc ? `<p style="margin:0;font-family:${BF};font-size:13px;color:#555555;line-height:1.8;">${esc(desc).replace(/\n/g, '<br>')}</p>` : ''}
        ${ctaBtn}
      </td></tr>
    </table>
  </td></tr>`;
    }
  }

  // ── 푸터 ──
  rows += `
  <tr><td bgcolor="${DARK}" style="background-color:${DARK};padding:28px 36px 24px;">
    <p style="margin:0 0 8px;font-family:${BF};font-size:12px;font-weight:700;color:#ffffff;">${esc(brand)}</p>
    <p style="margin:0;font-family:${BF};font-size:11px;color:rgba(255,255,255,0.4);line-height:1.7;">${footerDate} · 자동 발송된 뉴스레터입니다.</p>
  </td></tr>`;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(cfg.subject || '뉴스레터')}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f3ef;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f3ef;border-collapse:collapse;">
    <tr><td align="center" style="padding:20px 0;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;border-collapse:collapse;background-color:#ffffff;">
        ${rows}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* ══════════════════════════════════════════════
   SEND MAIL
══════════════════════════════════════════════ */
async function sendMail(to, subject, html) {
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;
  if (!user || !pass) throw new Error('MAIL_USER / MAIL_PASS env missing');

  const inlinedHtml = juice(html, {
    removeStyleTags: false,
    preserveMediaQueries: true,
    applyWidthAttributes: true,
    applyAttributesTableElements: true,
  });

  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  const toStr = Array.isArray(to) ? to.join(', ') : to;
  await transporter.sendMail({ from: `"뉴스레터 빌더" <${user}>`, to: toStr, subject, html: inlinedHtml });
}

/* ══════════════════════════════════════════════
   CRON HANDLER
══════════════════════════════════════════════ */
export default async function handler(req, res) {
  // Vercel이 자동으로 CRON_SECRET을 Bearer 토큰으로 전달
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const cfg = await kv.get('nl_schedule');
    if (!cfg?.active) {
      return res.status(200).json({ skip: 'no active schedule' });
    }

    if (!shouldSendNow(cfg)) {
      return res.status(200).json({ skip: 'not time yet', scheduled: cfg.time, type: cfg.type });
    }

    const recipients = cfg.recipients || [];
    if (!recipients.length) {
      return res.status(200).json({ skip: 'no recipients configured' });
    }

    let emailHtml = '';

    if (cfg.autoGen && cfg.sections?.length) {
      // 섹션별 뉴스 크롤 + 카피 생성
      const activeSections = cfg.sections.filter(s => s.on !== false);
      const sectionsData = [];
      for (const sec of activeSections) {
        const data = await buildSectionData(sec);
        sectionsData.push(data);
      }
      emailHtml = buildEmailHTML(cfg, sectionsData);
    } else if (cfg.lastHtml) {
      // 마지막으로 저장된 HTML 그대로 발송
      emailHtml = cfg.lastHtml;
    }

    if (!emailHtml) {
      return res.status(200).json({ skip: 'no html content (set autoGen=true or save newsletter HTML)' });
    }

    await sendMail(recipients, cfg.subject || '뉴스레터', emailHtml);

    // 1회 발송이면 비활성화
    if (cfg.type === 'once') {
      cfg.active = false;
      await kv.set('nl_schedule', cfg);
    }

    const ts = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    console.log(`✅ Newsletter sent to ${recipients.length} recipients at ${ts}`);
    return res.status(200).json({ ok: true, sent: recipients.length, time: ts });

  } catch (e) {
    console.error('Cron error:', e);
    return res.status(500).json({ error: e.message });
  }
}
