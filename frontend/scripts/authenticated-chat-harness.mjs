#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium, devices } = await loadPlaywright();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");

const config = {
  baseUrl: cleanBaseUrl(process.env.WEB_BASE_URL || "https://smyst.com"),
  apiBaseUrl: cleanBaseUrl(process.env.API_BASE_URL || process.env.WEB_BASE_URL || "https://smyst.com"),
  expectedProfiles: numberEnv("SMYST_EXPECTED_PROFILE_COUNT", 100),
  profileLimit: numberEnv("SMYST_PROFILE_LIMIT", 100),
  profileDelayMs: numberEnv("SMYST_PROFILE_DELAY_MS", 2200),
  messagesPerProfile: numberEnv("SMYST_MESSAGES_PER_PROFILE", 1),
  soakMinutes: numberEnv("SMYST_SOAK_MINUTES", 0),
  sessionCount: numberEnv("SMYST_BROWSER_SESSIONS", 1),
  maxRetries: numberEnv("SMYST_MAX_RETRIES", 2),
  maxStartP95Ms: numberEnv("SMYST_MAX_CHAT_START_P95_MS", 2500),
  maxAnswerP95Ms: numberEnv("SMYST_MAX_ANSWER_P95_MS", 3500),
  maxErrorRate: numberEnv("SMYST_MAX_ERROR_RATE", 0.01),
  outputDir: process.env.SMYST_HARNESS_OUTPUT_DIR || path.join(frontendRoot, "test-results"),
  storageStatePath: process.env.SMYST_AUTH_STORAGE_STATE || "",
  sessionCookie: process.env.SMYST_SESSION_COOKIE || process.env.SMYST_SESSION_VALUE || "",
  sessionCookieName: process.env.SMYST_SESSION_COOKIE_NAME || "smyst_session",
  interactiveLogin: process.env.SMYST_AUTH_INTERACTIVE_LOGIN === "1",
  headed: process.env.SMYST_HEADED === "1" || process.env.SMYST_AUTH_INTERACTIVE_LOGIN === "1",
};

const prompt = "Was ist heute fuer Nutzer besonders hilfreich?";
const longPrompt = "Fasse deine Perspektive kurz zusammen und gib einen konkreten naechsten Schritt.";

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});

async function main() {
  await mkdir(config.outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: !config.headed });
  const report = {
    startedAt: new Date().toISOString(),
    baseUrl: config.baseUrl,
    apiBaseUrl: config.apiBaseUrl,
    config: redactConfig(config),
    checks: {},
    sessions: [],
    profiles: [],
    timings: {
      chatStartMs: [],
      answerMs: [],
    },
    errors: [],
  };

  try {
    const contexts = [];
    for (let index = 0; index < config.sessionCount; index += 1) {
      const context = await newAuthenticatedContext(browser, index === 0 ? devices["Desktop Chrome"] : devices["Pixel 7"]);
      contexts.push(context);
      const page = await context.newPage();
      const auth = await checkAuth(page);
      report.sessions.push({ index, authenticated: auth.authenticated, user: auth.user ?? null });
      if (!auth.authenticated) {
        throw new Error(auth.message || "Authenticated Smyst session is required.");
      }
      await page.close();
    }

    report.checks.mobilePwa = await runMobilePwaCheck(contexts[contexts.length - 1]);

    const controlPage = await contexts[0].newPage();
    const profiles = await loadPublicProfiles(controlPage);
    report.checks.profileCount = profiles.length;
    if (profiles.length < config.expectedProfiles) {
      throw new Error(`Expected at least ${config.expectedProfiles} public profiles, got ${profiles.length}.`);
    }
    const selectedProfiles = profiles.slice(0, config.profileLimit);
    report.profiles = selectedProfiles.map((profile) => ({
      slug: profile.slug,
      name: profile.name,
      status: "pending",
    }));

    await exerciseProfiles(contexts, selectedProfiles, report);
    if (config.soakMinutes > 0) {
      await runSoak(contexts, selectedProfiles, report);
    }

    const summary = summarize(report);
    report.summary = summary;
    await persistReport(report);
    enforceThresholds(summary);
    printSummary(summary, report);
  } finally {
    await browser.close();
  }
}

