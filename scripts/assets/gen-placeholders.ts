// Level 1 placeholder art: every asset in the manifest, drawn procedurally
// from the locked palette in lib.ts. Run: pnpm exec tsx scripts/assets/gen-placeholders.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Canvas, type Color, encodePng, sign } from "./lib";

const OUT = join(import.meta.dirname, "../../apps/game/public/assets");

// Backgrounds are drawn at 480x270 and upscaled 2x to 960x540, so every art
// pixel is a chunky 2x2 block that matches the 32x32 sprites drawn at 2x.
const W = 480;
const H = 270;

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- shared props -----------------------------------------------------------
// Dithered ground shadow: stays inside the palette instead of alpha blending.
function shadow(c: Canvas, cx: number, cy: number, rx: number, ry: number) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && (x + y) % 2 === 0) c.px(x, y, "zincDark");
    }
}

function plant(c: Canvas, x: number, y: number) {
  shadow(c, x + 6, y + 18, 9, 3);
  c.rect(x + 1, y + 10, 10, 8, "terracotta");
  c.rect(x + 1, y + 10, 10, 2, "plum");
  c.rect(x + 2, y + 16, 8, 2, "plum");
  c.ellipse(x + 6, y + 6, 8, 7, "green");
  c.ellipse(x + 5, y + 4, 5, 4, "sage");
  c.px(x + 3, y + 3, "paper");
}

function awning(c: Canvas, x: number, y: number, w: number, h: number, a: Color, b: Color) {
  for (let i = 0; i < w; i++) c.rect(x + i, y, 1, h, Math.floor(i / 6) % 2 ? b : a);
  c.rect(x, y, w, 1, "ink");
  // scalloped valance
  for (let i = 0; i < w; i++) {
    const s = Math.floor(i / 6) % 2 ? b : a;
    const k = i % 6;
    const drop = k === 0 || k === 5 ? 1 : 3;
    c.rect(x + i, y + h, 1, drop, s);
    c.px(x + i, y + h + drop, "ink");
  }
}

function window_(c: Canvas, x: number, y: number, w: number, h: number) {
  c.rect(x, y, w, h, "paper");
  c.rect(x + 1, y + 1, w - 2, h - 2, "navy");
  c.rect(x + 2, y + 2, 2, Math.max(1, h - 6), "sky");
  c.rect(x + Math.floor(w / 2), y + 1, 1, h - 2, "paper");
}

