// Level 2 art: generates every image in the game manifest with Gemini from the
// templates in docs/STYLE_PROMPT.md, post-processes it to spec, and writes it to
// the STAGING dir art/gemini/ (never to apps/game/public/assets/; promote with
// scripts/assets/promote-gemini.ts after a human has reviewed art/gemini/contact.png).
//
//   pnpm exec tsx scripts/assets/gen-gemini.ts [--only <key>[,<key>]] [--seed <n>] [--dry-run]
//
// Model: GEMINI_IMAGE_MODEL (default gemini-2.5-flash-image, via models.generateContent with IMAGE output).
// An "imagen-*" model id switches to models.generateImages.
import "dotenv/config";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Canvas, encodePng, text } from "./lib";
import {
  blit,
  cropToAspect,
  crop,
  decodePng,
  isPng,
  keyBackdrop,
  makeOpaque,
  opaqueBounds,
  quantize,
  resizeNearest,
  toCanvas,
  type Rgba,
} from "../gemini/image";
import { loadPrompts, REPO, type AssetPrompt } from "../gemini/prompts";

export const STAGING = join(REPO, "art/gemini");
const GAME_MANIFEST = join(REPO, "apps/game/public/assets/manifest.json");
export const DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image";
const BG = { w: 960, h: 540, artW: 480, artH: 270 };
const SPRITE = 32;

// ---- args ----------------------------------------------------------------------
function parseArgs(argv: string[]) {
  const out = { only: [] as string[], seed: undefined as number | undefined, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--only") out.only.push(...(argv[++i] ?? "").split(",").filter(Boolean));
    else if (a === "--seed") {
      out.seed = Number(argv[++i]);
      if (!Number.isInteger(out.seed)) throw new Error("--seed needs an integer");
    } else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

// ---- Gemini client (the SDK is a dependency of apps/server; load it from there) -----
interface InlinePart { inlineData?: { data?: string; mimeType?: string }; text?: string }
interface ImageClient {
  models: {
    generateContent(p: {
      model: string;
      contents: string;
      config: { responseModalities: string[]; imageConfig: { aspectRatio: string }; seed?: number };
    }): Promise<{ candidates?: { content?: { parts?: InlinePart[] }; finishReason?: string }[]; text?: string }>;
    generateImages(p: {
      model: string;
      prompt: string;
      config: { numberOfImages: number; aspectRatio: string; outputMimeType: string; seed?: number; addWatermark?: boolean };
    }): Promise<{ generatedImages?: { image?: { imageBytes?: string }; raiFilteredReason?: string }[] }>;
  };
}

function imageClient(apiKey: string): ImageClient {
  const req = createRequire(join(REPO, "apps/server/package.json"));
  const { GoogleGenAI } = req("@google/genai") as { GoogleGenAI: new (o: { apiKey: string }) => ImageClient };
  return new GoogleGenAI({ apiKey });
}

async function generate(ai: ImageClient, model: string, a: AssetPrompt, seed: number | undefined): Promise<Buffer> {
  const aspectRatio = a.kind === "background" ? "16:9" : "1:1";
  if (model.startsWith("imagen")) {
    const res = await ai.models.generateImages({
      model,
      prompt: a.prompt,
      config: { numberOfImages: 1, aspectRatio, outputMimeType: "image/png", ...(seed !== undefined ? { seed, addWatermark: false } : {}) },
    });
    const img = res.generatedImages?.[0];
    if (!img?.image?.imageBytes) throw new Error(`no image returned${img?.raiFilteredReason ? ` (${img.raiFilteredReason})` : ""}`);
    return Buffer.from(img.image.imageBytes, "base64");
  }
  const res = await ai.models.generateContent({
    model,
    contents: a.prompt,
    config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio }, ...(seed !== undefined ? { seed } : {}) },
  });
  const cand = res.candidates?.[0];
  const part = cand?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error(`no image returned (finishReason ${cand?.finishReason ?? "none"})`);
  return Buffer.from(part.inlineData.data, "base64");
}

