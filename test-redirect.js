const url = 'https://news.google.com/rss/articles/CBMiT0FVX3lxTE5uZU5wOHV1YmV4LXJGY1ZMTHJuVmpVYXVFMzJXSEw2aE1acWZmQUpkT1VDUGZtMUFRb0FvQlBLLUUtZVVvWW5Sd2RNdmllcFk?oc=5';
fetch(url, { method: 'GET', redirect: 'follow' })
  .then(res => {
    console.log('Final URL:', res.url);
  })
  .catch(err => console.error(err));
