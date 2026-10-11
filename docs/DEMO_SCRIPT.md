# Demo run sheet (5 minutes)

**Roles.** The **presenter** speaks and hands over the laptop. The **driver** sits off to the side with a second terminal and a phone, watches the screen and runs the fallbacks. The **judge** plays the game and says the French lines.

Goal: a judge who speaks no French buys a SIM card, gets a real call from Luna, orders a coffee by voice, fumbles one phrase, and gets a second call that drills exactly that phrase and opens the market. Never cut the SIM activation call, the café mission or the debrief call.

## The L3 loop in one line

Café: the judge orders, then fumbles the price question → that phrase is logged as `missed` → **Skip to evening** places the debrief call, whose instruction names that phrase → the judge says it back → Luna calls `mark_phrase_mastered` and `unlock_district`, and the game shows the market open within 4 s of the tool call, through `/state` polling.

The fumble is designed in, not left to luck. The phrase card shows the two lines the judge needs to succeed. The price question, **"C'est combien ?"**, is not on the card. The presenter asks the judge to try it from memory, and a first try almost always comes out wrong. That gives the debrief its phrase.

## Run sheet

Each beat has a **fallback line**: what the presenter says, word for word, if a live service fails at that beat. The driver acts. The presenter never debugs on stage.

| Time | Beat | Who does what | What gets said | If it fails |
|---|---|---|---|---|
| 0:00–0:30 | **Hook** | The presenter stands beside the title screen ("Start your trip", chiptune playing). | Presenter: "Language apps take years. What if you could survive your trip in an afternoon?" | Game won't load: driver reloads once. Presenter: "While Paris loads, picture the arrivals hall at Charles de Gaulle." Second failure: driver plays the full-run backup video. |
| 0:30 | Hand-off | The presenter clicks **Start your trip** and hands the laptop to the judge. | Presenter: "You just landed in Paris. Arrow keys or WASD to walk. Hold space to talk." | — |
| 0:30–1:15 | **Airport** | The judge walks under the "BIENVENUE À PARIS" sign to the SIM kiosk on the left. | Presenter, pointing at the in-game phone: "That's Luna. She texts you hints." | — |
| 1:15–2:15 | **SIM kiosk (voice)** | The judge holds **space** next to the clerk and speaks. Luna's hint appears on the in-game phone. | Judge: **"Bonjour, je voudrais une carte SIM"**. The clerk replies in a typewriter box and asks for a number. | Mic blocked or Gemini slow (no reply after 5 s): driver presses **T** for text mode, the judge types the line. Presenter: "Venue mics hate us, so let's type it. Same AI on the other end." |
| 2:15–2:45 | **The moment** | The judge types their real phone number into the in-game form and submits. Their phone rings. | The judge answers on speaker. Luna says bonjour, says she is an AI, and has them repeat one phrase. She texts the first mission: get a coffee. | No ring after 15 s: Presenter: "Dial is ringing a real phone on venue wifi, so here's the call we recorded this morning." Driver plays the call backup video, then the game carries on (the mission is already active). |
| 2:45–3:05 | **Street** | The judge walks out through the SORTIE door on the right, then to the café with the red awning. | Presenter: "Every local here is an AI you can talk to: Monsieur Girard on the bench, Margaux at the boulangerie, Théo busking on the corner." | — |
| 3:05–3:45 | **Café (voice), the miss** | The judge holds **space** next to the barista. | Judge, from the card: **"Bonjour, je voudrais un café s'il vous plaît"**. The mission completes and the phrases drop into the backpack. Presenter: "Now ask how much. It's not on your card, so just have a go." The judge tries **"C'est combien ?"** from memory. | Gemini slow or wrong: text mode as above. Presenter: "Let's type it, the barista doesn't mind." If the judge **nails** the price on the first try: Presenter: "Too good! Let's see what you missed today." The driver checks `/state` for a `missed` phrase (see below). If there is none, the judge asks Margaux for something and has another go at "C'est combien ?", which is still open play and still logged. |
| 3:45–4:30 | **Skip evening → debrief call** | The judge clicks **Skip to evening ☾**. The phone rings again. The judge answers on speaker. | Presenter: "Evening. Luna knows exactly what you fumbled." Luna: "Bonsoir ! C'est Luna, ton guide IA", then drills that one phrase. The judge says it back. | No ring after 15 s, or the call drops: Presenter: "That's Dial calling a real phone. Here's last night's debrief." Driver plays the debrief backup video. |
| 4:30–4:45 | **Market unlock** | Within 4 s of Luna saying the market is open, the screen flashes, the sign over the market gate flips from FERMÉ to **OUVERT !**, and the toast reads "The market district is now open!" The judge walks to it. | Presenter: "She heard you say it on a real phone call, and the game changed. The market is open." | Gate hasn't opened 10 s after the call ends (MCP sync or webhook lag): Presenter: "Luna's paperwork is slower than she is." Driver reloads the game tab once, since a reload re-reads `/state`. Still shut: Presenter: "In the recording you can see the gate open the moment she says *c'est ouvert*." Driver shows the final seconds of the debrief backup video. |
| 4:45–5:00 | **Close** | The presenter takes the laptop back. | Presenter: "Luna stays with you all day, with new cities and new dialects next. Dial is the reason a guide can live on your real phone." | — |

