> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# number.status_changed

> Event emitted each time one of a phone number's capabilities advances — provisioning, ready, failed, or banned.

Emitted every time one of your Dial numbers' capabilities moves. Provisioning a number returns as soon as the number itself is held, which can be before every channel on it works; this event tells you the moment each one becomes usable — so you can react instead of polling `GET /api/v1/numbers/{id}` in a loop.

## Capabilities settle separately

A number is not "provisioning" as a whole. Each capability has its own clock:

| Capability | Settles                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `sms`      | immediately — usable as soon as the number exists                                                                              |
| `imessage` | immediately (iMessage numbers only)                                                                                            |
| `call`     | immediately on a standard number; **asynchronously** on an iMessage number, which must verify its caller ID before it can dial |
| `whatsapp` | **asynchronously**, on its own registration (only when the WhatsApp opt-in was taken)                                          |

So two capabilities can be in flight, and they can disagree: a number whose WhatsApp was declined still sends SMS, places calls and messages over iMessage. That is why every capability reports its own status, and why **errors live only on the capability that owns them** — there is no number-level error field.

## The number's own status

`status` folds the capabilities into one value:

| `status`    | Meaning                                                                      |
| ----------- | ---------------------------------------------------------------------------- |
| `unsettled` | at least one capability is still working on it                               |
| `ready`     | every capability is ready                                                    |
| `degraded`  | nothing is still in flight, and at least one capability failed or was banned |

**`ready` and `degraded` are both terminal**, so waiting for "either" always resolves. Wait for only `ready` and you can wait forever: WhatsApp can decline a number outright, and no retry will change that — the number is finished setting up, just not perfectly.

Anything still in flight outranks a failure. A number with a failed WhatsApp track and a caller-ID check still running is `unsettled`, not `degraded`: it has not finished trying, and a terminal status would invite you to stop waiting.

A number can also leave `ready` and become `degraded` long after setup finished — that is what a `banned` capability means. Treat `ready` as the number's state today, not a promise about tomorrow, and keep handling this event for the life of the number rather than only while you are waiting for setup.

## Schema

