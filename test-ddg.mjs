const keyword = 'kt ds news';
const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(keyword)}+images`;
try {
  const response = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    }
  });
  const html = await response.text();
  console.log('HTML size:', html.length);
  const regex = /<img[^>]+src="([^">]+)"/g;
  const urls = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
      if(match[1].startsWith('//')) {
           urls.push('https:' + match[1]);
      } else if (match[1].startsWith('/')) {
           urls.push('https://duckduckgo.com' + match[1]);
      } else {
           urls.push(match[1]);
      }
  }
  console.log('Found Images:', urls.slice(0, 5));
} catch (e) {
  console.error(e);
}
