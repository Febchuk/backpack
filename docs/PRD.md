# Backpack — Voice-First Language Game PRD

Oct 11, 2026 · @Febe · Source: [Google Doc](https://docs.google.com/document/d/1SEUtl-Odvmiw7w3uYb_wfsNBiAF8SLMcfiJLu_vJ_oo/edit)

> The source doc has two embedded diagrams (system architecture, build timeline) that are not reproduced here.

## Overview

Backpack is a 16-bit pixel-art backpacking game where you learn a language by living in it: you land at an airport, talk your way through real-life missions by voice, and a guide named Luna follows you onto your real phone with calls and texts.

**Problem.** Language apps take years because they teach vocabulary lists, not situations. Learners freeze in real conversations because they never practiced them out loud, under mild pressure.

**Promise.** Handle one real situation in a new language in about an hour, not years. We teach the phrases your trip actually needs, practiced by voice, then reinforced on your phone throughout the day.

**Challenge fit.** SpeedHacks asks teams to give people their time back. Backpack replaces years of drills with targeted, situation-first practice.

**Why us, why now.**

- Voice tutors (Speak, Praktika, Duolingo video call) are chat windows. Backpack is a world with stakes: NPCs get impatient, you overpay if you fumble.
- The guide lives on your real phone via Dial, so practice happens off-screen too. No app needs to be opened.
- Game state and phone calls share one memory: what you miss in the game comes back in tonight's call.

## Goals and success metrics

The goal for today is one flawless 5-minute demo: a judge who speaks no French buys a SIM card, gets a real call from Luna, and orders a coffee by voice.

**Goals**

- Ship the airport-to-phone-call opening end to end.
- Ship one complete mission loop: talk, get graded, earn phrases, unlock the next area.
- Make Luna's phone calls read and write game state live through Dial.

**Non-goals (today)**

- More than one language (French, Paris) or one city.
- Accounts, login, payments, character customization.
- Real background scheduling of calls through the day; a time-skip button stands in.
- A curriculum beyond one scenario pack.

**Demo success metrics**

| Metric | Target |
|---|---|
| Phone rings after entering number | Under 30 s |
| NPC voice reply latency | Under 3 s |
| Judge completes café mission | Under 3 min, with hints |
| Debrief call uses a phrase the player missed | Every time |
| Full demo run without a crash | 3 rehearsals in a row |

## User and journey

The target user is an adult with a trip coming up in weeks, not years: a backpacker, a remote worker relocating, or someone meeting a partner's family abroad. They want to survive real situations, not pass a grammar test.

**Core journey (the 5-minute demo)**

1. **Title screen.** "Start your trip" over chiptune music.
2. **Airport arrival.** Pixel-art terminal, a "Bienvenue à Paris" sign. Walk with arrow keys or WASD.
3. **SIM kiosk mission.** Hold space to talk to the clerk by voice. Luna's hints pop up as texts on the in-game phone.
4. **SIM activation.** The clerk asks for your number. You type your real phone number into an in-game form.
5. **Real phone rings.** Luna calls via Dial, introduces herself, and has you repeat one phrase. She texts your first mission: get a coffee.
6. **The street.** Exit the airport into one open Paris street with a café, a boulangerie, a market (locked) and a hostel. Locals wander it, and you can walk up to any of them and chat freely in open play.
7. **Café mission.** Order by voice. Mastered phrases drop into your backpack as items; fumbled ones are logged.
8. **Skip to evening.** A button fast-forwards the day and triggers Luna's debrief call, built around the phrases you missed.
9. **Unlock.** Nail the phrase on the call and the market district unlocks in the game.
10. **Hostel.** Day summary: phrases learned, stars, euros left, tomorrow's map.

Full-product journey (pitch only, not built today): Luna texts a morning mission, places a 60-second pop-quiz call at lunch, and debriefs in the evening, within user-set quiet hours. New cities (Lyon, Marseille, Montréal) unlock new accents and slang.

## Features and requirements

P0 is what the demo cannot run without; P1 ships only if P0 is done by 5pm.

| Feature | Requirement | Priority |
|---|---|---|
| Scenes | Airport, street, hostel as full background images with invisible collision boxes and door triggers | P0 |
| Movement | One player sprite, 4-direction walk, bob animation, camera follow | P0 |
| Voice NPCs | Hold-to-talk near an NPC; reply in character within 3 s, shown in a typewriter dialogue box and spoken aloud | P0 |
| Grading | Every NPC turn returns phrases used, phrases missed, hint, mission complete | P0 |
| SIM activation | Phone-number input triggers Luna's first real call and a mission text | P0 |
| In-game phone | Shows Luna's texts and the active mission | P0 |
| Backpack | Mastered phrases appear as inventory items | P0 |
| Time skip | "Skip to evening" button triggers the debrief call | P0 |
| Live sync | Luna's call reads missed phrases and awards unlocks through Dial Context MCP | P0 |
| Map unlock | Market district opens after a successful debrief | P1 |
| Euros | Fumbling a negotiation costs money; balance shown in HUD | P1 |
| Adaptive NPCs | NPCs slow down and gesture more for beginners | P1 |
| Stars | 1 to 3 stars per mission based on hints used | P1 |

**Guide persona: Luna.** A warm, slightly teasing Parisian in her twenties. She speaks mostly French, slows down and switches to English only when you are stuck, and always discloses she is an AI on the first call. Same name, voice and memory in the game and on the phone.

**Open-play NPCs.** Beyond mission NPCs, locals with their own personas wander the street; walk up to anyone and talk about anything. They use the same NPC endpoint with no mission goal (`mission_complete` stays null), but still log phrases used and missed, so open-play chats feed Luna's debrief too. Each remembers your past conversations.

| NPC | Where | Persona | What they teach | Priority |
|---|---|---|---|---|
| Monsieur Girard | Bench with his dog | Retired, slow, patient, loves neighborhood history | Beginner small talk | P0 |
| Margaux | Boulangerie | Brisk owner; turns cold if you skip "Bonjour" first | Politeness etiquette, ordering | P0 |
| Inès | Hostel desk | Friendly receptionist, half-bilingual | Directions, next missions | P1 |
| Théo | Street corner, busking | Student, fast talker, slang and verlan | Casual and slang French | P1 |

P1 stretch: a relationship meter per NPC that warms up as you talk, unlocking new topics.

**Art direction.** 16-bit top-down pixel art in the spirit of Soul Knight, without copying its sprites. Generate scenes and sprites with Gemini from one locked style prompt: "16-bit pixel art, top-down, limited palette, Paris café colors, transparent background." Add a chunky pixel font, typewriter dialogue, and a screen shake when the phone buzzes.

## Technical architecture

One Node backend owns all player state; the game and Luna's phone calls both read and write it, so the two never disagree. The game and the phone never talk directly; both go through the backend, so an unlock earned on a call appears in the game.

| Layer | Choice | Why |
|---|---|---|
| Game client | Phaser 3 + Vite + TypeScript, runs in Chrome | Fast to build, many examples, no install for judges |
| In-game voice | Hold-to-talk recording → Gemini (audio in) → browser or Gemini TTS | One call hears, replies in character and grades |
| Backend | Node + Express | NPC endpoint, game state, Dial webhooks, MCP tools |
| State | SQLite (one file) | Zero setup; one demo player at a time |
| Phone guide | Dial: number, outbound calls, SMS, transcript webhook, Context MCP | Real phone presence; partner prize |
| Hosting | Railway or Render, ngrok as fallback | Dial webhooks and MCP need a public URL |
| Art | Gemini image generation | Scenes and sprites from one style prompt |

The NPC endpoint contract, Dial integration, MCP tools and data model are in [CONTRACT.md](CONTRACT.md).

## Build plan

The airport-to-phone-call loop must work end to end by 3pm; if it slips, everyone swarms it before touching anything else. Everything after 3pm builds on the phone loop, so that checkpoint is the one date that cannot move.

| Role | Owns | First deliverable |
|---|---|---|
| A, game | Phaser scenes, movement, triggers, dialogue box, phone and backpack UI | Walkable airport with SIM kiosk trigger |
| B, voice NPCs | Hold-to-talk capture, Gemini NPC endpoint, JSON grading, NPC prompts | Clerk replies by voice in character |
| C, Dial and backend | Express server, SQLite, Dial calls and SMS, webhook, MCP tools, hosting | Entering a number makes a phone ring |
| D, assets and pitch | Gemini art, sound, pitch, backup video, demo script | Locked style prompt and airport background |

With three people, A also takes assets and C takes the pitch.

**Cut order if behind schedule**

1. Euros and haggling.
2. Stars and adaptive NPC speed.
3. Market district (keep the unlock animation, show a "coming soon" sign).
4. Live MCP sync; fall back to passing missed phrases in the call instruction.

Never cut: SIM activation call, café mission, debrief call.

## Risks and demo

The biggest risks are live-demo failures, not features; each has a fallback ready before 7pm.

| Risk | Mitigation |
|---|---|
| Venue wifi drops | Phone hotspot on standby; test the full demo on it once |
| Dial call fails or is slow | Test with every teammate's phone before 5pm; backup video of the call |
| Gemini voice latency over 3 s | Short NPC replies; typewriter box and a "thinking" animation hide the wait |
| Mic permission blocked | Use Chrome, grant permission before going on stage |
| Generated art looks inconsistent | One locked style prompt; all art done by 3pm, then frozen |
| Speech recognition misses accented beginners | Grade on intent and key phrases, not exact wording |

**Demo script (5 minutes)**

1. **Hook (30 s).** "Language apps take years. What if you could survive your trip in an afternoon?"
2. **Live play (2 min).** A judge who doesn't speak French lands at the airport and buys a SIM by voice.
3. **The moment (30 s).** The judge enters their number and their real phone rings. Luna says bonjour.
4. **Café and debrief (1.5 min).** Order a coffee, fumble a phrase, skip to evening, Luna calls about exactly that phrase, the market unlocks on screen.
5. **Close (30 s).** The vision: Luna throughout your day, new cities, new dialects. Name Dial as the reason the phone guide exists.

## Open questions

- Final product name: Backpack, or something else?
- Which real-time TTS voice for Luna on Dial calls?
- Does the Dial Context MCP require auth on our `/mcp` endpoint?
- Team size: three or four people?
