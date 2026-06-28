import { loadEnvConfig } from '@next/env';
import path from 'path';

// Force environment variables to load first
loadEnvConfig(path.resolve(__dirname, '..'));

async function run() {
  console.log('--- STARTING ROUTE MAPPINGS API DIAGNOSTIC ---');
  
  // Dynamic import of project modules to guarantee env configuration is fully populated
  const { NextRequest } = await import('next/server');
  const { GET } = await import('../src/app/api/v1/auth/route-mappings/route');

  // Construct a mock NextRequest passing simulated headers to bypass verifyAuth
  const req = new NextRequest('http://localhost/api/v1/auth/route-mappings', {
    headers: {
      'x-user-id': 'd1c9ef00-0000-0000-0000-000000000000',
      'x-company-id': 'bfe92d82-b706-441b-b185-74215406b2a0',
      'x-user-role': 'sistemas',
      'x-role-id': 'd4cf7b99-98ed-4c3c-aed9-0e8bdd2b6db9',
    }
  });

  try {
    const res = await GET(req);
    const data = await res.json();
    console.log('API Response status:', res.status);
    console.log('API Response keys:', Object.keys(data));
    if (data.success && data.data && data.data.length > 0) {
      console.log('Sample mapping record from API:', data.data[0]);
    } else {
      console.log('API returned empty data or success=false:', data);
    }
  } catch (err) {
    console.error('Error invoking GET handler:', err);
  }
}

run();
