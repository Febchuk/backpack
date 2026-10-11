import { describe, expect, it } from "vitest";
import { DialTranscript, MISSIONS, MissionKey, NpcId, NpcTurnResponse, PlayerState, normalizePhrase } from "@backpack/shared";
import npc from "@backpack/shared/fixtures/npcTurn.cafe.json";
import state from "@backpack/shared/fixtures/playerState.new.json";
import transcript from "@backpack/shared/fixtures/dialTranscript.debrief.json";

describe("L0 contract", () => {
  it("fixtures match their schemas", () => {
    expect(NpcTurnResponse.safeParse(npc).success).toBe(true);
    expect(PlayerState.safeParse(state).success).toBe(true);
    expect(DialTranscript.safeParse(transcript).success).toBe(true);
  });

  it("missions reference valid NPCs and chain to valid missions", () => {
    for (const m of Object.values(MISSIONS)) {
      expect(NpcId.safeParse(m.npc).success).toBe(true);
      if (m.next) expect(MissionKey.safeParse(m.next).success).toBe(true);
      expect(m.required.length).toBeGreaterThan(0);
    }
  });

  it("normalizePhrase ignores case, accents and punctuation", () => {
    expect(normalizePhrase("Je voudrais un CAFÉ, s'il vous plaît !")).toBe("je voudrais un cafe s'il vous plait");
    expect(normalizePhrase("C'est combien ?")).toBe("c'est combien");
  });
});
