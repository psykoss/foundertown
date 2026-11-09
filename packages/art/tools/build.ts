import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { buildAtlases } from "./lib/atlases";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolsDir, "../../..");
const outDir = join(repoRoot, "apps/client/public/assets");

mkdirSync(outDir, { recursive: true });

for (const [name, { image, json }] of Object.entries(buildAtlases())) {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  const imagePath = join(outDir, `${name}.png`);
  writeFileSync(imagePath, PNG.sync.write(png));
  writeFileSync(
    join(outDir, `${name}.json`),
    `${JSON.stringify(json, null, 2)}\n`,
  );
  const frameCount = Object.keys(json.frames).length;
  console.log(
    `${relative(repoRoot, imagePath)}: ${image.width}x${image.height}, ${frameCount} frames`,
  );
}