Shares the common [event envelope](/api-reference/events/overview#envelope) (`id`, `object`, `type`, `version`, `createdAt`, `relatedObject`). `relatedObject` is `{ id: <phoneNumberId>, type: "phone_number", url: "/api/v1/numbers/<phoneNumberId>" }`. The envelope's `createdAt` is when the transition happened.

> **Note**
>
> **This event's payload is at `version: 2`.** Every other event is at `version: 1` — the version is per event type, not global, so branch on (`type`, `version`) rather than on `version` alone. Version 1 of this payload was flat (`setupStatus`, `setupError`, and `capabilities` as a string array); it could report only the line's own setup and had nowhere to put a WhatsApp failure or its cooldown.

| `data` field     | Type           | Description                                                                                                                                                                                                                                        |
| ---------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phoneNumberId`  | string         | Dial-issued ID for the number. Matches the `id` from `GET /api/v1/numbers`.                                                                                                                                                                        |
| `number`         | string         | The phone number in E.164, e.g. `+14155550123`.                                                                                                                                                                                                    |
| `status`         | string         | `"unsettled"`, `"ready"` or `"degraded"` — the fold over `capabilities`, described above.                                                                                                                                                          |
| `previousStatus` | string \| null | The settlement status the number left. `null` on the number's first event.                                                                                                                                                                         |
| `changed`        | array          | The capability names that moved in this transition. Empty on a number's first event, where nothing moved. Usually one name; two when a WhatsApp track settling is what released the line's `call` capability, since both move in the same instant. |
| `capabilities`   | object         | Capability name → its state. A capability the number does not have is **absent**, which is different from one that is present and not ready.                                                                                                       |

Each entry in `capabilities`:

| Field              | Type           | Description                                                                                                                                                                                                                    |
| ------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `status`           | string         | `"provisioning"`, `"warming_up"`, `"ready"`, `"failed"` or `"banned"`. See the table below.                                                                                                                                    |
| `previousStatus`   | string \| null | The status this capability left, set when it is one of the `changed` ones. Absent on a synchronous capability, which never transitions.                                                                                        |
| `error`            | string \| null | Human-readable reason, non-null when `status` is `"failed"` or `"banned"`. Safe to show a user. Absent on a synchronous capability, which cannot fail.                                                                         |
| `retryAvailableAt` | string \| null | ISO-8601 timestamp — **the cooldown**. When non-null, this capability refuses another attempt until then. `null` means you can retry now, or that no retry will help (`error` says which). Absent on a synchronous capability. |

### Capability status values

| `status`       | Meaning                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `provisioning` | still being set up                                                                                                                         |
| `warming_up`   | `whatsapp` only: registered, and warming up for about 6 hours before first use. Counts as still in flight, so the number stays `unsettled` |
| `ready`        | usable now                                                                                                                                 |
| `failed`       | setup did not complete. `retryAvailableAt` may say when another attempt is accepted                                                        |
| `banned`       | the channel was withdrawn from a line that **was** working                                                                                 |

`failed` and `banned` are both terminal but they are not the same ending. `failed` is a setup that never finished; `banned` is a working channel taken away afterwards, so `previousStatus` is `"ready"` and `retryAvailableAt` is always `null`. No retry recovers a banned channel — registering it on the number again is the only route back.

A banned capability leaves the number's `capabilities` array, because the number can no longer do that thing. The number's other channels are untouched: a number whose WhatsApp is banned still sends SMS and takes calls.

## Examples

An iMessage number finishing its caller-ID verification while WhatsApp is still going:

```json
{
  "id": "evt_9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c",
  "object": "event",
  "type": "number.status_changed",
  "version": 2,
  "createdAt": "2026-09-03T10:15:22.481Z",
  "relatedObject": { "id": "clx8k2j9h0001mk08w3t5r7qz", "type": "phone_number", "url": "/api/v1/numbers/clx8k2j9h0001mk08w3t5r7qz" },
  "data": {
    "phoneNumberId": "clx8k2j9h0001mk08w3t5r7qz",
    "number": "+14155550123",
    "status": "unsettled",
    "previousStatus": "unsettled",
    "changed": ["call"],
    "capabilities": {
      "sms": { "status": "ready" },
      "imessage": { "status": "ready" },
      "call": { "status": "ready", "previousStatus": "provisioning", "error": null, "retryAvailableAt": null },
      "whatsapp": { "status": "provisioning", "previousStatus": null, "error": null, "retryAvailableAt": null }
    }
  }
}
```

A standard number, whose whole lifecycle is one event:

```json
"data": {
  "phoneNumberId": "clx0a1b2c3004mk08q9r8s7t6",
  "number": "+14155559876",
  "status": "ready",
  "previousStatus": null,
  "changed": [],
  "capabilities": {
    "sms": { "status": "ready" },
    "call": { "status": "ready" }
  }
}
```

WhatsApp connected on a number you already hold, registered and now warming up — calling is released, the number stays `unsettled`:

```json
"data": {
  "phoneNumberId": "clx8k2j9h0001mk08w3t5r7qz",
  "number": "+14155550123",
  "status": "unsettled",
  "previousStatus": "unsettled",
  "changed": ["whatsapp", "call"],
  "capabilities": {
    "sms": { "status": "ready" },
    "imessage": { "status": "ready" },
    "call": { "status": "ready", "previousStatus": "provisioning", "error": null, "retryAvailableAt": null },
    "whatsapp": { "status": "warming_up", "previousStatus": "provisioning", "error": null, "retryAvailableAt": null }
  }
}
```

About 6 hours later, the warm-up finishes and the number is `ready`:

```json
"data": {
  "phoneNumberId": "clx8k2j9h0001mk08w3t5r7qz",
  "number": "+14155550123",
  "status": "ready",
  "previousStatus": "unsettled",
  "changed": ["whatsapp"],
  "capabilities": {
    "sms": { "status": "ready" },
    "imessage": { "status": "ready" },
    "call": { "status": "ready", "previousStatus": null, "error": null, "retryAvailableAt": null },
    "whatsapp": { "status": "ready", "previousStatus": "warming_up", "error": null, "retryAvailableAt": null }
  }
}
```

WhatsApp failing with a cooldown — the number keeps working:

```json
"data": {
  "phoneNumberId": "clx8k2j9h0001mk08w3t5r7qz",
  "number": "+14155550123",
  "status": "degraded",
  "previousStatus": "unsettled",
  "changed": ["whatsapp"],
  "capabilities": {
    "sms": { "status": "ready" },
    "imessage": { "status": "ready" },
    "call": { "status": "ready", "previousStatus": null, "error": null, "retryAvailableAt": null },
    "whatsapp": {
      "status": "failed",
      "previousStatus": "provisioning",
      "error": "WhatsApp stopped accepting verification requests for this number. Try again in a couple of hours.",
      "retryAvailableAt": "2026-09-03T12:15:22.481Z"
    }
  }
}
```

A live WhatsApp line withdrawn months after it was set up. Note `previousStatus: "ready"`, the number
falling to `degraded`, and `whatsapp` leaving `capabilities` — while SMS and calling carry on:

```json
{
  "id": "evt_3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a09",
  "object": "event",
  "type": "number.status_changed",
  "version": 2,
  "createdAt": "2026-09-07T11:55:14.902Z",
  "relatedObject": { "id": "clx8k2j9h0001mk08w3t5r7qz", "type": "phone_number", "url": "/api/v1/numbers/clx8k2j9h0001mk08w3t5r7qz" },
  "data": {
    "phoneNumberId": "clx8k2j9h0001mk08w3t5r7qz",
    "number": "+14155550123",
    "status": "degraded",
    "previousStatus": "ready",
    "changed": ["whatsapp"],
    "capabilities": {
      "sms": { "status": "ready" },
      "call": { "status": "ready" },
      "whatsapp": {
        "status": "banned",
        "previousStatus": "ready",
        "error": "WhatsApp is no longer available on this phone number.",
        "retryAvailableAt": null
      }
    }
  }
}
```

Waiting for a number to finish setting up:

```bash
dial wait-for number.status_changed -f status=ready -f phoneNumberId=clx8k2j9h0001mk08w3t5r7qz
```

Filters match top-level `data` fields, so `status`, `previousStatus`, `number` and `phoneNumberId` are filterable; `capabilities` is nested, so read it from the payload rather than filtering on it.

## When it fires

* Once per observable change. A number's setup involves several internal steps that map to the same capability status, and those are **not** published — you get an event when a capability's status actually changes, not once per internal write.
* **Every number gets a first event**, `previousStatus: null` and `changed: []`, published as it is created — so a consumer waits on the same event whichever kind of number it provisioned, and never has to know which kind that was. A standard number is `ready` there and emits nothing further. On the presence-based stream that first event can be published before the provisioning HTTP response reaches you, so a listener that subscribes *afterwards* may miss it; the response already told you the status. Webhook delivery is queued and retried, so a webhook consumer always receives it.
* **A ban fires long after setup is over.** Every other trigger here happens while a number is settling; `banned` can arrive months later and moves a `ready` number to `degraded`. If you stop consuming this event once a number reaches `ready`, you will not find out that a channel stopped working.
* **Retrying a failed capability emits a fresh event**, moving the number back to `unsettled`, followed by another when it resolves. Each cycle carries its own event `id`s; nothing is collapsed into the earlier attempt. Deduplicate on the envelope `id`.
* **`changed` can name two capabilities.** A WhatsApp track reaching a terminal state is what releases a caller-ID-verified line from waiting on it, so `whatsapp` and `call` settle together and are reported in one event rather than two half-truths.
* Releasing a number emits nothing — the number stops existing, and there is no status for that.