// ---- airport ---------------------------------------------------------------
function airport() {
  const c = new Canvas(W, H);
  // terminal floor: big polished tiles
  for (let ty = 56; ty < H; ty += 16)
    for (let tx = 0; tx < W; tx += 16) {
      const alt = ((tx + ty) / 16) % 2 === 0;
      c.rect(tx, ty, 16, 16, alt ? "cream" : "paper");
      c.rect(tx, ty, 16, 1, "zinc");
      c.rect(tx, ty, 1, 16, "zinc");
      if (alt) c.rect(tx + 3, ty + 3, 3, 1, "paper");
    }
  // guide carpet from the kiosk to the exit
  c.rect(130, 128, 322, 16, "red");
  c.rect(130, 128, 322, 1, "gold");
  c.rect(130, 143, 322, 1, "gold");
  for (let x = 150; x < 440; x += 24) {
    c.rect(x, 135, 6, 2, "gold");
    c.px(x + 6, 136, "gold");
  }
  // wall band
  c.rect(0, 0, W, 48, "navy");
  c.rect(0, 0, W, 3, "ink");
  for (let x = 0; x < W; x += 40) c.rect(x, 3, 1, 45, "ink");
  c.rect(0, 46, W, 2, "ink");
  c.rect(0, 48, W, 8, "zincDark");
  c.rect(0, 48, W, 1, "zinc");
  // windows onto the tarmac
  for (const wx of [14, 380]) {
    c.rect(wx, 8, 88, 32, "cream");
    c.dither(wx + 2, 10, 84, 28, "sky", "sky");
    c.rect(wx + 2, 30, 84, 8, "zinc");
    c.rect(wx + 2, 29, 84, 1, "zincDark");
    for (let i = 0; i < 84; i += 6) c.rect(wx + 2 + i, 33, 3, 1, "paper");
    for (let k = 0; k < 10; k++) c.px(wx + 10 + k * 7, 12 + (k % 3), "paper");
    // little plane
    c.rect(wx + 30, 18, 20, 3, "paper");
    c.rect(wx + 38, 14, 4, 11, "paper");
    c.rect(wx + 47, 15, 2, 4, "red");
    for (let i = 0; i < 84; i += 28) c.rect(wx + 2 + i, 10, 2, 28, "cream");
  }
  // BIENVENUE À PARIS sign board
  c.rect(124, 6, 232, 36, "gold");
  c.rect(126, 8, 228, 32, "ink");
  c.rect(127, 9, 226, 30, "red");
  sign(c, "BIENVENUE À PARIS", 240, 18, "paper", "plum", 2);
  // tricolore flags either side
  for (const fx of [108, 362]) {
    c.rect(fx, 8, 1, 30, "zincDark");
    c.rect(fx + 1, 9, 3, 9, "navy");
    c.rect(fx + 4, 9, 3, 9, "paper");
    c.rect(fx + 7, 9, 3, 9, "red");
  }
  // SIM kiosk around (90,150)
  shadow(c, 90, 168, 40, 7);
  c.rect(58, 100, 64, 36, "green");
  c.frame(58, 100, 64, 36, "ink");
  c.rect(70, 112, 40, 18, "ink");
  c.rect(71, 113, 38, 16, "navy");
  sign(c, "SIM", 90, 115, "gold", "ink", 2);
  awning(c, 54, 92, 72, 8, "green", "paper");
  // counter
  c.rect(52, 136, 76, 8, "wood");
  c.rect(52, 136, 76, 1, "gold");
  c.rect(52, 144, 76, 18, "terracotta");
  c.rect(52, 144, 76, 1, "plum");
  c.frame(51, 135, 78, 28, "ink");
  for (let x = 60; x < 124; x += 16) c.rect(x, 148, 10, 10, "plum");
  for (const [sx, col] of [[60, "navy"], [72, "red"], [84, "green"]] as [number, Color][]) {
    c.rect(sx, 137, 7, 5, col);
    c.px(sx + 2, 139, "gold");
    c.px(sx + 3, 139, "gold");
  }
  c.rect(104, 137, 10, 6, "paper");
  c.rect(105, 138, 8, 4, "sky");
  // a-frame sign in front of the kiosk
  c.rect(136, 150, 26, 16, "ink");
  c.rect(137, 151, 24, 14, "navy");
  sign(c, "SIM", 149, 155, "paper", "ink", 1);
  c.rect(138, 166, 2, 4, "ink");
  c.rect(158, 166, 2, 4, "ink");
  // exit on the right edge around (450,135)
  c.rect(444, 56, 36, H - 56, "navy");
  c.rect(444, 56, 2, H - 56, "ink");
  c.rect(448, 104, 32, 62, "zinc");
  c.rect(452, 108, 28, 58, "sky");
  c.dither(452, 140, 28, 26, "zinc", "cream");
  c.rect(452, 108, 1, 58, "paper");
  c.rect(448, 104, 32, 2, "zincDark");
  c.rect(400, 88, 44, 14, "ink");
  c.rect(401, 89, 42, 12, "green");
  sign(c, "SORTIE", 421, 92, "paper", "ink", 1);
  for (let k = 0; k < 3; k++) {
    const x = 410 + k * 10;
    for (let i = 0; i < 4; i++) {
      c.px(x + i, 132 + i, "paper");
      c.px(x + i, 139 - i, "paper");
    }
  }
  // waiting seats
  for (const sy of [196, 226])
    for (let sx = 180; sx < 340; sx += 14) {
      shadow(c, sx + 6, sy + 13, 7, 2);
      c.rect(sx, sy, 12, 4, "zincDark");
      c.rect(sx, sy + 4, 12, 8, "zinc");
      c.rect(sx + 1, sy + 5, 10, 1, "paper");
      c.frame(sx, sy, 12, 12, "ink");
    }
  plant(c, 150, 56);
  plant(c, 172, 236);
  plant(c, 350, 236);
  plant(c, 420, 56);
  // luggage
  c.rect(372, 196, 14, 18, "terracotta");
  c.frame(372, 196, 14, 18, "ink");
  c.rect(376, 192, 6, 4, "ink");
  c.rect(372, 203, 14, 1, "plum");
  c.rect(390, 202, 10, 12, "navy");
  c.frame(390, 202, 10, 12, "ink");
  c.rect(392, 205, 6, 1, "gold");
  return c;
}

