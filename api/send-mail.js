import nodemailer from 'nodemailer';

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
  // to는 문자열 또는 배열 모두 허용
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

    await transporter.sendMail({
      from: `"뉴스레터 빌더" <${user}>`,
      to: toStr,
      subject,
      html,
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Mail send error:', e);
    res.status(500).json({ error: e.message });
  }
}
