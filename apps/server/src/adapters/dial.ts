import type { Config } from "../config";
import type { DialAdapter } from "./types";

/** L0 stub. Backend lane replaces with a recording mock + real Dial. */
export function createDialAdapter(_config: Config): DialAdapter {
  let n = 0;
  return {
    async call() {
      return { call_id: `mock_call_${++n}` };
    },
    async sms() {
      return { id: `mock_sms_${++n}` };
    },
  };
}