// ---- street ----------------------------------------------------------------
function cobbles(c: Canvas, y0: number) {
  const r = rng(7);
  c.rect(0, y0, W, H - y0, "zincDark");
  for (let y = y0, row = 0; y < H; y += 7, row++)
    for (let x = row % 2 ? -5 : 0; x < W; x += 10) {
      const tone: Color = r() < 0.12 ? "zincDark" : "zinc";
      c.rect(x + 1, y + 1, 8, 5, tone);
      c.rect(x + 1, y + 5, 8, 1, "navy");
      if (tone === "zinc") c.px(x + 2, y + 1, "cream");
    }
}

function facade(c: Canvas, x: number, w: number) {
  c.rect(x, 0, w, 78, "cream");
  c.dither(x, 0, w, 8, "zincDark", "navy");
  c.rect(x, 8, w, 1, "ink");
  for (let y = 14; y < 40; y += 8) c.rect(x, y, w, 1, "zinc");
  for (let wx = x + 6; wx + 10 <= x + w - 4; wx += 18) {
    window_(c, wx, 12, 10, 18);
    c.rect(wx - 1, 29, 12, 2, "ink");
    for (let i = 0; i < 12; i += 2) c.px(wx - 1 + i, 28, "ink");
  }
  c.frame(x, 0, w, 78, "ink");
}

