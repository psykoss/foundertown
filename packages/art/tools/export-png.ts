import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(toolsDir, "../out/preview.png");
const comparisonPath = resolve(
  toolsDir,
  "../../../docs/references/native/comparison.png",
);
const avatarPath = resolve(toolsDir, "../out/avatar-compare.png");
const gridPath = resolve(toolsDir, "../out/avatar-grid.png");
mkdirSync(dirname(outPath), { recursive: true });

const server = await createServer({
  configFile: false,
  root: join(toolsDir, "preview"),
  logLevel: "error",
});

try {
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("The preview server did not report a URL");

  // Uses the installed Chrome, so no separate browser download is needed.
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({
      viewport: { width: 1420, height: 800 },
    });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(url);
    await page
      .waitForSelector("body[data-ready]", { timeout: 15000 })
      .catch(() => undefined);
    if (pageErrors.length > 0) {
      throw new Error(`The preview page failed:\n${pageErrors.join("\n")}`);
    }
    await page.screenshot({ path: outPath, fullPage: true });
    await page.locator("#comparison").screenshot({ path: comparisonPath });
    await page.locator("#avatar-compare").screenshot({ path: avatarPath });
    console.log(outPath);
    console.log(comparisonPath);
    await page.locator("#avatar-grid").screenshot({ path: gridPath });
    console.log(avatarPath);
    console.log(gridPath);
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