**If a beat stalls but nothing has failed:** the driver says nothing on stage. At 30 seconds over time, the presenter narrates over it ("Luna's thinking…"). After 60 seconds over, skip to the fallback for that beat.

**L4 extras, only if they're in the build and the clock allows:** after the market unlock, the judge walks into the hostel. Inès at the desk greets them, and the day summary shows the phrases learned, stars per mission and euros left. Presenter: "Your day in one screen: what you learned, what you spent." This is the first thing dropped when the run is long.

## Driver's quick commands

Run these from the second terminal. `PID` is the player id from DevTools → Application → Local Storage → `backpack.player_id`. Copy it at the hand-off.

```bash
# What did the judge miss? Look for "status":"missed"
curl -s localhost:8787/state/$PID | jq '.phrases'

# Is the server alive?
curl -s localhost:8787/health
```

There is no manual "unlock" button with real Dial. `/dial/webhook` refuses unsigned transcripts once `MOCK_DIAL` is off, and that is deliberate. The fallback for a failed call is the backup video, never faking state on stage.

## Pre-stage checklist

From the PRD risks table. Finish all of it before walking on. The full hardening plan (backup video, hotspot test, rehearsals, cut order) is in `docs/DEMO_HARDENING.md`.

- [ ] **Chrome** is the browser, up to date, and the game is open full screen at the title screen. Close other tabs.
- [ ] **Mic permission** has been granted to the game's origin in Chrome. Test hold-to-talk once with the clerk, then reload.
- [ ] **Hotspot**: the phone hotspot is on and the laptop has joined it, or is one click away. The full demo has been run once on the hotspot.
- [ ] **Backup videos** (the intro call, the debrief call with the market opening, and the full run) are on the desktop, queued in a player, sound checked.
- [ ] **Dial call** was tested with every teammate's phone before 5pm. Today's test call connected in under 10 s.
- [ ] **Judge's phone** is ringer on, not on Do Not Disturb, and on speaker for both calls.
- [ ] **Volume**: laptop audio is routed to the venue speakers and the chiptune level is checked.
- [ ] **Voice latency**: NPC replies arrive within 3 s on the venue network, and the "thinking" animation shows while they wait.
- [ ] **Art** has been frozen since 3pm, with no asset changes after the last rehearsal.
- [ ] **Rehearsal**: three full runs in a row without a crash.
- [ ] **State reset**: `POST /dev/reset`, then a fresh player, with the market locked and the backpack empty.
- [ ] **Driver terminal** is open with the commands above, and `jq` is installed.
- [ ] **Phrase card** for the judge, in large type, with **only** these two lines (the price question stays off the card, so there is something to debrief):
  - "Bonjour, je voudrais une carte SIM"
  - "Bonjour, je voudrais un café s'il vous plaît"