function street() {
  const c = new Canvas(W, H);
  cobbles(c, 96);
  // alleys between buildings
  c.rect(0, 0, W, 76, "zincDark");
  c.dither(0, 0, W, 76, "zincDark", "navy");
  // sidewalk
  c.rect(0, 76, W, 20, "cream");
  for (let x = 0; x < W; x += 12) c.rect(x, 76, 1, 20, "zinc");
  c.rect(0, 86, W, 1, "zinc");
  c.rect(0, 96, W, 2, "paper");
  c.rect(0, 98, W, 1, "ink");

  // café, left: storefront + striped awning + terrace around (100,100)
  facade(c, 8, 162);
  c.rect(10, 42, 158, 34, "plum");
  c.rect(14, 36, 70, 10, "ink");
  sign(c, "CAFÉ", 49, 38, "gold", "ink", 1);
  for (const wx of [16, 60, 120]) window_(c, wx, 50, 36, 22);
  c.rect(98, 52, 16, 24, "woodDark");
  c.frame(98, 52, 16, 24, "ink");
  c.px(110, 64, "gold");
  awning(c, 10, 62, 158, 10, "red", "paper");
  for (const [tx, ty] of [[46, 104], [96, 112], [146, 104]]) {
    shadow(c, tx, ty + 7, 12, 3);
    for (const dx of [-11, 9]) {
      c.rect(tx + dx, ty - 2, 4, 6, "wood");
      c.frame(tx + dx, ty - 2, 4, 6, "ink");
    }
    c.ellipse(tx, ty, 7, 5, "ink");
    c.ellipse(tx, ty, 6, 4, "paper");
    c.px(tx - 1, ty - 1, "terracotta");
    c.px(tx, ty - 1, "woodDark");
  }

  // boulangerie, around (225,60)
  facade(c, 184, 86);
  c.rect(186, 40, 82, 36, "navy");
  c.rect(188, 42, 78, 10, "ink");
  sign(c, "BOULANGERIE", 227, 44, "gold", "ink", 1);
  window_(c, 190, 56, 24, 18);
  window_(c, 240, 56, 24, 18);
  for (const bx of [194, 244]) {
    c.rect(bx, 68, 16, 3, "gold");
    c.rect(bx + 2, 65, 6, 3, "wood");
    c.rect(bx + 9, 65, 5, 3, "gold");
  }
  c.rect(219, 54, 16, 22, "woodDark");
  c.frame(219, 54, 16, 22, "ink");
  c.px(231, 66, "gold");
  awning(c, 186, 53, 82, 4, "green", "paper");

  // residential block
  facade(c, 270, 66);
  c.rect(292, 52, 18, 24, "navy");
  c.frame(292, 52, 18, 24, "ink");
  for (const fx of [276, 316]) {
    c.rect(fx, 60, 12, 4, "woodDark");
    for (let i = 0; i < 12; i += 3) c.px(fx + i + 1, 59, i % 2 ? "red" : "sage");
  }

  // market gate around (380,60): locked
  c.rect(336, 0, 88, 78, "cream");
  c.dither(336, 0, 88, 8, "zincDark", "navy");
  c.rect(350, 34, 60, 42, "green");
  c.dither(350, 50, 60, 26, "sage", "green");
  for (let i = 0; i < 4; i++) awning(c, 352 + i * 15, 54, 12, 4, i % 2 ? "red" : "gold", "paper");
  c.ellipse(380, 36, 30, 10, "navy");
  c.rect(350, 36, 60, 2, "navy");
  c.ellipse(380, 36, 27, 7, "green");
  c.rect(353, 36, 54, 6, "green");
  for (let x = 352; x < 410; x += 4) c.rect(x, 30, 1, 46, "ink");
  c.rect(350, 50, 60, 1, "ink");
  c.rect(350, 70, 60, 1, "ink");
  for (const px of [338, 410]) {
    c.rect(px, 12, 12, 66, "paper");
    c.rect(px + 10, 12, 2, 66, "zinc");
    c.rect(px - 1, 10, 14, 4, "zinc");
    c.frame(px, 12, 12, 66, "ink");
  }
  c.rect(356, 14, 48, 12, "ink");
  c.rect(357, 15, 46, 10, "red");
  sign(c, "MARCHÉ", 380, 17, "gold", "plum", 1);
  for (let i = 0; i < 16; i++) c.px(372 + i, 58 + Math.abs(8 - i) / 3, "gold");
  c.rect(377, 61, 7, 6, "gold");
  c.frame(377, 61, 7, 6, "ink");
  c.px(380, 63, "ink");

  facade(c, 426, 54);

  // hostel, right edge around (450,200)
  c.rect(426, 118, 54, 152, "terracotta");
  for (let y = 118, row = 0; y < H; y += 5, row++) {
    c.rect(426, y, 54, 1, "plum");
    for (let x = 426 + (row % 2 ? 4 : 0); x < W; x += 9) c.rect(x, y, 1, 5, "plum");
  }
  c.rect(426, 114, 54, 4, "zincDark");
  c.rect(426, 114, 1, 156, "ink");
  window_(c, 438, 128, 22, 16);
  window_(c, 438, 236, 22, 16);
  c.rect(430, 164, 44, 12, "ink");
  c.rect(431, 165, 42, 10, "navy");
  sign(c, "HOSTEL", 452, 167, "paper", "ink", 1);
  c.rect(436, 180, 32, 40, "cream");
  c.rect(439, 183, 26, 37, "wood");
  c.rect(451, 183, 1, 37, "woodDark");
  for (const dx of [442, 455]) c.frame(dx, 187, 8, 14, "woodDark");
  c.px(448, 205, "gold");
  c.px(454, 205, "gold");
  c.rect(434, 220, 36, 6, "red");
  c.frame(434, 220, 36, 6, "plum");
  plant(c, 412, 206);

  // bench around (250,190), with a lamp and a tree
  shadow(c, 250, 200, 24, 4);
  c.rect(228, 178, 44, 4, "woodDark");
  c.frame(228, 178, 44, 4, "ink");
  for (let k = 0; k < 3; k++) {
    c.rect(228, 184 + k * 4, 44, 3, "wood");
    c.rect(228, 187 + k * 4, 44, 1, "woodDark");
  }
  c.frame(227, 183, 46, 13, "ink");
  for (const lx of [230, 267]) c.rect(lx, 196, 3, 4, "ink");
  shadow(c, 286, 204, 6, 2);
  c.rect(285, 160, 3, 44, "ink");
  c.rect(281, 154, 11, 8, "ink");
  c.rect(283, 156, 7, 4, "gold");
  c.rect(282, 202, 9, 3, "ink");
  shadow(c, 200, 206, 16, 5);
  c.rect(198, 190, 5, 16, "woodDark");
  c.ellipse(200, 180, 16, 13, "green");
  c.ellipse(196, 176, 10, 8, "sage");
  for (let k = 0; k < 6; k++) c.px(190 + k * 3, 172 + (k % 2) * 3, "paper");

  // airport arrow sign on the left edge
  c.rect(30, 158, 3, 24, "woodDark");
  c.rect(2, 144, 68, 16, "ink");
  c.rect(3, 145, 66, 14, "navy");
  sign(c, "< AÉROPORT", 36, 149, "paper", "ink", 1);
  shadow(c, 31, 182, 6, 2);
  for (let k = 0; k < 3; k++) {
    const x = 10 + k * 12;
    for (let i = 0; i < 5; i++) {
      c.rect(x + i, 210 - i, 2, 1, "paper");
      c.rect(x + i, 210 + i, 2, 1, "paper");
    }
  }

  // street furniture
  for (const [mx, my] of [[150, 230], [340, 160]]) {
    c.ellipse(mx, my, 8, 5, "ink");
    c.ellipse(mx, my, 7, 4, "zincDark");
    for (let i = -4; i <= 4; i += 2) c.rect(mx + i, my - 2, 1, 4, "zinc");
  }
  plant(c, 172, 80);
  plant(c, 318, 80);
  return c;
}

