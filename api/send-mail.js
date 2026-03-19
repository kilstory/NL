import nodemailer from 'nodemailer';
import juice from 'juice';

// 외부 이미지 URL → base64 인라인 변환 (Outlook 이미지 차단 우회)
async function inlineExternalImages(html) {
  const imgRegex = /<img([^>]*?)src=["'](https?:\/\/[^"']+)["']([^>]*?)>/gi;
  const matches = [];
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    matches.push({ full: match[0], before: match[1], url: match[2], after: match[3] });
  }
  if (matches.length === 0) return html;

  await Promise.all(matches.map(async (m) => {
    try {
      const resp = await fetch(m.url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) return;
      const ct = resp.headers.get('content-type') || 'image/jpeg';
      const buf = await resp.arrayBuffer();
      const b64 = Buffer.from(buf).toString('base64');
      m.replacement = `<img${m.before}src="data:${ct};base64,${b64}"${m.after}>`;
    } catch (e) {
      console.warn('이미지 인라인 실패 (유지):', m.url, e.message);
    }
  }));

  let result = html;
  for (const m of matches) {
    if (m.replacement) result = result.replace(m.full, m.replacement);
  }
  return result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { to, subject, html } = req.body;
  if (!to || !subject || !html) {
    res.status(400).json({ error: '수신자, 제목, 내용이 필요합니다.' });
    return;
  }
  const toStr = Array.isArray(to) ? to.join(', ') : to;

  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;
  if (!user || !pass) {
    res.status(500).json({ error: 'MAIL_USER / MAIL_PASS 환경변수가 설정되지 않았습니다.' });
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    // CSS inline
    const inlinedHtml = juice(html, {
      removeStyleTags: false,
      preserveMediaQueries: true,
      applyWidthAttributes: true,
      applyAttributesTableElements: true,
    });

    // 외부 이미지 → base64 인라인 (Outlook 이미지 차단 우회)
    const finalHtml = await inlineExternalImages(inlinedHtml);

    // plain text
    const plainText = finalHtml
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s{2,}/g, ' ')
      .trim();

    await transporter.sendMail({
      from: `"뉴스레터 빌더" <${user}>`,
      to: toStr,
      subject,
      text: plainText,
      html: finalHtml,
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Mail send error:', e);
    res.status(500).json({ error: e.message });
  }
}
