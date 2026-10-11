/** Lists the Dial numbers on the account. Usage: pnpm exec tsx scripts/dial/numbers.ts */
import { dialFromEnv, fail, listOf } from "./lib";

type DialNumber = { id: string; number: string; setupStatus?: string; callingEnabled?: boolean; capabilities?: string[] };

async function main() {
  const dial = dialFromEnv();
  const numbers = listOf<DialNumber>(await dial("GET", "/v1/numbers"), "numbers");
  if (numbers.length === 0) return console.log("No numbers on this account.");
  const configured = process.env.DIAL_FROM_NUMBER_ID;
  for (const n of numbers) {
    const mark = n.id === configured ? "  <- DIAL_FROM_NUMBER_ID" : "";
    console.log(
      `${n.id}  ${n.number}  setupStatus=${n.setupStatus ?? "?"}  callingEnabled=${n.callingEnabled ?? "?"}  capabilities=${(n.capabilities ?? []).join(",") || "?"}${mark}`,
    );
  }
  if (!configured) console.log("\nSet DIAL_FROM_NUMBER_ID in .env to the id of a number that is ready, can call and send SMS.");
  else if (!numbers.some((n) => n.id === configured)) console.log(`\nDIAL_FROM_NUMBER_ID=${configured} is not on this account.`);
}

main().catch(fail);
