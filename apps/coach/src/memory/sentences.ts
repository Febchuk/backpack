import type { Relation } from "@backpack/shared/coach";

const FACT_SENTENCE: Record<Relation, (o: string) => string> = {
  goal: (o) => `Goal: ${o}`,
  trip_to: (o) => `Travelling to ${o}`,
  trip_date: (o) => `Trip date: ${o}`,
  interested_in: (o) => `Interested in ${o}`,
  likes: (o) => `Likes ${o}`,
  dislikes: (o) => `Dislikes ${o}`,
  travelling_with: (o) => `Travelling with ${o}`,
  struggles_with: (o) => `Struggles with ${o}`,
  knows_phrase: (o) => `Knows the phrase "${o}"`,
  anxious_about: (o) => `Anxious about ${o}`,
  level: (o) => `Level ${o}`,
};

/** A graph fact as a short English sentence: "Travelling to lyon". */
export const factSentence = (rel: Relation, object: string) => FACT_SENTENCE[rel](object);
