# Demo run sheet (5 minutes)

**Roles.** The **presenter** speaks and hands over the laptop. The **driver** sits off to the side, watches the screen and handles the fallbacks. The **judge** plays the game and says the French lines.

Goal: a judge who speaks no French buys a SIM card, gets a real call from Luna, and orders a coffee by voice. Never cut the SIM activation call, the café mission or the debrief call.

## Run sheet

| Time | Beat | Who does what | What gets said |
|---|---|---|---|
| 0:00–0:30 | **Hook** | The presenter stands beside the title screen ("Start your trip", chiptune playing). | Presenter: "Language apps take years. What if you could survive your trip in an afternoon?" |
| 0:30 | Hand-off | The presenter clicks **Start your trip** and hands the laptop to the judge. | Presenter: "You just landed in Paris. Arrow keys or WASD to walk. Hold space to talk." |
| 0:30–1:15 | **Airport** | The judge walks under the "BIENVENUE À PARIS" sign to the SIM kiosk on the left. | Presenter points to the in-game phone: "That's Luna. She texts you hints." |
| 1:15–2:30 | **SIM kiosk (voice)** | The judge holds **space** next to the clerk and speaks. Luna's hint appears on the in-game phone. | Judge: **"Bonjour, je voudrais une carte SIM"**. The clerk replies in a typewriter box and asks for a number. |
| 2:30–3:00 | **The moment** | The judge types their real phone number into the in-game form and submits. Their phone rings. | The judge answers on speaker. Luna says bonjour, says she is an AI, and has them repeat one phrase. She texts the first mission: get a coffee. |
| 3:00–3:20 | **Street** | The judge walks out through the SORTIE door on the right, then to the café with the red awning. | Presenter: "Every local here is an AI you can talk to: Monsieur Girard on the bench, Margaux at the boulangerie." |
| 3:20–4:00 | **Café (voice)** | The judge holds **space** next to the barista. | Judge: **"Bonjour, je voudrais un café s'il vous plaît"**, then **"C'est combien ?"**. Mastered phrases drop into the backpack. One fumbled phrase is fine, and the debrief needs it. |
| 4:00–4:30 | **Debrief** | The driver or judge clicks **Skip to evening**. The phone rings again. | Luna drills exactly the phrase they fumbled. When they nail it, the market gate unlocks on screen. |
| 4:30–5:00 | **Close** | The presenter takes the laptop back. | Presenter: "Luna stays with you all day, with new cities and new dialects next. Dial is the reason a guide can live on your real phone." |

**If a beat stalls:** the driver says nothing on stage. At 30 seconds over time, the presenter narrates over it ("Luna's thinking…"). If the call fails, the presenter says "Here's what that call sounds like" and the driver plays the backup video of the call.

## Pre-stage checklist

From the PRD risks table. Finish all of it before walking on.

- [ ] **Chrome** is the browser, up to date, and the game is open full screen at the title screen. Close other tabs.
- [ ] **Mic permission** has been granted to the game's origin in Chrome. Test hold-to-talk once with the clerk, then reload.
- [ ] **Hotspot**: the phone hotspot is on and the laptop has joined it, or is one click away. The full demo has been run once on the hotspot.
- [ ] **Backup video** of the Luna call and of the full run is on the desktop, queued in a player, sound checked.
- [ ] **Dial call** was tested with every teammate's phone before 5pm. Today's test call connected in under 10 s.
- [ ] **Judge's phone** is ringer on, not on Do Not Disturb, and on speaker for the call.
- [ ] **Volume**: laptop audio is routed to the venue speakers and the chiptune level is checked.
- [ ] **Voice latency**: NPC replies arrive within 3 s on the venue network, and the "thinking" animation shows while they wait.
- [ ] **Art** has been frozen since 3pm, with no asset changes after the last rehearsal.
- [ ] **Rehearsal**: three full runs in a row without a crash.
- [ ] **State reset**: a fresh player, with the market locked and the backpack empty.
- [ ] **Phrase card** for the judge with the three lines, in large type:
  - "Bonjour, je voudrais une carte SIM"
  - "Bonjour, je voudrais un café s'il vous plaît"
  - "C'est combien ?"
