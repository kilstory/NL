const keyword = 'kt ds news';
const searchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(keyword)}`;
try {
  const response = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    }
  });
  const html = await response.text();
  console.log('HTML size:', html.length);
  // Match the standard direct image links often embedded as ["http..."] in script tags
  const urls = [];
  const regex = /\["(https:\/\/[^"]+?\.(?:jpg|jpeg|png|gif))",/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
      if(!match[1].includes('gstatic')) {
           urls.push(match[1]);
      }
  }
  console.log('Found Images:', urls.slice(0, 5));
} catch (e) {
  console.error(e);
}
