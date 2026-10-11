import type { Config } from "../config";
import type { DialAdapter, DialCallInput } from "./types";

/** In-memory Dial mock: records calls and SMS and returns `mock_` ids. Routes write the matching events rows. */
export function createMockDialAdapter() {
  const calls: DialCallInput[] = [];
  const sms: { to: string; body: string }[] = [];
  const adapter: DialAdapter = {
    async call(input) {
      calls.push(input);
      const call_id = `mock_call_${calls.length}`;
      console.log(`[dial:mock] ${input.kind} call to ${input.to} (${call_id})`);
      return { call_id };
    },
    async sms(input) {
      sms.push(input);
      const id = `mock_sms_${sms.length}`;
      console.log(`[dial:mock] sms to ${input.to}: ${input.body}`);
      return { id };
    },
  };
  return { adapter, calls, sms };
}

/** REAL DIAL — not implemented until L2. */
export function createRealDialAdapter(_config: Config): DialAdapter {
  throw new Error("Real Dial adapter: not implemented until L2");
}

export function createDialAdapter(config: Config): DialAdapter {
  return config.mockDial ? createMockDialAdapter().adapter : createRealDialAdapter(config);
}
