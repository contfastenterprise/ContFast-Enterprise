async function testFetch() {
  const url = 'https://mpveesrcspollujmgzgy.supabase.co/storage/v1/object/public/avatars/test_avatar.txt';
  try {
    const res = await fetch(url);
    console.log('Fetch Status:', res.status);
    const text = await res.text();
    console.log('Fetch Text:', text);
  } catch (err) {
    console.error('Fetch Error:', err);
  }
}
testFetch();