// ---- hostel ----------------------------------------------------------------
function hostel() {
  const c = new Canvas(W, H);
  const r = rng(11);
  // plank floor
  for (let y = 56, row = 0; y < H; y += 8, row++) {
    c.rect(0, y, W, 8, row % 3 === 1 ? "terracotta" : "wood");
    c.rect(0, y + 7, W, 1, "woodDark");
    for (let x = (row * 17) % 48; x < W; x += 48) c.rect(x, y, 1, 7, "woodDark");
    for (let k = 0; k < 6; k++) c.px(Math.floor(r() * W), y + 2 + Math.floor(r() * 4), "woodDark");
  }
  // back wall + wainscot
  c.rect(0, 0, W, 56, "cream");
  c.rect(0, 0, W, 3, "ink");
  c.rect(0, 36, W, 20, "wood");
  c.rect(0, 36, W, 2, "woodDark");
  for (let x = 6; x < W; x += 16) c.rect(x, 40, 1, 14, "woodDark");
  c.rect(0, 54, W, 2, "ink");
  // window + poster
  window_(c, 390, 6, 44, 28);
  c.rect(52, 6, 26, 28, "woodDark");
  c.rect(54, 8, 22, 24, "sky");
  for (let i = 0; i < 9; i++) c.rect(65 - Math.floor(i / 2), 12 + i * 2, 1 + Math.floor(i / 2) * 2, 2, "ink");
  c.rect(54, 28, 22, 4, "sage");
  // reception: key board, sign, desk
  c.rect(210, 6, 60, 10, "ink");
  c.rect(211, 7, 58, 8, "navy");
  sign(c, "RÉCEPTION", 240, 8, "gold", "ink", 1);
  c.rect(214, 20, 52, 14, "woodDark");
  for (let x = 218; x < 264; x += 6) {
    c.px(x, 23, "gold");
    c.rect(x, 25, 1, 3, "gold");
  }
  shadow(c, 240, 98, 62, 5);
  c.rect(180, 62, 120, 10, "wood");
  c.rect(180, 62, 120, 1, "paper");
  c.rect(180, 72, 120, 24, "woodDark");
  for (let x = 186; x < 296; x += 22) c.frame(x, 76, 16, 16, "wood");
  c.frame(179, 61, 122, 36, "ink");
  c.rect(266, 64, 6, 4, "gold");
  c.px(268, 63, "gold");
  c.rect(198, 64, 14, 6, "paper");
  c.rect(205, 64, 1, 6, "zinc");
  plant(c, 284, 50);
  // bunk beds, right
  for (let i = 0; i < 3; i++) {
    const bx = 336 + i * 46;
    const by = 104;
    const blanket: Color = (["navy", "green", "red"] as Color[])[i];
    shadow(c, bx + 18, by + 86, 22, 4);
    c.rect(bx, by, 36, 84, "woodDark");
    c.rect(bx + 3, by + 3, 30, 78, "paper");
    c.rect(bx + 6, by + 6, 24, 10, "cream");
    c.frame(bx + 6, by + 6, 24, 10, "zinc");
    c.rect(bx + 3, by + 24, 30, 57, blanket);
    c.rect(bx + 3, by + 24, 30, 4, "paper");
    c.dither(bx + 5, by + 32, 26, 1, blanket, "paper");
    c.frame(bx, by, 36, 84, "ink");
    for (const [px, py] of [[0, 0], [32, 0], [0, 80], [32, 80]]) {
      c.rect(bx + px - 1, by + py - 1, 6, 6, "wood");
      c.frame(bx + px - 1, by + py - 1, 6, 6, "ink");
    }
    // ladder on the left rail
    c.rect(bx - 6, by + 30, 2, 40, "wood");
    c.rect(bx - 1, by + 30, 1, 40, "wood");
    for (let y = by + 34; y < by + 70; y += 7) c.rect(bx - 6, y, 6, 1, "woodDark");
  }
  // lockers
  for (let x = 20; x < 140; x += 20) {
    c.rect(x, 58, 18, 30, "zinc");
    c.frame(x, 58, 18, 30, "ink");
    for (let k = 0; k < 3; k++) c.rect(x + 4, 62 + k * 2, 10, 1, "zincDark");
    c.px(x + 14, 74, "gold");
  }
  // rug
  c.rect(160, 140, 150, 74, "gold");
  c.rect(162, 142, 146, 70, "terracotta");
  c.frame(166, 146, 138, 62, "cream");
  for (let k = 0; k < 5; k++) {
    const cx = 186 + k * 25;
    for (let d = 0; d < 6; d++) {
      c.px(cx - d, 177 - 6 + d, "cream");
      c.px(cx + d, 177 - 6 + d, "cream");
      c.px(cx - d, 177 + 6 - d, "cream");
      c.px(cx + d, 177 + 6 - d, "cream");
    }
    c.px(cx, 177, "gold");
  }
  // exit, left
  c.rect(0, 56, 8, H - 56, "woodDark");
  c.rect(7, 56, 1, H - 56, "ink");
  c.rect(0, 118, 12, 56, "zinc");
  c.rect(0, 122, 9, 48, "sky");
  c.dither(0, 150, 9, 20, "zinc", "cream");
  c.rect(12, 126, 16, 40, "red");
  c.frame(12, 126, 16, 40, "plum");
  c.rect(12, 102, 52, 14, "ink");
  c.rect(13, 103, 50, 12, "green");
  sign(c, "< SORTIE", 37, 106, "paper", "ink", 1);
  plant(c, 140, 236);
  plant(c, 20, 236);
  return c;
}

