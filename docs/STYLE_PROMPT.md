# Locked style prompt

Every image in Backpack comes from this one prompt. Do not reword it. Change it only by team decision, and regenerate every asset when it changes.

```
16-bit pixel art, top-down, limited palette, Paris café colors, transparent background
```

Backgrounds have no transparency, so the background template drops the final clause and says "no transparency" instead. Everything else stays word for word.

## Palette (16 colors, locked)

All art uses only these colors. The Level 1 placeholders in `scripts/assets/lib.ts` (`PALETTE`) use the same values. The only exception is sprite ground shadows, which are `ink` at partial alpha. Paste the hex list into every Gemini prompt.

| Name | Hex | Use |
|---|---|---|
| ink | `#1b1c2e` | Outlines, text shadows, iron railings |
| navy | `#2b3a67` | Airport walls, signs, uniforms, shutters |
| zincDark | `#4a4e5a` | Slate roofs, grout, shadows (dithered) |
| zinc | `#8a8f98` | Cobblestones, zinc counters, lockers |
| cream | `#f2e6c9` | Haussmann stone, floor tiles, sidewalks |
| paper | `#fff8e7` | Highlights, awning stripes, sign lettering |
| terracotta | `#c4623f` | Pots, brick, rugs, the player's backpack |
| woodDark | `#6b4226` | Doors, desk fronts, bed frames |
| wood | `#a0683a` | Floorboards, benches, tabletops |
| red | `#b8323a` | Café awning, welcome sign, neckerchiefs |
| green | `#2f6b4f` | Boulangerie and SIM awnings, apron, foliage |
| gold | `#e0a944` | Shop lettering, bread, lamps, badges |
| skin | `#f1c09a` | Faces and hands |
| sage | `#8fb37a` | Leaf highlights, market produce, bedroll |
| sky | `#6ea8c9` | Glass, sky through doors and windows |
| plum | `#5a2a32` | Café storefront, mortar, deep shading |

## Rules for every asset

- Top-down three-quarter view, the camera looking down at about 60°. Show building facades front-on along the top edge.
- Crisp pixels: no anti-aliasing, gradients, blur or photo textures. Use checkerboard dithering for shading.
- Characters have a 1px `ink` outline, a big chibi head and a small body, and face down (toward the camera).
- Signage is French, in uppercase blocky pixel lettering.
- Backgrounds are 960×540, drawn on a 480×270 pixel grid and scaled 2× (each art pixel is a 2×2 block).
- Sprites are 32×32 on a transparent background, a single frame at Level 2.

## Prompt templates (Level 2, Gemini)

Fill in the `{…}` parts and keep the rest verbatim.

### Background (960×540, no transparency)

```
16-bit pixel art, top-down, limited palette, Paris café colors, no transparency.
960x540 game background, drawn on a 480x270 pixel grid and scaled 2x with nearest neighbour.
Palette only: #1b1c2e #2b3a67 #4a4e5a #8a8f98 #f2e6c9 #fff8e7 #c4623f #6b4226 #a0683a #b8323a #2f6b4f #e0a944 #f1c09a #8fb37a #6ea8c9 #5a2a32.
Scene: {scene description}.
Layout (pixel coordinates on the 960x540 image): {landmarks with coordinates}.
Leave the walkable floor uncluttered. No characters, no UI, no text other than: {sign text}.
```

Scene fills:

- **airport_bg**: "Paris airport arrival hall." Landmarks: a wall band across the top with a red "BIENVENUE À PARIS" sign board in the center; a green SIM card kiosk with a striped awning and counter around (180, 300); a red guide carpet running right; an exit doorway with a green "SORTIE" sign on the right edge around (900, 270); rows of waiting seats lower middle.
- **street_bg**: "One cobblestone Paris street, Haussmann facades along the top." Landmarks: a café with a red and white striped awning and terrace tables, left-middle around (200, 200); a navy boulangerie front with gold lettering around (450, 120); a locked iron market gate under a "MARCHÉ" sign around (760, 120); a brick hostel with a wooden door on the right edge around (900, 400); a wooden bench with a lamp post around (500, 380); an "< AÉROPORT" signpost on the left edge.
- **hostel_bg**: "Cozy backpacker hostel interior." Landmarks: wooden plank floor; a reception desk under a "RÉCEPTION" sign at top center; three bunk beds on the right; an exit doorway with a "SORTIE" sign on the left edge; a rug in the middle.

### Character sprite (32×32, transparent)

```
16-bit pixel art, top-down, limited palette, Paris café colors, transparent background.
Single 32x32 character sprite, one frame, facing down toward the camera, chibi proportions (head about 40% of height), 1px #1b1c2e outline, soft shadow under the feet.
Palette only: #1b1c2e #2b3a67 #4a4e5a #8a8f98 #f2e6c9 #fff8e7 #c4623f #6b4226 #a0683a #b8323a #2f6b4f #e0a944 #f1c09a #8fb37a #6ea8c9 #5a2a32.
Character: {character description}.
```

Character fills:

- **player**: "young backpacker in a red cap and sky-blue shirt, wearing an oversized terracotta backpack with a rolled sage bedroll on top, straps visible on the chest."
- **npc_clerk**: "airport SIM kiosk clerk in a navy uniform with a white collar, red tie, gold name badge and a headset."
- **npc_barista**: "café barista with a black hair bun, white shirt with navy marinière stripes, long green apron."
- **npc_girard**: "Monsieur Girard, retired old man with a white moustache, navy beret, brown cardigan, red scarf and a cane, with a tiny cream terrier dog at his feet."
- **npc_margaux**: "Margaux the baker, red hair under a tall white toque, red neckerchief, flour-dusted apron, a baguette under her arm."

## Asset keys

These are the keys in `apps/game/public/assets/manifest.json`, as defined in `docs/CONTRACT.md`:

| Key | File | Size |
|---|---|---|
| `airport_bg` | `airport_bg.png` | 960×540 |
| `street_bg` | `street_bg.png` | 960×540 |
| `hostel_bg` | `hostel_bg.png` | 960×540 |
| `player` | `player.png` | 32×32 |
| `npc_clerk` | `npc_clerk.png` | 32×32 |
| `npc_barista` | `npc_barista.png` | 32×32 |
| `npc_girard` | `npc_girard.png` | 32×32 |
| `npc_margaux` | `npc_margaux.png` | 32×32 |

To regenerate the placeholders, run `pnpm exec tsx scripts/assets/gen-placeholders.ts`.
