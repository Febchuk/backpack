# Tolu demo — run sheet

A hardcoded, four-minute demo of Backpack as an AI local fixer. With `COACH_DEMO=1` the coach stops using Gemini for
texts: Tolu answers from the fixed script in `apps/coach/src/demo/script.ts`, and the practice call uses a locked
waiter prompt. Venue perks (the password, the private exhibit) are illustrative and labelled as such.

## Setup (once)

1. In the console, create agent **Tolu** (French, Paris), give it a voice, attach the Dial number.
2. Set on the coach (Railway) and redeploy:

   | Variable | Value |
   | --- | --- |
   | `COACH_DEMO` | `1` |
   | `DEMO_BRUNCH_VENUE` | the chosen brunch spot's name |
   | `DEMO_TIKTOK_URL` | the selected real TikTok clip |
   | `DEMO_REVIEWS_URL` | the venue's Google Maps listing |
   | `DEMO_BIKE_ROUTE_URL` | a Google Maps bike route along the Seine |

   Empty URLs are left out of the texts and the card, never invented.
3. The ElevenLabs agent must allow prompt and first-message overrides (already needed for normal calls).

## Running it

| Time | Presenter does | Tolu does (automatically) |
| --- | --- | --- |
| 0:00 | Console → **Demo** → type your number → **Start demo**. Switch to Messages. | Intro text, then "when do you land…" |
| 0:15 | Texts: *Friday night, five days. Intimate music spots, unusual bars…* | "Okayyy, got you. And how's your French?…" |
| 0:40 | Texts: *I can order basic things, but I get lost…* | "Let me put together something…", then the itinerary one stop per text. Console shows the itinerary card. |
| 1:40 | Texts: *Love it. Let's do that.* | "Niceee… I'll call you and pretend I'm the server… Sound good?" |
| 1:50 | Texts: *Yep, call me.* | "Calling you now 📞", then your phone rings ~2 s later |
| 2:00 | Answer on speaker. Say: *Je voudrais le plat hors carte, s'il vous plaît.* → *Oh, sorry. I don't know what all of that means.* → *Ahh, okay. Le jardin.* → *Yeah, sounds good.* | Waiter lines, the switch to English, the wrap-up, "Perfect. Speak tomorrow!", hangs up |
| 3:10 | — | ~4 s after hang-up: notes text, "Text me your order…", then the voice note |
| 3:40 | Close. Point at the console stat: **30 → 13 min · pending measurement**. | (One more text from you gets "Perfect 👌 That's exactly it. Speak tomorrow!") |

Several quick texts in a row count as one reply: Tolu waits ~2.5 s after your last text.

## Fallbacks

- **Follow-up didn't arrive after the call:** console → **Send follow-up**.
- **Call didn't ring:** the learner row's **Call me** button places the same call.
- **Anything went wrong:** **Start demo** again with the same number wipes that run and restarts from the intro.

## Rehearse locally

```sh
COACH_DEMO=1 DEMO_DELAY_SCALE=0.2 pnpm --filter @backpack/coach dev   # mocks on, 5× faster
pnpm --filter @backpack/console dev
pnpm exec vitest run tests/coach/demo.test.ts
```