// ---- 32x32 sprites -----------------------------------------------------------
// Chibi, facing down: big head, small body. Drawn without outline, then a 1px
// ink outline is traced around the silhouette and a soft shadow added.
interface Look {
  hair: Color;
  shirt: Color;
  pants: Color;
  shoes?: Color;
  skin?: Color;
  dx?: number;
}

function body(c: Canvas, l: Look) {
  const dx = l.dx ?? 0;
  const skin = l.skin ?? "skin";
  // legs + shoes
  c.rect(12 + dx, 23, 3, 4, l.pants);
  c.rect(17 + dx, 23, 3, 4, l.pants);
  c.rect(12 + dx, 27, 3, 1, l.shoes ?? "woodDark");
  c.rect(17 + dx, 27, 3, 1, l.shoes ?? "woodDark");
  // torso + arms
  c.rect(11 + dx, 15, 10, 9, l.shirt);
  c.rect(9 + dx, 16, 2, 6, l.shirt);
  c.rect(21 + dx, 16, 2, 6, l.shirt);
  c.rect(9 + dx, 22, 2, 1, skin);
  c.rect(21 + dx, 22, 2, 1, skin);
  // head
  c.rect(10 + dx, 5, 12, 10, skin);
  c.rect(11 + dx, 4, 10, 1, skin);
  c.rect(11 + dx, 15, 10, 0, skin);
  // hair cap
  c.rect(10 + dx, 3, 12, 4, l.hair);
  c.rect(10 + dx, 7, 2, 3, l.hair);
  c.rect(20 + dx, 7, 2, 3, l.hair);
}

