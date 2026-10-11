// Builds the per-asset Gemini prompts from docs/STYLE_PROMPT.md at run time, so the
// doc stays the single source of truth: templates are used verbatim, only the {…}
// slots are filled from the "fills" bullet lists under each template.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const REPO = join(import.meta.dirname, "../..");
export const STYLE_DOC = join(REPO, "docs/STYLE_PROMPT.md");
export const LOCKED_STYLE = "16-bit pixel art, top-down, limited palette, Paris café colors";

export type AssetKind = "background" | "sprite";

export interface AssetPrompt {
  key: string;
  kind: AssetKind;
  prompt: string;
}

/**
 * Gemini image models cannot emit alpha. Appended to sprite prompts (after the verbatim template) so the backdrop
 * is one flat colour that gen-gemini.ts keys out. Not part of the locked template.
 */
export const SPRITE_BACKDROP_NOTE =
  "Technical note for the renderer: draw the character centred and large, filling most of the frame, on a single flat solid " +
  "pure magenta (#ff00ff) backdrop with no pattern, no checkerboard and no scenery; the magenta is keyed out to transparency afterwards.";

/** The section of the doc starting at `heading`, up to the next heading of the same or higher level. */
function section(doc: string, heading: string): string {
  const start = doc.indexOf(heading);
  if (start < 0) throw new Error(`STYLE_PROMPT.md: missing section "${heading}"`);
  const level = heading.match(/^#+/)![0].length;
  const rest = doc.slice(start + heading.length);
  const next = rest.search(new RegExp(`\\n#{1,${level}} `));
  return next < 0 ? rest : rest.slice(0, next);
}

function firstCodeBlock(text: string, where: string): string {
  const m = text.match(/```\n([\s\S]*?)\n```/);
  if (!m) throw new Error(`STYLE_PROMPT.md: no template code block in ${where}`);
  return m[1];
}

/** `- **key**: rest` bullets. */
function fills(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of text.matchAll(/^- \*\*(\w+)\*\*: (.+)$/gm)) out.set(m[1], m[2].trim());
  return out;
}

const unquote = (s: string) => s.trim().replace(/^"|"$/g, "").trim();

/** Quoted all-caps strings in the landmark list are the only text allowed on signs. */
export function signTexts(landmarks: string): string[] {
  return [...landmarks.matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((s) => s === s.toUpperCase() && /[A-ZÀ-Ü]/.test(s));
}

function fill(template: string, slots: Record<string, string>): string {
  const out = template.replace(/\{([^}]+)\}/g, (all, name: string) => {
    if (!(name in slots)) throw new Error(`STYLE_PROMPT.md: no value for template slot ${all}`);
    return slots[name];
  });
  return out;
}

export function loadPrompts(doc = readFileSync(STYLE_DOC, "utf8")): AssetPrompt[] {
  if (!doc.includes(LOCKED_STYLE)) throw new Error("STYLE_PROMPT.md no longer contains the locked style prompt");
  const bgSection = section(doc, "### Background");
  const spriteSection = section(doc, "### Character sprite");
  const bgTemplate = firstCodeBlock(bgSection, "Background");
  const spriteTemplate = firstCodeBlock(spriteSection, "Character sprite");
  for (const t of [bgTemplate, spriteTemplate])
    if (!t.startsWith(LOCKED_STYLE)) throw new Error("a template no longer starts with the locked style prompt");

  const prompts: AssetPrompt[] = [];
  for (const [key, raw] of fills(bgSection)) {
    // e.g. "Paris airport arrival hall." Landmarks: a wall band ...
    const m = raw.match(/^"([^"]+)"\s*Landmarks:\s*(.+)$/);
    if (!m) throw new Error(`STYLE_PROMPT.md: cannot parse background fill for ${key}`);
    const scene = m[1].replace(/\.$/, "");
    const landmarks = m[2].replace(/\.$/, "");
    const signs = signTexts(landmarks);
    prompts.push({
      key,
      kind: "background",
      prompt: fill(bgTemplate, {
        "scene description": scene,
        "landmarks with coordinates": landmarks,
        "sign text": signs.length ? signs.map((s) => `"${s}"`).join(", ") : "none",
      }),
    });
  }
  for (const [key, raw] of fills(spriteSection)) {
    const description = unquote(raw).replace(/\.$/, "");
    prompts.push({
      key,
      kind: "sprite",
      prompt: `${fill(spriteTemplate, { "character description": description })}\n${SPRITE_BACKDROP_NOTE}`,
    });
  }
  return prompts;
}
