const xml = `
<item><title>Test Title</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;aid=&amp;url=https%3a%2f%2fwww.etnews.com%2f20250218&amp;c=123</link><description>Summary text</description><pubDate>Tue, 18 Feb 2025 10:00:00 GMT</pubDate></item>
`;

const items = [];
const itemRegex = /<item>([\s\S]*?)<\/item>/g;
let match;
while ((match = itemRegex.exec(xml)) !== null) {
  const itemXml = match[1];
  
  const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/);
  const title = titleMatch ? titleMatch[1] : '';

  const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/);
  let link = linkMatch ? linkMatch[1] : '';
  const urlParamMatch = link.match(/url=([^&<]+)/);
  if (urlParamMatch) {
    link = decodeURIComponent(urlParamMatch[1]);
  }

  const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/);
  let description = descMatch ? descMatch[1] : '';

  const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
  const pubDate = pubDateMatch ? pubDateMatch[1] : '';

  items.push({ title, link, description, pubDate });
}
console.log(items);
