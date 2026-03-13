const keyword = 'it ai technology';
const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbm=isch&asearch=ichunk&async=_id:rg_s,_pms:s,_fmt:pc`;
try {
  const response = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
    }
  });
  const html = await response.text();
  console.log('HTML length:', html.length);
  const imgMatches = html.match(/\"(https:\/\/[^\"]+?\.(?:jpg|jpeg|png|gif))\"/g) || [];
  console.log('Matches found:', imgMatches.length);
  imgMatches.slice(0, 5).forEach(m => console.log('Match:', m));
} catch (e) {
  console.error(e);
}
