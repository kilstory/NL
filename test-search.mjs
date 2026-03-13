const keyword = 'kt ds news';
const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(keyword)}&iax=images&ia=images`;
try {
  const response = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    }
  });
  const html = await response.text();
  const regex = /vqd=([^&'"]+)/;
  const match = regex.exec(html);
  if(match) {
      const vqd = match[1];
      const imgUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(keyword)}&vqd=${vqd}&f=,,,,,&p=1`;
      const imgRes = await fetch(imgUrl, {
          headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/javascript, */*; q=0.01'
          }
      });
      const data = await imgRes.json();
      console.log('Found DDG Images:', data.results.slice(0, 3).map(r => r.image));
  } else {
      console.log('No vqd found');
  }
} catch (e) {
  console.error(e);
}
