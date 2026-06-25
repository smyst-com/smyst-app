#!/usr/bin/env node

import crypto from 'node:crypto';

const required = [
  'PUBLIC_BASE_URL',
  'AUTH_PUBLIC_BASE_URL',
  'CORS_ORIGINS',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REDIRECT_URI',
  'AUTH_SESSION_SECRET',
  'SMYST_OWNER_EMAILS',
];

const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error(`missing auth production env: ${missing.join(', ')}`);
  process.exit(1);
}

const expected = {
  PUBLIC_BASE_URL: 'https://smyst.com',
  AUTH_PUBLIC_BASE_URL: 'https://api.smyst.com',
  GOOGLE_OAUTH_REDIRECT_URI: 'https://api.smyst.com/auth/google/callback',
};

const mismatches = Object.entries(expected).filter(([key, value]) => process.env[key] !== value);
if (mismatches.length) {
  console.error(`invalid auth production env: ${mismatches.map(([key]) => key).join(', ')}`);
  process.exit(1);
}

if (!process.env.CORS_ORIGINS.split(',').map((item) => item.trim()).includes('https://smyst.com')) {
  console.error('invalid auth production env: CORS_ORIGINS must include https://smyst.com');
  process.exit(1);
}

const secretBytes = Buffer.byteLength(process.env.AUTH_SESSION_SECRET, 'utf8');
if (secretBytes < 32) {
  console.error('invalid auth production env: AUTH_SESSION_SECRET must be at least 32 bytes');
  process.exit(1);
}

const secretFingerprint = crypto
  .createHash('sha256')
  .update(process.env.GOOGLE_OAUTH_CLIENT_SECRET, 'utf8')
  .digest('hex')
  .slice(0, 12);

console.log(`auth production env check passed; google secret fingerprint=${secretFingerprint}`);
