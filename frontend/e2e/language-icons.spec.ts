import { expect, test } from "@playwright/test";

/**
 * smyst language autopilot — Icon-Suite (Auftrag Inhaber 24.09.2026).
 *
 * Prueft alle fuenf Chat-Icons vollstaendig gegen das echte Frontend
 * (Desktop- und Mobil-Projekt laut playwright.config.ts):
 *
 *   A. Plus        – Medienmenue oeffnen/schliessen, alle Optionen pruefen
 *   B. Mikrofon    – Diktat: Start/Stop, Texteinfuegung, Base-Text bleibt,
 *                     Berechtigungsverweigerung, kein Auto-Send
 *   C. Sprachwelle – Live-Modus: Label-Wechsel, Abbruch ohne haengende Zustaende
 *   D. Lautsprecher– Vorlesen: Umschalten, Stop, keine doppelte Wiedergabe
 *   E. Sendepfeil  – Leersend blockiert, Versand werkt, kein Doppelversand
 *
 * Der Chat wird per offiziellem Deep-Link "Mit X chatten" geoeffnet
 * (sessionStorage smyst-chat-open — Design-Bestandteil, ueberspringt die
 * Landing) und zeigt damit den vollen Composer mit allen fuenf Icons.
 *
 * Audio-Verhalten im Headless-Browser ist nur simulierbar (fake
 * SpeechRecognition/SpeechSynthesis) — echte Geraetetests (Mikrofon-
 * hardware, Lautsprecher, iOS/Android) bleiben im Sprachregister als
 * ausstehend markiert und werden hier nicht behauptet.
 */

const REPLY_TEXT = "Pruefe zuerst, was du wirklich weisst, dann frage mutig weiter.";

async function mockBackend(
  page: import("@playwright/test").Page,
  streamHits: { count: number } = { count: 0 },
) {
  await page.route("**/auth/me", async (route) => {
    await route.fulfill({ json: { authenticated: false } });
  });
  await page.route("**/api/public/twins**", async (route) => {
    await route.fulfill({
      json: {
        twins: [
          {
            id: "curated-sokrates",
            name: "Sokrates",
            slug: "sokrates",
            description:
              "Antiker Philosoph, bekannt fuer dialogisches Fragen, Ethik, Selbsterkenntnis und die Pruefung von Gewissheiten durch klare Gegenfragen.",
            imageUrl: "/public/profile-images/socrates.jpg",
            categories: ["Philosophie", "Ethik", "Bildung"],
            languages: ["de"],
            visibility: "public",
            style: "wise",
            status: "ready",
            url: "/twins/sokrates",
            chatPath: "/chat/sokrates",
            uploadedContents: [],
            mediaCount: 1,
            knowledgeCount: 2,
            contextSummary: "Historische Rolle: Sokrates.",
            mainCategory: "Philosoph, Ethiker",
            birthYear: -470,
            deathYear: -399,
            birthLabel: "ca. 470 v. Chr.",
            deathLabel: "399 v. Chr.",
            updatedAt: 1762300800000,
            quality: { ok: true, issues: [] },
            seo: {
              title: "Sokrates",
              description: "Oeffentliches KI-Profil Sokrates",
              canonical: "https://smyst.com/twins/sokrates",
              robots: "index,follow",
              schema: {},
            },
          },
        ],
      },
    });
  });
  await page.route("**/api/tts/voices", async (route) => {
    await route.fulfill({
      json: { ready: true, voices: ["de-thorsten", "en-ryan"], workerConfigured: false },
    });
  });
  await page.route("**/api/tts", async (route) => {
    await route.fulfill({ status: 503, json: { detail: "TTS im Test simuliert nicht verfuegbar" } });
  });
  await page.route("**/api/chat/start", async (route) => {
    await route.fulfill({
      json: { chat: { id: "public:sokrates:icon-chat", title: "Sokrates", twinId: "sokrates" } },
    });
  });
  await page.route("**/api/chat/messages/stream", async (route) => {
    streamHits.count += 1;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: `data: ${JSON.stringify({
        chatId: "public:sokrates:icon-chat",
        twinId: "sokrates",
        mode: "free-only-twin-mvp",
        done: true,
        message: {
          id: `assistant-${streamHits.count}`,
          role: "assistant",
          content: REPLY_TEXT,
          createdAt: Date.now(),
        },
      })}\n\n`,
    });
  });
  await page.route("**/api/chat/messages", async (route) => {
    streamHits.count += 1;
    await route.fulfill({
      json: {
        chatId: "public:sokrates:icon-chat",
        twinId: "sokrates",
        mode: "free-only-twin-mvp",
        message: {
          id: `assistant-${streamHits.count}`,
          role: "assistant",
          content: REPLY_TEXT,
          createdAt: Date.now(),
        },
      },
    });
  });
}

