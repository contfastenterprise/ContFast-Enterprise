const { createClient } = require('@supabase/supabase-js');
try {
  process.loadEnvFile();
} catch (e) {}

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// 1x1 transparent PNG
const pngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

async function run() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    console.log('Uploading 1x1 PNG...');
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload('test_avatar.png', pngBuffer, {
        contentType: 'image/png',
        upsert: true
      });

    if (error) {
      console.error('Upload error:', error.message);
      return;
    }
    console.log('Upload success:', data);

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl('test_avatar.png');
    console.log('Public URL:', publicUrl);

    console.log('Fetching public URL to verify access...');
    const res = await fetch(publicUrl);
    console.log('Fetch Status:', res.status);
    console.log('Content-Type:', res.headers.get('content-type'));
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}
run();
