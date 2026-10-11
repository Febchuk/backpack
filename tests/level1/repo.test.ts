import { describe, expect, it } from "vitest";
import { openDb } from "../../apps/server/src/db/db";
import { repo } from "../../apps/server/src/db/repo";

describe("L1 repo (integrator)", () => {
  it("phrase lifecycle: used → practicing → mastered; missed never downgrades mastered", () => {
    const r = repo(openDb(":memory:"));
    const id = r.createPlayer();
    r.logTurn(id, ["Bonjour"], ["c'est combien ?"]);
    expect(r.phraseStatus(id, "bonjour")).toBe("practicing");
    expect(r.missedPhrases(id)).toEqual(["c'est combien ?"]);
    r.logTurn(id, ["bonjour"], []);
    expect(r.phraseStatus(id, "bonjour")).toBe("mastered");
    r.logTurn(id, [], ["bonjour"]);
    expect(r.phraseStatus(id, "bonjour")).toBe("mastered");
  });

  it("completing sim_kiosk activates cafe_order", () => {
    const r = repo(openDb(":memory:"));
    const id = r.createPlayer();
    r.completeMission(id, "sim_kiosk");
    expect(r.missionStatus(id, "sim_kiosk")).toBe("done");
    expect(r.missionStatus(id, "cafe_order")).toBe("active");
  });
});