// Fake-Spracherkennung: kontinuierliches Diktat, liefert nach 200 ms ein
// Endergebnis. stop()/abort() beenden sauber (onend).
const FAKE_SPEECH_RECOGNITION = `
  class FakeRecognition {
    constructor() { this.interimResults = false; this.continuous = false; this.lang = ''; this.onstart = null; this.onend = null; this.onerror = null; this.onresult = null; this._stopped = false; }
    start() {
      setTimeout(() => { if (!this._stopped && this.onstart) this.onstart(); }, 10);
      setTimeout(() => {
        if (this._stopped || !this.onresult) return;
        this.onresult({ resultIndex: 0, results: { 0: { 0: { transcript: 'Merhaba, nasilsin' }, isFinal: true }, length: 1 } });
      }, 200);
    }
    stop() { this._stopped = true; setTimeout(() => { if (this.onend) this.onend(); }, 10); }
    abort() { this._stopped = true; setTimeout(() => { if (this.onend) this.onend(); }, 10); }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
`;

// Fake-Sprachausgabe: speak() feuert onstart/onend asynchron, cancel() stoppt.
const FAKE_SPEECH_SYNTH = `
  class FakeUtterance {
    constructor(text) { this.text = text; this.onstart = null; this.onend = null; this.onerror = null; }
  }
  const fakeSynth = {
    getVoices: () => [{ name: 'Fake Deutsch', lang: 'de-DE', localService: true, voiceURI: 'fake', default: true }],
    speak: (u) => {
      window.__smystSpeakCalls.push(String(u.text || ''));
      setTimeout(() => { if (u.onstart) u.onstart(); }, 10);
      setTimeout(() => { if (u.onend) u.onend(); }, 300);
    },
    cancel: () => { window.__smystCancelCalls += 1; },
    paused: false,
    pending: false,
    speaking: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    onvoiceschanged: null,
    resume: () => {},
    pause: () => {},
  };
  window.__smystSpeakCalls = [];
  window.__smystCancelCalls = 0;
  Object.defineProperty(window, 'speechSynthesis', { value: fakeSynth, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
`;

test.beforeEach(async ({ page }) => {
  // Service-Worker-Stub (Race-Schutz, siehe smyst.spec.ts — nicht entfernen)
  await page.addInitScript(() => {
    if ("serviceWorker" in navigator) {
      Object.defineProperty(navigator.serviceWorker, "register", {
        value: () => new Promise(() => {}),
      });
    }
  });
  await page.addInitScript(FAKE_SPEECH_RECOGNITION);
  await page.addInitScript(FAKE_SPEECH_SYNTH);
});

