#!/usr/bin/env node

import fs from 'node:fs';
import dns from 'node:dns/promises';
import os from 'node:os';
import path from 'node:path';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '186363805f9fc571fd16528a1ed7c52d';
const zoneId = process.env.CLOUDFLARE_ZONE_ID || 'df5ecb63a31ec80ac5eb8c74d2703bd4';
const projectName = process.env.CLOUDFLARE_PAGES_PROJECT || 'smyst-app';
const pagesTarget = process.env.CLOUDFLARE_PAGES_TARGET || 'smyst-app-67m.pages.dev';
const subdomains = (process.env.SMYST_SUBDOMAINS || 'app.smyst.com,cdn.smyst.com,media.smyst.com,assets.smyst.com,admin.smyst.com,backup.smyst.com')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function readWranglerToken() {
  const configPath = path.join(os.homedir(), 'Library/Preferences/.wrangler/config/default.toml');
  if (!fs.existsSync(configPath)) return '';
  const text = fs.readFileSync(configPath, 'utf8');
  return text.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1] || text.match(/api_token\s*=\s*"([^"]+)"/)?.[1] || '';
}

const token = process.env.CLOUDFLARE_API_TOKEN || readWranglerToken();

if (!token) {
  console.error('Missing CLOUDFLARE_API_TOKEN and no Wrangler OAuth token was found.');
  process.exit(1);
}

async function cloudflare(pathname, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function ensurePagesDomain(name) {
  const list = await cloudflare(`/accounts/${accountId}/pages/projects/${projectName}/domains`);
  const existing = list.body.result?.find((domain) => domain.name === name);
  if (existing) return { action: 'exists', domain: existing };

  const created = await cloudflare(`/accounts/${accountId}/pages/projects/${projectName}/domains`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  if (!created.body.success) {
    return { action: 'failed', error: created.body.errors || [{ message: `HTTP ${created.response.status}` }] };
  }
  return { action: 'created', domain: created.body.result };
}

async function ensureDnsRecord(name) {
  const recordName = name.replace(/\.smyst\.com$/, '');
  const query = new URLSearchParams({ type: 'CNAME', name }).toString();
  const list = await cloudflare(`/zones/${zoneId}/dns_records?${query}`);
  if (!list.body.success) {
    return verifyDnsResolution(name, list.body.errors);
  }
  const existing = list.body.result?.find((record) => record.name === name);
  if (existing) {
    if (existing.content === pagesTarget && existing.proxied === true) {
      return { action: 'exists', record: existing };
    }
    const updated = await cloudflare(`/zones/${zoneId}/dns_records/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ type: 'CNAME', name: recordName, content: pagesTarget, proxied: true }),
    });
    if (!updated.body.success) return { action: 'failed', error: updated.body.errors };
    return { action: 'updated', record: updated.body.result };
  }

  const created = await cloudflare(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify({ type: 'CNAME', name: recordName, content: pagesTarget, proxied: true }),
  });
  if (!created.body.success) {
    return { action: 'failed', error: created.body.errors || [{ message: `HTTP ${created.response.status}` }] };
  }
  return { action: 'created', record: created.body.result };
}

async function verifyDnsResolution(name, apiErrors = []) {
  const resolver = new dns.Resolver();
  resolver.setServers(['108.162.194.24', '162.159.38.24', '172.64.34.24']);
  try {
    const addresses = await resolver.resolve4(name);
    if (addresses.length > 0) {
      return {
        action: 'verified-authoritative-dns',
        record: { content: addresses.join(','), proxied: true },
        warning: apiErrors?.map((item) => item.message).join('; '),
      };
    }
  } catch (error) {
    return {
      action: 'failed',
      error: apiErrors?.length ? apiErrors : [{ message: error.message }],
    };
  }
  return { action: 'failed', error: apiErrors || [{ message: 'No authoritative DNS response' }] };
}

const summary = [];

for (const name of subdomains) {
  const pages = await ensurePagesDomain(name);
  const dns = await ensureDnsRecord(name);
  summary.push({
    name,
    pages: {
      action: pages.action,
      status: pages.domain?.status,
      verification: pages.domain?.verification_data?.status,
      error: pages.error?.map((item) => item.message).join('; '),
    },
    dns: {
      action: dns.action,
      content: dns.record?.content,
      proxied: dns.record?.proxied,
      warning: dns.warning,
      error: dns.error?.map((item) => item.message).join('; '),
    },
  });
}

const ok = summary.every((item) => item.dns.action !== 'failed');
console.log(JSON.stringify({ ok, projectName, pagesTarget, summary }, null, 2));
if (!ok) process.exitCode = 1;
