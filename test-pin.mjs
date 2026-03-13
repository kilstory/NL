const keyword = 'it ai technology';
const searchUrl = `https://www.pinterest.co.kr/search/pins/?q=${encodeURIComponent(keyword)}&rs=typed`;
try {
  const response = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    }
  });
  const html = await response.text();
  const match = html.match(/https:\/\/i\.pinimg\.com\/[^\"]+\.jpg/g);
  if (match) {
    console.log('Found Pin Images:', [...new Set(match)].slice(0, 5));
  } else {
    console.log('No images found on Pinterest html');
  }
} catch (e) {
  console.error(e);
}
