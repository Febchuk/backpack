# Demo hardening (L4)

The L4 gate is three full rehearsals in a row with no crash. This checklist gets us there, and makes sure every live service has a recorded fallback before we walk on. The run sheet itself, with the on-stage fallback lines, is `docs/DEMO_SCRIPT.md`.

Times assume the PRD schedule: the 3pm checkpoint (the L2 gate and the art freeze) and fallbacks ready by 7pm.

## 1. Record the backup video (by 5:30pm)

Record on the demo laptop, in Chrome, on real services (`MOCK_DIAL` and `MOCK_GEMINI` off), with the exact build we will demo. Use QuickTime screen recording with the system audio and the internal mic, and film the phone at the same time (a second phone on a stand, or a screen recording on the phone itself).

Record three clips, each a separate file on the desktop:

- [ ] **Intro call clip (about 40 s).** The phone number being submitted, then **a real Dial call**: the phone ringing, being answered on speaker, Luna's "bonjour", her saying she is an AI, the judge repeating one phrase, and the mission SMS arriving. The audio of both sides must be audible. Put the phone next to the laptop mic, or record the phone's screen with its audio.
- [ ] **Debrief call clip (about 50 s).** The click on **Skip to evening ☾**, **a real Dial debrief call** that names the phrase that was actually missed, the player saying it back, and the game screen flashing and the market sign flipping to **OUVERT !**. Keep the phone and the game screen both in frame, or cut between them without a gap. This clip is the proof that the voice call changes the game.
- [ ] **Full run (about 5 min).** The whole run sheet from the title screen, in one take, including the café miss.

For every clip:

- [ ] Use a fresh player (`POST /dev/reset`) so the backpack starts empty.
- [ ] Hide personal phone numbers: blur the number field, or use a teammate's number we're happy to show.
- [ ] Watch it back once with sound through the venue-style speakers. Trim the dead air at the start.
- [ ] Copy each file to the desktop **and** a USB stick, queued in a player and paused on frame 1.
- [ ] Note the timestamp in the debrief clip where the market opens (the "gate still shut" fallback jumps to it).

## 2. Test once on a phone hotspot (by 6pm)

Venue wifi is the most likely failure. Prove the demo survives without it.

- [ ] Turn on the hotspot on a phone that is **not** the judge's phone, the driver's phone for example.
- [ ] Turn off the laptop's wifi to the venue network, join the hotspot, and confirm `curl -s localhost:8787/health`.
- [ ] Confirm `PUBLIC_URL` (the tunnel) still reaches the server from outside: open `${PUBLIC_URL}/health` on a phone using mobile data.
- [ ] Run the full run sheet once, end to end, on the hotspot: both calls, voice turns, and the market unlock.
- [ ] Record the timings: NPC reply latency (target under 3 s), time from submitting the number to the ring (target under 10 s), and time from Luna's "c'est ouvert" to the gate opening (target under 4 s).
- [ ] If any target is missed on the hotspot, decide now which fallback line that beat uses, and tell the presenter.
- [ ] Leave the hotspot set up with its password saved on the laptop, so switching over is one click.

## 3. Three back-to-back rehearsals (by 7pm)

This is the L4 gate. "Back to back" means no code changes, restarts or redeploys between runs. Only the state reset is allowed.

| Run | Who plays the judge | Network | Result | Notes (stalls, timings, fallbacks used) |
|---|---|---|---|---|
| 1 | A teammate who doesn't speak French | Venue wifi | ☐ pass ☐ fail | |
| 2 | A different teammate | Venue wifi | ☐ pass ☐ fail | |
| 3 | Anyone, on the judge's style of phone | Hotspot | ☐ pass ☐ fail | |

For each run:

- [ ] `POST /dev/reset`, reload the game, and start from the title screen.
- [ ] Time it against the run sheet with a stopwatch. It must finish in 5:00.
- [ ] Use real calls, a real phone, real voice, and the actual phrase card.
- [ ] The presenter and the driver practise one fallback line per run (for example, the driver pretends the debrief didn't ring and plays the clip).
- [ ] A crash, a reload that wasn't planned, or a stuck state is a **fail**, and the count restarts at zero after the fix.

After three passes: freeze the build. Tag the commit (`git tag demo-final`) and change nothing after that.

## 4. PRD cut order and when to decide

Cut from the top. Each cut has a deadline: if the feature isn't green in tests **and** in one live run by that time, cut it and don't look back. The person who owns the integrator lane makes the call. Never cut the SIM activation call, the café mission or the debrief call.

| # | Cut | Decide by | What a cut means |
|---|---|---|---|
| 1 | **Euros and haggling** | **4:30pm** | Hide the euro counter and the day summary's euros line. The economy can stay in the server, unused. |
| 2 | **Stars and adaptive NPC speed** | **5:00pm** | Hide the stars. NPCs speak at the normal rate. Drop the stage-direction hints. The day summary shows phrases only. |
| 3 | **Market district** | **5:30pm** | Keep the unlock animation and the **OUVERT !** sign, with the "coming soon" toast at the gate. Nothing past the gate. (This is already the L3 behaviour, so the cut costs nothing.) |
| 4 | **Live MCP sync** | **6:00pm** | Luna stops calling `mark_phrase_mastered` and `unlock_district` live. The debrief instruction still names the missed phrase, and the unlock comes from the `call.transcribed` webhook grading after the call ends, so it shows a few seconds later. Update the run sheet's market beat: "when Luna hangs up, the gate opens." |

The 6pm cut is the last one, so the hotspot test and three rehearsals run on the final feature set. Inès and Théo are open-play extras. They aren't on the cut list because they cost no stage time: if their personas aren't ready by 5pm, leave them out of the scene and keep the sprites.

## Final 30 minutes

- [ ] Run the pre-stage checklist in `docs/DEMO_SCRIPT.md`.
- [ ] Fully charge the laptop, the driver's phone and the hotspot phone.
- [ ] Do one last `POST /dev/reset`, and leave the game on the title screen.
