import { expect, test } from "@playwright/test";

test.describe("Smyst current app", () => {
  test("start page search, name picker and composer match the current square chat UI", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("smyst")).toBeVisible();
    await expect(page.getByText("Create Your AI Twin")).toBeVisible();
    await expect(page.getByPlaceholder("Name suchen")).toBeVisible();
    await expect(page.getByRole("button", { name: "Name wählen" })).toBeVisible();
    await expect(page.getByPlaceholder("Nachricht schreiben")).toBeVisible();

    await page.getByRole("button", { name: "Name wählen" }).click();
    await expect(page.getByRole("button", { name: /Max Müller/i })).toBeVisible();
    await expect(page.getByText(/\d+ Namen/)).toBeVisible();

    await page.getByPlaceholder("Name suchen").fill("Weber");
    await expect(page.getByRole("button", { name: /Max Weber/i })).toBeVisible();
    await page.getByRole("button", { name: /Max Weber/i }).click();

    await expect(page.getByText("Max Weber").first()).toBeVisible();
    await expect(page.getByPlaceholder("Nachricht schreiben")).toBeVisible();

    await page.getByPlaceholder("Nachricht schreiben").fill("Hallo, das ist ein aktueller UI-Test.");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Hallo, das ist ein aktueller UI-Test.")).toBeVisible();
  });

  test("settings expose free-only infrastructure and name sorting controls", async ({ page }) => {
    await page.goto("/settings");

    await expect(page.getByText("Infrastruktur-Regeln")).toBeVisible();
    await expect(page.getByText(/Cloudflare Free/i)).toBeVisible();
    await expect(page.getByText(/IDrive e2/i)).toBeVisible();
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
