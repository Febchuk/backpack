import { ONBOARDING_STEPS, type OnboardingStep, type Relation } from "@backpack/shared/coach";
import type { Agent, Learner } from "../db/repo";
import { languageName } from "./prompt";

/** The relations each onboarding answer is expected to carry. */
export const STEP_FACTS: Record<Exclude<OnboardingStep, "done">, Relation[]> = {
  trip: ["trip_to", "trip_date", "travelling_with"],
  level: ["level"],
  activities: ["interested_in", "likes"],
  worries: ["anxious_about"],
};

const GREETINGS: Record<string, string> = { fr: "Coucou", es: "¡Hola", de: "Hallo", it: "Ciao", pt: "Olá", ja: "こんにちは" };

export function nextStep(step: OnboardingStep): OnboardingStep {
  return ONBOARDING_STEPS[Math.min(ONBOARDING_STEPS.indexOf(step) + 1, ONBOARDING_STEPS.length - 1)];
}

/** The English question asked at `step`; null once onboarding is done. */
export function onboardingQuestion(step: OnboardingStep, agent: Agent): string | null {
  const lang = languageName(agent.language);
  switch (step) {
    case "trip":
      return "Tell me about your trip: where are you going, when, and who with?";
    case "level":
      return `How's your ${lang} right now? Total beginner, can get by, or pretty comfortable? (A1 to C1 if you know it.)`;
    case "activities":
      return "What do you want to do while you're there? Food, music, museums, nightlife, hiking...";
    case "worries":
      return `Last one: what situation makes you most nervous about speaking ${lang} there?`;
    case "done":
      return null;
  }
}

/** The first text a new learner gets: a greeting in the target language, then the trip question. */
export function welcomeText(agent: Agent, learner: Learner): string {
  const greet = GREETINGS[agent.language.split("-")[0].toLowerCase()] ?? "Hi";
  const name = learner.display_name ? ` ${learner.display_name}` : "";
  return (
    `${greet}${name}! I'm ${agent.name}, a local in ${agent.persona_city}. ` +
    `I'll be your ${languageName(agent.language)} buddy by text, voice note or call. ` +
    onboardingQuestion("trip", agent)
  );
}