async function newAuthenticatedContext(browser, device) {
  const options = {
    ...device,
    baseURL: config.baseUrl,
    ignoreHTTPSErrors: false,
  };

  if (config.storageStatePath) {
    const statePath = path.resolve(config.storageStatePath);
    if (!existsSync(statePath)) throw new Error(`SMYST_AUTH_STORAGE_STATE not found: ${statePath}`);
    options.storageState = statePath;
  }

  const context = await browser.newContext(options);
  if (config.sessionCookie) {
    const url = new URL(config.baseUrl);
    const cookieValue = cookieValueFromEnv(config.sessionCookie, config.sessionCookieName);
    await context.addCookies([{
      name: config.sessionCookieName,
      value: cookieValue,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "Strict",
    }]);
  }

  if (config.interactiveLogin) {
    const page = await context.newPage();
    await page.goto(`${config.baseUrl}/auth/github/start`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(async () => {
      const response = await fetch("/auth/me", { credentials: "include" });
      const body = await response.json();
      return Boolean(body.authenticated);
    }, null, { timeout: 180_000 });
    const statePath = path.join(config.outputDir, "smyst-auth-state.json");
    await context.storageState({ path: statePath });
    await page.close();
    console.log(`Saved authenticated storage state to ${statePath}`);
  }

  return context;
}

async function checkAuth(page) {
  await page.goto(config.baseUrl, { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    const response = await fetch("/auth/me", { credentials: "include" });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  });
  if (!result.ok || !result.body.authenticated) {
    return {
      authenticated: false,
      message: [
        "Authenticated Smyst session is required.",
        "Set SMYST_AUTH_STORAGE_STATE to a Playwright storage-state file,",
        "set SMYST_SESSION_COOKIE/SMYST_SESSION_VALUE, or run once with SMYST_AUTH_INTERACTIVE_LOGIN=1.",
      ].join(" "),
    };
  }
  return { authenticated: true, user: result.body.user ?? null };
}

async function runMobilePwaCheck(context) {
  const page = await context.newPage();
  await page.goto(config.baseUrl, { waitUntil: "networkidle" });
  const result = await page.evaluate(async () => {
    const manifestLink = document.querySelector('link[rel="manifest"]')?.getAttribute("href") || "/manifest.webmanifest";
    const manifestResponse = await fetch(manifestLink);
    const manifest = await manifestResponse.json();
    const swResponse = await fetch("/sw.js");
    let serviceWorkerReady = false;
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        serviceWorkerReady = Boolean(registration.active || registration.installing || registration.waiting);
      } catch {
        serviceWorkerReady = false;
      }
    }
    return {
      manifestOk: manifestResponse.ok,
      swOk: swResponse.ok,
      display: manifest.display,
      orientation: manifest.orientation,
      hasMaskableIcon: Array.isArray(manifest.icons) && manifest.icons.some((icon) => icon.purpose === "maskable"),
      serviceWorkerReady,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
  await page.close();
  if (!result.manifestOk || !result.swOk || result.display !== "standalone" || !result.hasMaskableIcon) {
    throw new Error(`Mobile/PWA check failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function loadPublicProfiles(page) {
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/public/twins", { credentials: "include" });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  });
  if (!result.ok) throw new Error(`/api/public/twins failed with ${result.status}`);
  const profiles = Array.isArray(result.body.twins) ? result.body.twins : [];
  return profiles
    .filter((profile) => profile && typeof profile.slug === "string" && typeof profile.name === "string")
    .map((profile) => ({ slug: profile.slug, name: profile.name }));
}

async function exerciseProfiles(contexts, profiles, report) {
  for (let index = 0; index < profiles.length; index += 1) {
    const context = contexts[index % contexts.length];
    const profile = profiles[index];
    await chatOnce(context, profile, report, `${prompt} Profilwechsel ${index + 1}.`);
    if (config.profileDelayMs > 0 && index < profiles.length - 1) await sleep(config.profileDelayMs);
  }
}

async function runSoak(contexts, profiles, report) {
  const endAt = Date.now() + config.soakMinutes * 60_000;
  let index = 0;
  while (Date.now() < endAt) {
    const context = contexts[index % contexts.length];
    const profile = profiles[index % profiles.length];
    const message = index % 3 === 0 ? longPrompt : `${prompt} Dauerlauf ${index + 1}.`;
    await chatOnce(context, profile, report, message);
    index += 1;
    if (config.profileDelayMs > 0) await sleep(config.profileDelayMs);
  }
}

async function chatOnce(context, profile, report, message) {
  const page = await context.newPage();
  const started = Date.now();
  try {
    const chatStart = await timedPost(page, "/api/chat/start", { twinId: profile.slug });
    report.timings.chatStartMs.push(chatStart.durationMs);
    if (!chatStart.ok) throw apiError("/api/chat/start", chatStart);

    const chatId = chatStart.body?.chat?.id;
    if (!chatId) throw new Error(`Missing chat id for ${profile.slug}`);

    for (let i = 0; i < config.messagesPerProfile; i += 1) {
      const answer = await timedPostWithRetries(page, "/api/chat/messages", {
        chatId,
        message: i === 0 ? message : `${longPrompt} Runde ${i + 1}.`,
      });
      report.timings.answerMs.push(answer.durationMs);
      if (!answer.ok) throw apiError("/api/chat/messages", answer);
      if (!answer.body?.message?.content) throw new Error(`Missing assistant content for ${profile.slug}`);
    }

    markProfile(report, profile.slug, {
      status: "ok",
      lastDurationMs: Date.now() - started,
    });
  } catch (error) {
    const detail = {
      profileSlug: profile.slug,
      profileName: profile.name,
      message: error instanceof Error ? error.message : String(error),
      at: new Date().toISOString(),
    };
    report.errors.push(detail);
    markProfile(report, profile.slug, {
      status: "failed",
      error: detail.message,
      lastDurationMs: Date.now() - started,
    });
  } finally {
    await page.close();
  }
}

async function timedPostWithRetries(page, endpoint, body) {
  let last;
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    last = await timedPost(page, endpoint, body);
    if (last.status !== 429) return last;
    const retryAfter = Number(last.headers["retry-after"] || "1");
    await sleep(Math.max(1000, retryAfter * 1000));
  }
  return last;
}

async function timedPost(page, endpoint, body) {
  return page.evaluate(async ({ endpoint, body }) => {
    const started = performance.now();
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-smyst-csrf": "1",
      },
      body: JSON.stringify(body),
    });
    const durationMs = performance.now() - started;
    const headers = Object.fromEntries(response.headers.entries());
    const payload = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, durationMs, headers, body: payload };
  }, { endpoint, body });
}

function apiError(endpoint, result) {
  const code = result.body?.error?.code || "unknown";
  const message = result.body?.error?.message || "API request failed";
  return new Error(`${endpoint} ${result.status} ${code}: ${message}`);
}

function markProfile(report, slug, patch) {
  const entry = report.profiles.find((profile) => profile.slug === slug);
  if (entry) Object.assign(entry, patch);
}

function summarize(report) {
  const totalProfileAttempts = report.profiles.filter((profile) => profile.status !== "pending").length;
  const failedProfileAttempts = report.profiles.filter((profile) => profile.status === "failed").length;
  const chatStarts = report.timings.chatStartMs;
  const answers = report.timings.answerMs;
  return {
    finishedAt: new Date().toISOString(),
    totalProfileAttempts,
    failedProfileAttempts,
    errorRate: totalProfileAttempts ? failedProfileAttempts / totalProfileAttempts : 1,
    chatStart: stats(chatStarts),
    answer: stats(answers),
    sessionStable: report.sessions.every((session) => session.authenticated),
    mobilePwaOk: Boolean(report.checks.mobilePwa),
  };
}

function enforceThresholds(summary) {
  const failures = [];
  if (!summary.sessionStable) failures.push("session stability failed");
  if (!summary.mobilePwaOk) failures.push("mobile/PWA check failed");
  if (summary.errorRate > config.maxErrorRate) {
    failures.push(`error rate ${formatPercent(summary.errorRate)} > ${formatPercent(config.maxErrorRate)}`);
  }
  if (summary.chatStart.p95 > config.maxStartP95Ms) {
    failures.push(`chat start p95 ${Math.round(summary.chatStart.p95)}ms > ${config.maxStartP95Ms}ms`);
  }
  if (summary.answer.p95 > config.maxAnswerP95Ms) {
    failures.push(`answer p95 ${Math.round(summary.answer.p95)}ms > ${config.maxAnswerP95Ms}ms`);
  }
  if (failures.length) throw new Error(`Harness thresholds failed: ${failures.join("; ")}`);
}

async function persistReport(report) {
  const stamp = report.startedAt.replace(/[:.]/g, "-");
  const file = path.join(config.outputDir, `authenticated-chat-harness-${stamp}.json`);
  report.reportFile = file;
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function printSummary(summary, report) {
  console.log("Smyst authenticated chat harness passed");
  console.log(`Profiles: ${summary.totalProfileAttempts}, failed: ${summary.failedProfileAttempts}, error rate: ${formatPercent(summary.errorRate)}`);
  console.log(`Chat start p95: ${Math.round(summary.chatStart.p95)}ms, answer p95: ${Math.round(summary.answer.p95)}ms`);
  console.log(`Report: ${report.reportFile}`);
}

function stats(values) {
  if (!values.length) return { count: 0, min: 0, median: 0, p95: 0, max: 0, avg: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1],
    avg: sum / sorted.length,
  };
}

function percentile(sorted, p) {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function cleanBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function numberEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
  return value;
}

function cookieValueFromEnv(raw, name) {
  const trimmed = raw.trim();
  const match = trimmed.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return decodeURIComponent(match ? match[1] : trimmed);
}

function redactConfig(value) {
  return {
    ...value,
    sessionCookie: value.sessionCookie ? "[set]" : "",
  };
}

function formatPercent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (firstError) {
    if (process.env.PLAYWRIGHT_MODULE_PATH) {
      const modulePath = path.resolve(process.env.PLAYWRIGHT_MODULE_PATH);
      const importPath = existsSync(path.join(modulePath, "index.mjs"))
        ? path.join(modulePath, "index.mjs")
        : modulePath;
      return import(pathToFileURL(importPath).href);
    }
    try {
      return await import("@playwright/test");
    } catch {
      throw firstError;
    }
  }
}
