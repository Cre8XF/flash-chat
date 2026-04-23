// Cloudflare Worker — generates pre-signed R2 PUT URLs for direct client uploads.
//
// Required wrangler secrets (set via `wrangler secret put <NAME>`):
//   R2_ACCESS_KEY_ID      — R2 API token access key
//   R2_SECRET_ACCESS_KEY  — R2 API token secret
//   R2_ACCOUNT_ID         — Cloudflare account ID
//
// Required wrangler.toml vars:
//   R2_PUBLIC_URL   — public base URL of the R2 bucket (e.g. https://pub-xxx.r2.dev)
//   ALLOWED_ORIGIN  — CORS origin to allow (your Netlify domain)
//
// Deploy: npx wrangler deploy (from the worker/ directory)

import { AwsClient } from 'aws4fetch';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
    }

    const url = new URL(request.url);

    if (url.pathname === '/sign' && request.method === 'GET') {
      return handleSign(request, env, origin);
    }

    return new Response('Not Found', { status: 404 });
  },
};

async function handleSign(request, env, origin) {
  const url  = new URL(request.url);
  const key  = url.searchParams.get('key');
  const type = url.searchParams.get('type') || 'application/octet-stream';

  if (!key) {
    return new Response(JSON.stringify({ error: 'Missing key' }), { status: 400 });
  }

  const aws = new AwsClient({
    accessKeyId:     env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    region:          'auto',
    service:         's3',
  });

  // Build the R2 S3-compatible endpoint URL for this object
  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${key}`;
  const objectUrl = new URL(endpoint);
  objectUrl.searchParams.set('X-Amz-Expires', '300'); // 5-minute window

  // Sign the URL (query-string / presigned style)
  const signed = await aws.sign(
    new Request(objectUrl, {
      method: 'PUT',
      headers: { 'Content-Type': type },
    }),
    { aws: { signQuery: true } }
  );

  const publicUrl = `${env.R2_PUBLIC_URL}/${key}`;

  return new Response(
    JSON.stringify({ url: signed.url, publicUrl }),
    { headers: { 'Content-Type': 'application/json', ...corsHeaders(env, origin) } }
  );
}

function corsHeaders(env, origin) {
  const allowed = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin':  allowed === '*' ? '*' : origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
  };
}
