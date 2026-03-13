try {
  const response = await fetch('https://example.com');
  const text = await response.text();
  console.log('Success! Text length:', text.length);
} catch (e) {
  console.error('Fetch error:', e);
}
