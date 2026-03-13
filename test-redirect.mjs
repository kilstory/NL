const url = 'https://news.google.com/rss/articles/CBMiT0FVX3lxTE5uZU5wOHV1YmV4LXJGY1ZMTHJuVmpVYXVFMzJXSEw2aE1acWZmQUpkT1VDUGZtMUFRb0FvQlBLLUUtZVVvWW5Sd2RNdmllcFk?oc=5';
const res = await fetch(url, { redirect: 'follow' });
console.log('Final URL:', res.url);
