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

export function debriefInstruction(missedPhrases: string[]): string {
  const list = missedPhrases.length ? missedPhrases.map((p) => `- "${p}"`).join("\n") : "- (none today)";
  const practice = missedPhrases.length
    ? `Practise each phrase, one at a time: say it slowly, give its meaning in a few English words, ask the player to say it back, then stop talking and wait for their answer.
When they say it correctly, praise them and call mark_phrase_mastered with the phrase exactly as written above.
If they miss it twice, say it once more, encourage them, and move on.
As soon as one phrase is mastered, call unlock_district with district "market" and tell them the market is now open in the game.`
    : `There is nothing to practise: congratulate them, ask in simple French how their day went, and react warmly.`;
  return `${LUNA_PERSONA}

This is the evening debrief call. Open with: "Bonsoir ! C'est Luna, ton guide IA." Keep the whole call to about a minute.
Today the player missed these phrases (say them exactly as written):
${list}

First call get_missed_phrases to confirm the list. Your tools already know who is on the line, so leave player_id out.
${practice}
End the call warmly: "Bravo pour aujourd'hui. Bonne nuit !"`;
}