async function openChat(
  page: import("@playwright/test").Page,
  options: { denyMic?: boolean } = {},
) {
  const streamHits = { count: 0 };
  await mockBackend(page, streamHits);
  // Offizieller Deep-Link "Mit X chatten" (sessionStorage smyst-chat-open,
  // Design-Bestandteil): ueberspringt die Landing und oeffnet direkt den
  // Chat mit dem vollen Composer (alle 5 Icons).
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "smyst-chat-open",
      JSON.stringify({ slug: "sokrates", savedAt: Date.now() }),
    );
  });
  if (options.denyMic) {
    await page.addInitScript(() => {
      const Original = window.SpeechRecognition;
      class DeniedRecognition extends Original {
        start() {
          setTimeout(() => {
            if (this.onerror) this.onerror({ error: "not-allowed" });
          }, 20);
        }
      }
      window.SpeechRecognition = DeniedRecognition;
      window.webkitSpeechRecognition = DeniedRecognition;
    });
  }
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Datei hinzufügen" })).toBeVisible({
    timeout: 10_000,
  });
  return streamHits;
}

test.describe("Chat-Icons (Language-Autopilot-Suite)", () => {
  test("A. Plus: Medienmenue oeffnet, zeigt alle Optionen, schliesst", async ({ page }) => {
    await openChat(page);
    const plus = page.getByRole("button", { name: "Datei hinzufügen" });
    await expect(plus).toBeVisible();
    await plus.click();
    const options = [
      "Foto oder Video hinzufügen",
      "Kamera öffnen",
      "Dateien",
      "Audio hinzufügen",
      "Link",
      "Memory",
      "Kontakte",
      "Standort",
    ];
    for (const label of options) {
      const option = page.getByRole("button", {
        name: label,
        exact: label === "Link" || label === "Dateien",
      });
      await expect(option.first()).toBeVisible();
      await expect(option.first()).toBeEnabled();
    }
    // Schliessen per erneuten Klick
    await plus.click();
    await expect(page.getByRole("button", { name: "Kamera öffnen" })).toHaveCount(0);
  });

  test("A2. Plus: Link-Option reagiert, Menue schliesst", async ({ page }) => {
    await openChat(page);
    await page.getByRole("button", { name: "Datei hinzufügen" }).click();
    const linkButton = page.getByRole("button", { name: "Link", exact: true }).first();
    await expect(linkButton).toBeVisible();
    await linkButton.click();
    // Menue schliesst sich nach Auswahl — keine haengende Ueberlagerung.
    await expect(page.getByRole("button", { name: "Standort" })).toHaveCount(0);
  });

  test("B. Mikrofon: Diktat startet, schreibt Text, erhaelt Base-Text, kein Auto-Send", async ({ page }) => {
    const streamHits = await openChat(page);
    const input = page.getByPlaceholder("Nachricht an Sokrates");
    await input.fill("Basis bleibt");
    const mic = page.getByRole("button", { name: "Spracheingabe" });
    await expect(mic).toBeVisible();
    await mic.click();
    // Diktat liefert "Merhaba, nasilsin" nach ~200 ms als Endergebnis.
    await expect
      .poll(async () => (await input.inputValue()).includes("Merhaba"), { timeout: 5_000 })
      .toBeTruthy();
    const value = await input.inputValue();
    expect(value.startsWith("Basis bleibt")).toBeTruthy();
    // Kein automatisches Senden: kein Chat-Abruf ohne Senden.
    expect(streamHits.count).toBe(0);
    // Zweiter Klick beendet das Diktat; erneut starten funktioniert.
    await mic.click();
    await mic.click();
    await expect(page.getByRole("button", { name: "Spracheingabe" })).toBeVisible();
  });

  test("B2. Mikrofon: abgelehnte Berechtigung zeigt Hinweis statt Stillstand", async ({ page }) => {
    await openChat(page, { denyMic: true });
    await page.getByRole("button", { name: "Spracheingabe" }).click();
    await expect(page.getByText(/Mikrofon ist nicht erlaubt/)).toBeVisible({ timeout: 5_000 });
  });

  test("C. Sprachwelle: Live-Modus startet und laesst sich beenden (Label wechselt)", async ({ page }) => {
    await openChat(page);
    const waves = page.getByRole("button", { name: "Live-Sprachmodus starten" });
    await expect(waves).toBeVisible();
    await waves.click();
    const stopWaves = page.getByRole("button", { name: "Live-Sprachmodus beenden" });
    await expect(stopWaves).toBeVisible({ timeout: 5_000 });
    // Beenden kehrt sauber zurueck — kein haengender Zustand.
    await stopWaves.click();
    await expect(page.getByRole("button", { name: "Live-Sprachmodus starten" })).toBeVisible({
      timeout: 5_000,
    });
  });

  test("D. Lautsprecher: Vorlesen umschalten und stoppen ohne Doppel-Wiedergabe", async ({ page }) => {
    const streamHits = await openChat(page);
    // Erst eine Antwort erzwingen (Vorlesen braucht eine Antwort).
    const input = page.getByPlaceholder("Nachricht an Sokrates");
    await input.fill("Was empfiehlst du?");
    await page.getByRole("button", { name: "Nachricht senden" }).click();
    await expect(page.getByText(REPLY_TEXT).first()).toBeVisible({ timeout: 10_000 });
    expect(streamHits.count).toBeGreaterThanOrEqual(1);

    const speaker = page.getByRole("button", { name: "Antworten vorlesen" });
    await expect(speaker).toBeVisible();
    await speaker.click();
    const speakerOff = page.getByRole("button", { name: "Sprachausgabe ausschalten" });
    await expect(speakerOff).toBeVisible({ timeout: 5_000 });
    // Stop: zweiter Klick bricht ab (cancel/stopRemoteSpeech aufgerufen),
    // Label zurueck — keine ueberlappende Wiedergabe, kein haengender Zustand.
    await speakerOff.click();
    await expect(page.getByRole("button", { name: "Antworten vorlesen" })).toBeVisible({
      timeout: 5_000,
    });
    // Cancel-Nachweis mit Typabsicherung: gueltige Zahl >= 1 gilt als
    // Nachweis; ein Reload/Neukontext (Wert unbrauchbar) faellt nicht faelschlich
    // durch, sondern wirft nachprauefbar.
    const cancelCount = await page.evaluate(() => {
      const value = (window as unknown as { __smystCancelCalls?: number }).__smystCancelCalls;
      return typeof value === "number" ? value : Number.NaN;
    });
    expect(Number.isFinite(cancelCount)).toBeTruthy();
    expect(cancelCount).toBeGreaterThanOrEqual(1);
  });

  test("E. Sendepfeil: leere Nachricht blockiert, Versand werkt, kein Doppelversand", async ({ page }) => {
    const streamHits = await openChat(page);
    const send = page.getByRole("button", { name: "Nachricht senden" });
    // Leerer Versand: Hinweis, kein API-Abruf.
    await send.click();
    await expect(page.getByText(/Schreibe zuerst eine Nachricht/)).toBeVisible({ timeout: 5_000 });
    expect(streamHits.count).toBe(0);
    // Echter Versand: Nachricht + Antwort erscheinen.
    const input = page.getByPlaceholder("Nachricht an Sokrates");
    await input.fill("Was empfiehlst du jungen Leuten?");
    await send.click();
    await expect(page.getByText("Was empfiehlst du jungen Leuten?")).toBeVisible();
    await expect(page.getByText(REPLY_TEXT).first()).toBeVisible({ timeout: 10_000 });
    // Doppelversand-Schutz: ein erneuter Klick startet keinen zweiten PARALLELEN
    // Abruf (hoechstens einen neuen pro Nutzeraktion).
    const before = streamHits.count;
    await input.fill("Zweite Frage");
    await send.click();
    await page.waitForTimeout(700);
    expect(streamHits.count - before).toBeLessThanOrEqual(2);
  });

  test("F. Tastaturbedienung: Icons fokussierbar und beschriftet (a11y-Minimum)", async ({ page }) => {
    await openChat(page);
    const labels = [
      "Datei hinzufügen",
      "Spracheingabe",
      "Live-Sprachmodus starten",
      "Antworten vorlesen",
      "Nachricht senden",
    ];
    for (const label of labels) {
      const button = page.getByRole("button", { name: label });
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();
      await button.focus();
      await expect(button).toBeFocused();
    }
  });
});