/** Gemini normally returns PNG. Anything else (JPEG, WebP) is converted with macOS `sips` when available. */
function toPng(buf: Buffer): Buffer {
  if (isPng(buf)) return buf;
  if (process.platform !== "darwin") throw new Error("the model returned a non-PNG image and sips is unavailable to convert it");
  const dir = mkdtempSync(join(tmpdir(), "gen-gemini-"));
  try {
    writeFileSync(join(dir, "in"), buf);
    execFileSync("sips", ["-s", "format", "png", join(dir, "in"), "--out", join(dir, "out.png")], { stdio: "ignore" });
    return readFileSync(join(dir, "out.png"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- post-processing -------------------------------------------------------------
/** 960x540 opaque: crop to 16:9, sample down to the 480x270 art grid, snap to the palette, scale 2x. */
export function processBackground(src: Rgba): Rgba {
  const art = resizeNearest(cropToAspect(src, 16, 9), BG.artW, BG.artH);
  makeOpaque(art);
  quantize(art);
  return resizeNearest(art, BG.w, BG.h);
}

/** 32x32 transparent: key the backdrop, crop to the character, fit (feet on the bottom row), snap to the palette. */
export function processSprite(src: Rgba): Rgba {
  keyBackdrop(src);
  const b = opaqueBounds(src);
  if (!b) throw new Error("sprite is empty after keying out the backdrop");
  const k = SPRITE / Math.max(b.w, b.h);
  const w = Math.max(1, Math.round(b.w * k)), h = Math.max(1, Math.round(b.h * k));
  const small = resizeNearest(crop(src, b.x, b.y, b.w, b.h), w, h);
  for (let i = 3; i < small.data.length; i += 4) small.data[i] = small.data[i] < 128 ? 0 : 255;
  quantize(small);
  const out: Rgba = { w: SPRITE, h: SPRITE, data: new Uint8Array(SPRITE * SPRITE * 4) };
  blit(out, small, Math.floor((SPRITE - w) / 2), SPRITE - h);
  return out;
}

export function checkSize(key: string, kind: AssetPrompt["kind"], img: Rgba) {
  const [w, h] = kind === "background" ? [BG.w, BG.h] : [SPRITE, SPRITE];
  if (img.w !== w || img.h !== h) throw new Error(`${key}: ${img.w}x${img.h}, expected ${w}x${h}`);
  if (kind === "background")
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] !== 255) throw new Error(`${key} has a transparent pixel`);
}

/** All assets on one image for review: backgrounds at their native 480x270 art size, sprites at 4x on a checkerboard. */
export function contactSheet(items: { key: string; kind: AssetPrompt["kind"]; img: Rgba }[]): Canvas {
  const pad = 16, label = 12;
  const bgs = items.filter((i) => i.kind === "background");
  const sprites = items.filter((i) => i.kind === "sprite");
  const sp = SPRITE * 4;
  const w = Math.max(pad + bgs.length * (BG.artW + pad), pad + sprites.length * (sp + pad), 320);
  const h = pad + (bgs.length ? label + BG.artH + pad : 0) + (sprites.length ? label + sp + pad : 0);
  const cv = new Canvas(w, h);
  cv.rect(0, 0, w, h, "ink");
  let y = pad;
  if (bgs.length) {
    bgs.forEach((b, i) => {
      const x = pad + i * (BG.artW + pad);
      text(cv, b.key.replace(/_/g, " "), x, y, "paper");
      blit(cv, resizeNearest(b.img, BG.artW, BG.artH), x, y + label);
    });
    y += label + BG.artH + pad;
  }
  sprites.forEach((s, i) => {
    const x = pad + i * (sp + pad);
    text(cv, s.key.replace(/_/g, " "), x, y, "paper");
    for (let j = 0; j < sp; j += 8) for (let k = 0; k < sp; k += 8) cv.rect(x + k, y + label + j, 8, 8, (j + k) % 16 ? "zinc" : "cream");
    blit(cv, resizeNearest(s.img, sp, sp), x, y + label);
  });
  return cv;
}

// ---- main ------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestKeys = Object.keys((JSON.parse(readFileSync(GAME_MANIFEST, "utf8")) as { images: Record<string, string> }).images);
  const all = loadPrompts();
  const missing = manifestKeys.filter((k) => !all.some((p) => p.key === k));
  if (missing.length) throw new Error(`STYLE_PROMPT.md has no prompt fill for manifest keys: ${missing.join(", ")}`);
  const unknown = args.only.filter((k) => !manifestKeys.includes(k));
  if (unknown.length) throw new Error(`--only: not in the game manifest: ${unknown.join(", ")}`);
  const todo = all.filter((p) => manifestKeys.includes(p.key) && (!args.only.length || args.only.includes(p.key)));
  const model = process.env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;

  if (args.dryRun) {
    console.log(`[dry-run] model=${model} seed=${args.seed ?? "random"} staging=${STAGING}`);
    for (const p of todo) console.log(`\n━━━ ${p.key} (${p.kind}) ━━━\n${p.prompt}`);
    console.log(`\n[dry-run] ${todo.length} prompt(s); no API calls made.`);
    return;
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set. Add it to .env at the repo root.");
  const ai = imageClient(key);
  mkdirSync(join(STAGING, "raw"), { recursive: true });

  // Keep entries from earlier runs so `--only` regenerates one asset without dropping the rest.
  const stagingManifest = join(STAGING, "manifest.json");
  let prev: { images: Record<string, string>; meta?: Record<string, unknown> } = { images: {} };
  try {
    prev = JSON.parse(readFileSync(stagingManifest, "utf8"));
  } catch {}
  const images: Record<string, string> = { ...prev.images };
  const meta: Record<string, unknown> = { ...(prev.meta ?? {}) };

  const failures: string[] = [];
  for (const p of todo) {
    const t0 = Date.now();
    try {
      let raw: Buffer | undefined;
      let lastErr: unknown;
      for (let attempt = 1; attempt <= 2 && !raw; attempt++) {
        try {
          raw = await generate(ai, model, p, args.seed);
        } catch (e) {
          lastErr = e;
          console.warn(`  ${p.key}: attempt ${attempt} failed: ${(e as Error).message}`);
        }
      }
      if (!raw) throw lastErr;
      raw = toPng(raw);
      writeFileSync(join(STAGING, "raw", `${p.key}.png`), raw);
      const src = decodePng(raw);
      const img = p.kind === "background" ? processBackground(src) : processSprite(src);
      checkSize(p.key, p.kind, img);
      writeFileSync(join(STAGING, `${p.key}.png`), encodePng(toCanvas(img)));
      images[p.key] = `${p.key}.png`;
      meta[p.key] = { kind: p.kind, model, seed: args.seed ?? null, source: `${src.w}x${src.h}`, generatedAt: new Date().toISOString(), prompt: p.prompt };
      console.log(`✓ ${p.key} (${p.kind}) ${src.w}x${src.h} → ${img.w}x${img.h} in ${Date.now() - t0}ms`);
    } catch (e) {
      failures.push(p.key);
      console.error(`✗ ${p.key}: ${(e as Error).message}`);
    }
  }

  const ordered = Object.fromEntries(manifestKeys.filter((k) => images[k]).map((k) => [k, images[k]]));
  writeFileSync(stagingManifest, JSON.stringify({ images: ordered, meta }, null, 2) + "\n");

  const sheet = Object.keys(ordered).map((k) => {
    const kind = all.find((p) => p.key === k)!.kind;
    return { key: k, kind, img: decodePng(readFileSync(join(STAGING, ordered[k]))) };
  });
  writeFileSync(join(STAGING, "contact.png"), encodePng(contactSheet(sheet)));
  console.log(`\nwrote ${Object.keys(ordered).length}/${manifestKeys.length} images, manifest.json and contact.png to ${STAGING}`);
  console.log("Review art/gemini/contact.png, then: pnpm exec tsx scripts/assets/promote-gemini.ts <key...> | --all");
  if (failures.length) {
    console.error(`failed: ${failures.join(", ")} (rerun with --only ${failures.join(",")})`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
