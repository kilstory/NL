import fs from 'fs';
import path from 'path';

const GROUPS = [
  { name: '기술혁신단', file: '기술혁신단.txt' },
  { name: 'UI/UX팀',   file: 'UI_UX팀.txt'   },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const groups = GROUPS.map(g => {
    try {
      const filePath = path.join(process.cwd(), 'contacts', g.file);
      const lines = fs.readFileSync(filePath, 'utf-8')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

      const members = lines.map(line => {
        const parts = line.split(/\s+/);
        // 형식: 이름 이메일
        if (parts.length >= 2) {
          const email = parts.find(p => p.includes('@'));
          const name  = parts.filter(p => !p.includes('@')).join(' ');
          return email ? { name, email } : null;
        }
        return null;
      }).filter(Boolean);

      return { name: g.name, members };
    } catch {
      return { name: g.name, members: [] };
    }
  });

  res.status(200).json({ groups });
}
