const { createClient } = require('@supabase/supabase-js');
try {
  process.loadEnvFile();
} catch (e) {}

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function run() {
  console.log('SUPABASE_URL:', supabaseUrl);
  console.log('SUPABASE_SERVICE_ROLE_KEY Length:', supabaseServiceKey.length);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    console.log('Listing buckets...');
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      console.error('List error:', listError.message);
      return;
    }
    console.log('Buckets found:', buckets);

    const hasAvatars = buckets?.some(b => b.name === 'avatars');
    if (!hasAvatars) {
      console.log('Creating avatars bucket...');
      const { error: createError } = await supabase.storage.createBucket('avatars', { public: true });
      if (createError) {
        console.error('Create error:', createError.message);
        return;
      }
      console.log('Bucket created!');
    }

    console.log('Uploading test file...');
    const buffer = Buffer.from('test-image-content');
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('avatars')
      .upload('test_avatar.txt', buffer, {
        contentType: 'text/plain',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError.message);
      return;
    }
    console.log('Upload success data:', uploadData);

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl('test_avatar.txt');
    console.log('Public URL:', publicUrl);

  } catch (err) {
    console.error('Unexpected error:', err);
  }
}
run();
