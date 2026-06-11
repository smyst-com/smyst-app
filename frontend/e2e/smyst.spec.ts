import { expect, test } from "@playwright/test";

test.describe("Smyst frontend", () => {
  test("localized start page, twin selection, chat, profile and creator render", async ({ page }) => {
    await page.goto("/de");

    await expect(page.getByRole("heading", { name: "Smyst AI Twins" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Twins/i })).toBeVisible();
    await expect(page.getByText("Twin-Auswahl")).toBeVisible();
    await expect(page.getByText("Chat UI")).toBeVisible();
    await expect(page.getByText("Profile")).toBeVisible();
    await expect(page.getByText("Leonardo da Vinci Demo Twin")).toBeVisible();
    await page.getByRole("button", { name: /Leonardo da Vinci Demo Twin/i }).click();
    await expect(page.getByText("Public facts only")).toBeVisible();
    await expect(page.getByText("Encyclopaedia Britannica")).toBeVisible();
    await expect(page.getByText("must never claim to be the real Leonardo da Vinci")).toBeVisible();

    await page.getByRole("button", { name: "Creator" }).click();
    await expect(page.getByText("Twin Creator")).toBeVisible();

    await page.getByPlaceholder("Frage den ausgewaehlten Twin...").fill("Was ist wichtig?");
    await page.getByRole("button", { name: "Senden" }).click();
    await expect(page.getByText("Was ist wichtig?")).toBeVisible();
  });

  test("pwa assets and seo endpoints are available", async ({ page, request }) => {
    await page.goto("/en");

    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBeTruthy();
    expect(await manifest.json()).toMatchObject({
      name: "Smyst",
      display: "standalone",
    });

    const serviceWorker = await request.get("/sw.js");
    expect(serviceWorker.ok()).toBeTruthy();
    expect(await serviceWorker.text()).toContain("smyst-shell-v1");

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();

    const robots = await request.get("/robots.txt");
    expect(robots.ok()).toBeTruthy();
  });
});
