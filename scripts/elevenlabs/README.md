# ElevenLabs agent for Luna (self-hosted voice)

In `VOICE_MODE=selfhosted`, every Dial call is bridged to one ElevenLabs Agents conversation
(`apps/server/src/voice/`). The server sends Luna's prompt, first message, language and voice as
per-call overrides, so the dashboard agent is a thin shell. Create it once by hand at
<https://elevenlabs.io/app/agents> (no script: nothing in this repo calls the ElevenLabs API).

## 1. Create the agent

- **Blank agent**, name `Backpack Luna`.
- **Agent language:** French. The server also sends `language: "fr"` on every call.
- **System prompt / first message:** any placeholder, e.g. `Tu es Luna.` / `Bonjour !`. Both are overridden per call.
- **LLM:** a fast model (e.g. Gemini Flash or GPT-4o mini). Latency matters more than depth here: turns are one sentence.
- **Voice:** a native French voice (see below). **TTS model:** Flash v2.5 (multilingual and the lowest latency).
- **Audio formats** (Voice tab → output format, Advanced tab → user input format): **μ-law 8000 Hz** for both.
  The bridge also accepts `pcm_16000`/`pcm_24000` and transcodes, but μ-law skips all audio work and matches Dial's `mulaw_8000`.
- **Max conversation duration:** 120 s. Dial cuts calls at 90 s and warns ~30 s before; the bridge relays that warning.
- **System tools:** enable **End call** (`end_call`). Luna hangs up with it; the bridge then lets the goodbye
  finish playing (`mark`) and sends Dial `end_call`.
- **Authentication:** may stay enabled (private agent): the server connects with the `xi-api-key` header.

## 2. Security → Overrides

Enable these four toggles (plus Voice speed if you set `ELEVENLABS_SPEED_OVERRIDE=1`); leave the others off:

| Toggle | Override the server sends |
| --- | --- |
| System prompt | `agent.prompt.prompt` (intro or debrief script from `luna/instructions.ts`) |
| First message | `agent.first_message` (the script's opening line) |
| Language | `agent.language` = `fr` |
| Voice ID | `tts.voice_id` = `ELEVENLABS_VOICE_ID` (only when set) |
| Voice speed (optional) | `tts.speed` = 0.85 for level-1 players, only when `ELEVENLABS_SPEED_OVERRIDE=1` |

A disabled override makes ElevenLabs reject the conversation at start.

## 3. Client tools

Tools → Add tool → type **Client**, with **Wait for response** on. They run inside our server against the
player on the call, so no `player_id` parameter.

| Name | Description | Parameters |
| --- | --- | --- |
| `get_missed_phrases` | French phrases the player missed today, newest first. | none |
| `mark_phrase_mastered` | Call when the player says a phrase correctly. Moves it into their backpack. | `phrase` (string, required): the French phrase, as written |
| `unlock_district` | Opens a district in the game. The only district is market. | `district` (string, required): district name, `market` |

Results come back as JSON strings, e.g. `{"ok":true,"district":"market"}`, or `{"error":"..."}` with `is_error: true`.

## 4. French voices to try

In the Voice Library, filter **Language: French**, **Accent: Parisian**, use case **Conversational**, and add
two or three to *My Voices*. A good start is **Anna – Natural and Conversational** (female, Parisian). Luna is
a warm Parisian in her twenties, so prefer young female conversational voices over narration ones. Compare
them on a real call: the phone line is 8 kHz, so pick the voice that stays clear at that rate. Copy the
voice id into `ELEVENLABS_VOICE_ID`; swapping voices needs no agent change.

## 5. .env

```
VOICE_MODE=selfhosted
ELEVENLABS_API_KEY=...        # never commit; never logged
ELEVENLABS_AGENT_ID=agent_...
ELEVENLABS_VOICE_ID=...       # optional: falls back to the agent's voice
DIAL_SELF_HOSTED_SECRET=...   # from: pnpm exec tsx scripts/dial/self-hosted.ts secret
```
