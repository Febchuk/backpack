> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# Webhooks

> Receive account events as signed HTTP POSTs to your own HTTPS endpoint, with retries and HMAC verification.

A **webhook subscription** delivers your account's events to an HTTPS endpoint you
control. Register a URL and the event types you care about, and Dial POSTs each
matching event to that URL — signed, retried, and idempotency-keyed.

Webhooks are the **at-least-once, off-machine** counterpart to the presence-based
[event stream](/api-reference/events/overview): instead of holding a connection open with
`dial wait-for`, your server receives events as they happen.

## Create a subscription

Create one from the [dashboard Webhooks page](https://getdial.ai/dashboard/webhooks), or via the API:

```bash
curl -X POST https://api.getdial.ai/v1/webhooks \
  -H "Authorization: Bearer $DIAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "targetUrl": "https://example.com/dial/webhook", "eventTypes": ["*"] }'
```

* `targetUrl` must be **HTTPS** and must not point at a private, loopback, or link-local address.
* `eventTypes` is either `["*"]` (all events) or an explicit list of
  [event types](/api-reference/events/overview#event-types), e.g. `["message.received", "call.ended"]`.

The response includes a **signing secret** (`whsec_…`). The dashboard masks it and lets you
copy it on demand; over the API the full secret is returned at creation and via
`GET /api/v1/webhooks/{id}/secret`.

## Delivery format

Each delivery is an HTTP `POST` to your `targetUrl` with the event JSON as the body and these headers:

| Header              | Value                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `Content-Type`      | `application/json`                                                                               |
| `X-Dial-Event-Type` | The event type, e.g. `message.received` — use it to route/filter quickly.                        |
| `X-Dial-Event-ID`   | A stable per-event ID. **Deduplicate on this** — the same event may be delivered more than once. |
| `X-Dial-Signature`  | `t=<unix-seconds>,v1=<hex-hmac>` — verify before trusting the body.                              |

The body is the same event envelope you'd get from the
[event stream](/api-reference/events/overview), plus a top-level `id` field equal to `X-Dial-Event-ID`.

## Verify the signature

The signature protects against forged and replayed deliveries. Recompute the HMAC over
`{timestamp}.{raw_request_body}` with your subscription secret and compare:

```ts
import crypto from "node:crypto";

// rawBody MUST be the exact bytes received, not a re-serialized object.
function verifyDialWebhook(secret: string, header: string, rawBody: string): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const t = parts.t;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  // constant-time compare
  const ok = crypto.timingSafeEqual(Buffer.from(parts.v1, "hex"), Buffer.from(expected, "hex"));
  // reject deliveries older than 5 minutes to limit replay
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;
  return ok && fresh;
}
```

## Retries

Dial considers a delivery successful on any **HTTP 2xx**. Anything else — a non-2xx
status, a connection error, or a timeout (10s per attempt) — is retried with exponential
backoff, up to **6 attempts** total (1 initial + 5 retries). Because deliveries retry,
your endpoint must be **idempotent**: dedupe on `X-Dial-Event-ID`.

## Test with a ping

The dashboard's **Fire ping** button (and `POST /api/v1/webhooks/{id}/ping`) sends a
[`webhook.ping`](/api-reference/events/webhook-ping) event to that subscription, bypassing
its `eventTypes` filter. When the ping is delivered and your endpoint returns 2xx, the
dashboard records the time as **Last ping**. Use it to confirm a new endpoint is reachable
and verifying signatures correctly.