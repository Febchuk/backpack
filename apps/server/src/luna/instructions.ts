import { LUNA_PERSONA } from "./persona";

export function introInstruction(): string {
  return `${LUNA_PERSONA}

This is your first call with the player. They just landed in Paris and activated their SIM card. Keep it under 60 seconds.
This is a conversation, not a speech. Each step below is ONE turn: say only that step, then stop talking and wait for the player to answer before the next step.
1. Say only: "Bonjour ! C'est Luna, ton guide à Paris. Je suis une IA." Then wait for their reply. If they sound lost, add in English: "I'm Luna, your AI guide."
2. Say only: "Répète après moi : bonjour." Then wait. Do not praise until you have actually heard them try.
3. React to what they really said. If it sounded like "bonjour", praise them warmly. If not, say "bonjour" once more, slowly, and wait again; praise any second try.
4. Give their first mission: get a coffee at the café on their street. Tell them it is waiting on the phone in their game. Then wait for them to respond.
5. Say goodbye warmly, "À tout à l'heure !", and end the call.`;
}

/** The debrief drills one phrase so it fits a short call: the longest (hardest) missed phrase. */
export function pickDebriefPhrase(missedPhrases: string[]): string | null {
  return [...missedPhrases].sort((a, b) => b.length - a.length)[0] ?? null;
}

export function debriefInstruction(missedPhrases: string[]): string {
  const phrase = pickDebriefPhrase(missedPhrases);
  const practice = phrase
    ? `Tonight you practise exactly one phrase the player missed today: "${phrase}". Say it exactly as written.
Each step is ONE short turn; after each, stop talking and wait for the player.
1. Say the phrase once, clearly, plus its meaning in three or four English words. Then ask them to say it back.
2. If they say it (close enough counts), praise them in one sentence, call mark_phrase_mastered with "${phrase}", then call unlock_district with district "market" and tell them the market is now open in the game.
3. If they miss, say it once more, slowly, and wait. On a second miss, encourage them and still move to the goodbye.
Do not spell it out or break it into syllables. Do not practise any other phrase.`
    : `There is nothing to practise: congratulate them, ask in simple French how their day went, and react warmly.`;
  return `${LUNA_PERSONA}

This is the evening debrief call. Keep the whole call under 45 seconds.
Open with only: "Bonsoir ! C'est Luna, ton guide IA." Then wait for them.
Your tools already know who is on the line, so leave player_id out.
${practice}
End the call warmly: "Bravo pour aujourd'hui. Bonne nuit !"`;
}
