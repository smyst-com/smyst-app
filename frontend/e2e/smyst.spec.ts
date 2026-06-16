import { expect, test } from "@playwright/test";

test.describe("Smyst current app", () => {
  test("start page lets signed-out users chat with public historical profiles", async ({ page }) => {
    await page.route("**/auth/me", async (route) => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route("**/api/public/twins", async (route) => {
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
    await page.route("**/api/chat/start", async (route) => {
      await route.fulfill({
        json: {
          chat: {
            id: "public:sokrates:test-chat",
            title: "Chat mit Sokrates",
            publicTwinSlug: "sokrates",
            transient: true,
          },
        },
      });
    });
    await page.route("**/api/chat/messages", async (route) => {
      await route.fulfill({
        json: {
          chatId: "public:sokrates:test-chat",
          twinId: "sokrates",
          mode: "free-only-twin-mvp",
          message: {
            id: "assistant-1",
            role: "assistant",
            content: "Pruefe zuerst, was du wirklich weisst, und frage dann mutig weiter.",
            createdAt: Date.now(),
          },
        },
      });
    });

    await page.goto("/");

    await expect(page.getByText("smyst")).toBeVisible();
    await expect(page.getByText("Create Your AI Twin")).toBeVisible();
    await expect(page.getByPlaceholder("Profil suchen")).toBeVisible();
    await expect(page.getByRole("button", { name: "Profil wählen" })).toBeVisible();
    await expect(page.getByPlaceholder("Nachricht schreiben")).toBeVisible();

    await page.getByRole("button", { name: "Profil wählen" }).click();
    await expect(page.getByText("Sokrates")).toBeVisible();
    await expect(page.getByText(/Max Müller/i)).toHaveCount(0);
    await expect(page.getByText(/Max Weber/i)).toHaveCount(0);
    await page.getByText("Sokrates").click();

    await page.getByPlaceholder("Nachricht schreiben").fill("Was empfiehlst du jungen Leuten?");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Was empfiehlst du jungen Leuten?")).toBeVisible();
    await expect(page.getByText("Melde dich an, um den Chat mit diesem echten KI-Profil zu starten")).toHaveCount(0);
    await expect(page.getByText(/Pruefe zuerst, was du wirklich weisst/i)).toBeVisible();
  });

  test("settings expose profile sorting controls without infrastructure marketing", async ({ page }) => {
    await page.goto("/settings");

    await expect(page.getByText("Infrastruktur-Regeln")).toHaveCount(0);
    await expect(page.getByText(/Cloudflare Free/i)).toHaveCount(0);
    await expect(page.getByText(/IDrive e2/i)).toHaveCount(0);
    await expect(page.getByText("Namenliste")).toBeVisible();
    await expect(page.getByRole("button", { name: /Mehr genutzt/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Trend im Markt/i })).toBeVisible();
  });

  test("pwa, seo and api endpoints return assets or JSON instead of app HTML", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBeTruthy();
    const manifestJson = await manifest.json();
    expect(manifestJson).toMatchObject({
      name: "smyst.com",
      display: "standalone",
      orientation: "portrait-primary",
    });
    expect(manifestJson.icons.some((icon: { src?: string; sizes?: string }) => icon.src === "/icons/icon-512.png" && icon.sizes === "512x512")).toBeTruthy();
    expect(manifestJson.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBeTruthy();
    expect(manifestJson.screenshots.some((shot: { form_factor?: string }) => shot.form_factor === "narrow")).toBeTruthy();

    for (const path of [
      "/sw.js",
      "/logo.svg",
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/maskable-512.png",
      "/apple-touch-icon.png",
      "/screenshots/smyst-mobile.png",
      "/screenshots/smyst-desktop.png",
      "/og-image.png",
      "/sitemap.xml",
      "/robots.txt",
      "/llms.txt",
      "/ai.txt",
    ]) {
      const response = await request.get(path);
      expect(response.ok(), `${path} should be reachable`).toBeTruthy();
    }

    const health = await request.get("/api/health");
    expect(health.ok()).toBeTruthy();
    expect(health.headers()["content-type"]).toContain("application/json");
    await expect(health).toBeOK();

    const auth = await request.get("/auth/me");
    expect(auth.ok()).toBeTruthy();
    expect(auth.headers()["content-type"]).toContain("application/json");

    const twins = await request.get("/api/twins");
    expect(twins.status()).toBe(401);
    expect(twins.headers()["content-type"]).toContain("application/json");

    const upload = await request.post("/storage/upload-url");
    expect(upload.status()).toBe(403);
    expect(upload.headers()["content-type"]).toContain("application/json");
  });
});