function face(c: Canvas, dx = 0) {
  c.rect(13 + dx, 10, 1, 2, "ink");
  c.rect(18 + dx, 10, 1, 2, "ink");
  c.px(12 + dx, 12, "terracotta");
  c.px(19 + dx, 12, "terracotta");
  c.rect(15 + dx, 13, 2, 1, "plum");
}

function finish(c: Canvas, shadowX = 16) {
  c.outline("ink");
  // soft ground shadow drawn under the feet after the outline
  const sh = new Canvas(32, 32);
  sh.ellipse(shadowX, 29.5, 8, 2, "ink", 90);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++)
      if (!c.opaque(x, y) && sh.opaque(x, y)) c.data.set(sh.data.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 4), (y * 32 + x) * 4);
  return c;
}

function player() {
  const c = new Canvas(32, 32);
  // big backpack behind: bedroll on top, pack wider than the body
  c.rect(7, 4, 18, 4, "sage");
  c.rect(7, 5, 18, 1, "green");
  c.rect(6, 8, 20, 15, "terracotta");
  c.rect(6, 19, 20, 1, "plum");
  c.rect(6, 8, 2, 15, "plum");
  c.rect(24, 8, 2, 15, "plum");
  body(c, { hair: "woodDark", shirt: "sky", pants: "navy" });
  // cap
  c.rect(10, 2, 12, 3, "red");
  c.rect(9, 5, 14, 1, "red");
  c.rect(14, 2, 4, 1, "paper");
  // straps + buckle
  c.rect(12, 15, 1, 8, "woodDark");
  c.rect(19, 15, 1, 8, "woodDark");
  c.rect(12, 18, 8, 1, "woodDark");
  c.px(15, 18, "gold");
  c.px(16, 18, "gold");
  face(c);
  return finish(c);
}

function clerk() {
  const c = new Canvas(32, 32);
  body(c, { hair: "ink", shirt: "navy", pants: "zincDark", shoes: "ink" });
  c.rect(14, 15, 4, 2, "paper");
  c.px(15, 17, "red");
  c.px(16, 17, "red");
  c.px(15, 18, "red");
  c.rect(18, 18, 2, 2, "gold");
  c.rect(11, 22, 10, 1, "ink");
  c.rect(10, 6, 12, 1, "ink");
  face(c);
  // headset mic
  c.px(21, 10, "zinc");
  c.rect(19, 12, 3, 1, "zinc");
  return finish(c);
}

