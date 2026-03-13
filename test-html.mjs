const keyword = 'it ai technology';
const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbm=isch`;
try {
  const response = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
  });
  const html = await response.text();
  console.log('HTML length:', html.length);
  console.log('HTML preview:', html.substring(0, 500));
} catch (e) {
  console.error(e);
}
