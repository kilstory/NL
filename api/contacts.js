import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const contactsDir = path.join(process.cwd(), 'contacts');
    if (!fs.existsSync(contactsDir)) {
      return res.status(200).json({ groups: [] });
    }

    // .txt 파일 자동 검색
    const files = fs.readdirSync(contactsDir).filter(f => f.endsWith('.txt'));
    
    const groups = files.map(filename => {
      try {
        const filePath = path.join(contactsDir, filename);
        // 파일명을 그룹명으로 사용 (확장자 제거 및 특수문자 처리)
        const groupName = filename.normalize('NFC').replace('.txt', '').replace(/_/g, '/');
        
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n')
          .map(l => l.trim())
          .filter(Boolean);

        const members = lines.map(line => {
          const parts = line.split(/\s+/);
          // 형식: 이름 이메일
          if (parts.length >= 2) {
            const email = parts.find(p => p.includes('@'));
            // 이메일을 제외한 나머지를 이름으로 결합
            const name = parts.filter(p => !p.includes('@')).join(' ');
            return email ? { name: name || '이름 없음', email } : null;
          }
          return null;
        }).filter(Boolean);

        return { name: groupName, members };
      } catch (e) {
        console.error(`Error reading contact file ${filename}:`, e);
        return null;
      }
    }).filter(Boolean);

    res.status(200).json({ groups });
  } catch (err) {
    console.error('API /contacts error:', err);
    res.status(500).json({ error: err.message });
  }
}
