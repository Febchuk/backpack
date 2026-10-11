// Copies human-approved Gemini art from the staging dir art/gemini/ over
// apps/game/public/assets/. Never run automatically: review art/gemini/contact.png first.
//
//   pnpm exec tsx scripts/assets/promote-gemini.ts <key> [<key>...]   # e.g. airport_bg npc_clerk
//   pnpm exec tsx scripts/assets/promote-gemini.ts --all
//
// The game manifest is not rewritten: staging files use the same file names as the game manifest.
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { decodePng, pngSize } from "../gemini/image";
import { REPO } from "../gemini/prompts";

const STAGING = join(REPO, "art/gemini");
const ASSETS = join(REPO, "apps/game/public/assets");
const BG_KEYS = /_bg$/;

const args = process.argv.slice(2);
if (!args.length) {
  console.error("usage: promote-gemini.ts <key> [<key>...] | --all");
  process.exit(2);
}

const game = (JSON.parse(readFileSync(join(ASSETS, "manifest.json"), "utf8")) as { images: Record<string, string> }).images;
let staged: Record<string, string> = {};
try {
  staged = (JSON.parse(readFileSync(join(STAGING, "manifest.json"), "utf8")) as { images: Record<string, string> }).images;
} catch {
  console.error(`no ${STAGING}/manifest.json: run scripts/assets/gen-gemini.ts first`);
  process.exit(1);
}

const keys = args.includes("--all") ? Object.keys(staged) : args;
const problems: string[] = [];
for (const k of keys) {
  if (!game[k]) problems.push(`${k}: not in the game manifest`);
  else if (!staged[k] || !existsSync(join(STAGING, staged[k]))) problems.push(`${k}: not in staging`);
  else if (staged[k] !== game[k]) problems.push(`${k}: staging file ${staged[k]} != game file ${game[k]}`);
  else {
    const buf = readFileSync(join(STAGING, staged[k]));
    const { w, h } = pngSize(buf);
    const [ew, eh] = BG_KEYS.test(k) ? [960, 540] : [32, 32];
    if (w !== ew || h !== eh) problems.push(`${k}: ${w}x${h}, expected ${ew}x${eh}`);
    else if (BG_KEYS.test(k)) {
      const { data } = decodePng(buf);
      for (let i = 3; i < data.length; i += 4)
        if (data[i] !== 255) {
          problems.push(`${k}: background has transparent pixels`);
          break;
        }
    }
  }
}
if (problems.length) {
  console.error(`nothing promoted:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
for (const k of keys) {
  copyFileSync(join(STAGING, staged[k]), join(ASSETS, game[k]));
  console.log(`promoted ${k} → apps/game/public/assets/${game[k]}`);
}
console.log("Now run: pnpm exec vitest run tests/level1/assets.test.ts");
