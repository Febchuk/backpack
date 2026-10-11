/**
 * Tolu's demo, word for word from the run sheet (docs/COACH_DEMO.md). Venue perks are illustrative and say so.
 * Beat 0 opens the chat; each later beat answers the presenter's next text.
 */
import type { ItineraryCard } from "@backpack/shared/coach";
import type { Config } from "../config";

type Assets = Config["demoAssets"];

export interface DemoMessage {
  text: string;
  /** Pause before this message, as if Tolu were typing. */
  delayMs: number;
  /** Attach the itinerary card for the console. */
  card?: boolean;
}

export interface Beat {
  messages: DemoMessage[];
  /** Ring the presenter once the messages are out. */
  then?: "call";
}

const withLinks = (text: string, links: [string, string][]) =>
  [text, ...links.filter(([, url]) => url).map(([icon, url]) => `${icon} ${url}`)].join("\n");

export function itineraryCard(a: Assets): ItineraryCard {
  const link = (label: string, url: string) => (url ? [{ label, url }] : []);
  return {
    title: "Saturday in Paris",
    stops: [
      {
        time: "11:30",
        title: `Brunch at ${a.brunchVenue}`,
        detail: "Off-menu mushroom-and-Comté toast. Password: “le jardin”.",
        badge: "Demo example",
        links: [...link("TikTok", a.tiktokUrl), ...link("Google reviews", a.reviewsUrl)],
      },
      {
        time: "2–5",
        title: "Louvre",
        detail: "Museum afternoon with the upstairs private-exhibition stop.",
        badge: "Illustrative access — requires venue confirmation",
        links: [],
      },
      {
        time: "5:30",
        title: "Bike ride along the Seine",
        detail: "A route with a few stops to take your time exploring.",
        links: link("Route", a.bikeRouteUrl),
      },
      {
        time: "Evening",
        title: "Music or a hidden bar",
        detail: "Moonshiner, for the unusual entrance.",
        links: [],
      },
    ],
  };
}

export function demoBeats(a: Assets): Beat[] {
  return [
    {
      messages: [
        {
          text: "Yoooo! I’m Tolu, your local AI fixer 🤝 Miku told me you’re pulling up to Paris in a few days. Super excited to help make this trip unforgettable.",
          delayMs: 0,
        },
        {
          text: "Before I start putting you on—when do you land, how long are you here, and what’s your vibe? Food, music, unusual spots? You trying to explore outside Paris too?",
          delayMs: 2500,
        },
      ],
    },
    { messages: [{ text: "Okayyy, got you. And how’s your French? Anything that makes you nervous?", delayMs: 1500 }] },
    {
      messages: [
        { text: "Ahh okay. We’ll work on that. Let me put together something you’ll actually be excited to go do first.", delayMs: 1500 },
        { text: "You land Friday night, so let’s give you a slow Saturday morning. Here’s what I’m thinking 👀", delayMs: 4000, card: true },
        {
          text: withLinks(
            `11:30 — Brunch at ${a.brunchVenue}\nThis spot fits your food taste. For our demo, the off-menu dish is a mushroom-and-Comté toast, and the password is “le jardin.” I’ll help you ask for it in French.`,
            [
              ["🎥", a.tiktokUrl],
              ["⭐", a.reviewsUrl],
            ],
          ),
          delayMs: 2500,
        },
        {
          text: "2–5 — Louvre\nA museum afternoon, with the upstairs private-exhibition stop shown in this sample itinerary. A little something to look forward to after brunch.\n(Illustrative access—requires venue confirmation)",
          delayMs: 2500,
        },
        {
          text: withLinks("5:30 — Bike ride\nI’ll send you a route along the Seine, with a few stops so you can take your time exploring.", [["🚲", a.bikeRouteUrl]]),
          delayMs: 2500,
        },
        {
          text: "Evening — Music or a hidden bar\nWe’ll pick somewhere that fits your energy after the ride. I’ve got Moonshiner in mind for the unusual entrance.",
          delayMs: 2500,
        },
        { text: "How’s that looking? Anything you’d swap?", delayMs: 1500 },
      ],
    },
    {
      messages: [
        { text: "Niceee. Let’s get you comfortable asking for that brunch dish. It’s right up your street food-wise.", delayMs: 1500 },
        { text: "I’ll call you and pretend I’m the server. We’ll try the order and the password. Sound good?", delayMs: 2000 },
      ],
    },
    { messages: [{ text: "Calling you now 📞", delayMs: 1000 }], then: "call" },
    { messages: [{ text: "Perfect 👌 That’s exactly it. Speak tomorrow!", delayMs: 1500 }] },
  ];
}

/** Sent once the practice call ends: notes, then a voice note of the phrases. */
export const FOLLOW_UP = {
  delayMs: 4000,
  texts: [
    "You got your order across 🙌 Here’s what we’ll come back to:\n\nLe plat hors carte — the off-menu dish\nLe mot de passe — the password\nVous le connaissez ? — do you know it?\n\nIf someone gives you a long reply, try:\nVous pouvez répéter plus lentement, s’il vous plaît ?\nCould you repeat more slowly, please?",
    "Text me your order once more when you get a sec. Here’s a voice note too—you can send one back.",
  ],
  voice: "Le plat hors carte. Le mot de passe. Vous le connaissez ? Et si c’est trop rapide : Vous pouvez répéter plus lentement, s’il vous plaît ?",
};

/** The waiter role-play. ElevenLabs still voices it live, so the prompt pins every line. */
export const DEMO_CALL = {
  firstMessage: "Bonjour ! Qu’est-ce que vous souhaitez commander ?",
  prompt: `You are Tolu, a friendly Paris local and language coach, role-playing a server at a Paris brunch spot so the learner can rehearse ordering the off-menu dish. This is a scripted product demo: say ONLY the lines below, word for word, in this order. Never add other sentences, never ask other questions, never improvise.

The call already opened with: "Bonjour ! Qu’est-ce que vous souhaitez commander ?" Do not repeat it.

Step 1. When the learner orders (they will say something like "Je voudrais le plat hors carte, s’il vous plaît"), say exactly:
"D’accord. Pour ce plat, il nous faut le mot de passe. Vous le connaissez ?"

Step 2. If they say they don't understand, or answer in English, switch to English and say exactly:
"No worries. I said, ‘For that dish, we need the password. Do you know it?’ ‘Le mot de passe’ means ‘the password.’ So here, you’d answer ‘le jardin.’"
(If instead they answer "le jardin" straight away, skip to step 3.)

Step 3. When they say "le jardin", say exactly:
"Exactly. You got the order across—the longer reply was the tricky bit. Tomorrow, we’ll break those replies into smaller pieces and work through them together. Thanks for making the time today. I’ll send you a few notes and a voice note so you can hear the phrases again. Same time tomorrow?"

Step 4. When they agree, say exactly: "Perfect. Speak tomorrow!" and then end the call.

If they say something unexpected, gently repeat the line for the current step. Keep a warm, relaxed tone and a natural pace.`,
};