function barista() {
  const c = new Canvas(32, 32);
  body(c, { hair: "ink", shirt: "paper", pants: "ink" });
  // bun
  c.rect(14, 0, 4, 3, "ink");
  // green apron with strap and pocket
  c.rect(12, 17, 8, 9, "green");
  c.rect(13, 15, 1, 2, "green");
  c.rect(18, 15, 1, 2, "green");
  c.rect(11, 19, 10, 1, "paper");
  c.rect(14, 22, 4, 2, "sage");
  // beret-free, a striped marinière collar
  c.rect(11, 15, 2, 1, "navy");
  c.rect(19, 15, 2, 1, "navy");
  c.rect(9, 18, 2, 1, "navy");
  c.rect(21, 18, 2, 1, "navy");
  face(c);
  return finish(c);
}

function girard() {
  const c = new Canvas(32, 32);
  const dx = -3;
  body(c, { hair: "paper", shirt: "wood", pants: "zincDark", dx });
  // beret
  c.rect(9 + dx, 1, 13, 4, "navy");
  c.rect(15 + dx, 0, 2, 1, "navy");
  c.rect(10 + dx, 5, 12, 1, "navy");
  // cardigan buttons + scarf
  c.rect(15 + dx, 17, 2, 6, "woodDark");
  c.px(16 + dx, 18, "gold");
  c.px(16 + dx, 21, "gold");
  c.rect(11 + dx, 15, 10, 2, "red");
  face(c, dx);
  // white moustache over the mouth
  c.rect(14 + dx, 12, 4, 1, "paper");
  c.rect(15 + dx, 13, 2, 1, "skin");
  // cane
  c.rect(8 + dx, 17, 1, 11, "woodDark");
  c.rect(7 + dx, 16, 2, 1, "woodDark");
  // tiny dog (terrier) at his feet, to the right
  c.rect(22, 23, 7, 4, "cream");
  c.rect(27, 20, 4, 4, "cream");
  c.px(27, 19, "wood");
  c.px(30, 19, "wood");
  c.px(29, 21, "ink");
  c.px(30, 22, "ink");
  c.rect(22, 27, 1, 2, "cream");
  c.rect(27, 27, 1, 2, "cream");
  c.px(21, 22, "cream");
  c.rect(24, 23, 2, 1, "red");
  return finish(c, 15);
}

function margaux() {
  const c = new Canvas(32, 32);
  body(c, { hair: "terracotta", shirt: "paper", pants: "navy" });
  // tall toque
  c.rect(11, 0, 10, 4, "paper");
  c.rect(10, 1, 12, 2, "paper");
  c.rect(11, 4, 10, 1, "cream");
  c.rect(13, 1, 1, 3, "cream");
  c.rect(18, 1, 1, 3, "cream");
  // hair falls below the hat
  c.rect(10, 5, 12, 2, "terracotta");
  c.rect(9, 7, 2, 6, "terracotta");
  c.rect(21, 7, 2, 6, "terracotta");
  // red neckerchief + flour apron
  c.rect(13, 15, 6, 2, "red");
  c.px(16, 17, "red");
  c.rect(12, 19, 8, 6, "cream");
  // baguette under the arm
  for (let i = 0; i < 9; i++) c.rect(20 + Math.floor(i / 2), 13 + i, 2, 1, "gold");
  c.px(21, 15, "wood");
  c.px(23, 18, "wood");
  face(c);
  return finish(c);
}

// ---- write -------------------------------------------------------------------
const assets: Record<string, Canvas> = {
  airport_bg: airport().scale(2),
  street_bg: street().scale(2),
  hostel_bg: hostel().scale(2),
  player: player(),
  npc_clerk: clerk(),
  npc_barista: barista(),
  npc_girard: girard(),
  npc_margaux: margaux(),
};

for (const key of ["airport_bg", "street_bg", "hostel_bg"]) {
  const d = assets[key].data;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) throw new Error(`${key} has a transparent pixel`);
}

mkdirSync(OUT, { recursive: true });
const images: Record<string, string> = {};
for (const [key, cv] of Object.entries(assets)) {
  writeFileSync(join(OUT, `${key}.png`), encodePng(cv));
  images[key] = `${key}.png`;
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ images }, null, 2) + "\n");
console.log(`wrote ${Object.keys(images).length} images to ${OUT}`);
