import { describe, expect, it } from "vitest";
import "dotenv/config";

const LIVE = process.env.LIVE === "1" && !!process.env.DIAL_API_KEY;

describe.skipIf(!LIVE)("@live L2 Dial account", () => {
  it("@live the configured from-number exists, is ready, and can call", async () => {
    const res = await fetch("https://api.getdial.ai/v1/numbers", {
      headers: { Authorization: `Bearer ${process.env.DIAL_API_KEY}` },
    });
    expect(res.status).toBe(200);
    const { numbers } = (await res.json()) as { numbers: { id: string; setupStatus: string; callingEnabled: boolean }[] };
    const n = numbers.find((x) => x.id === process.env.DIAL_FROM_NUMBER_ID);
    expect(n, "DIAL_FROM_NUMBER_ID not on account").toBeTruthy();
    expect(n!.setupStatus).toBe("ready");
    expect(n!.callingEnabled).toBe(true);
  });
});
