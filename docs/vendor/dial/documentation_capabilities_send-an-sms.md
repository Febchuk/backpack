> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# Send an SMS

> Send an SMS from a Dial phone number using the CLI, an SDK, or the REST API.

Send a text message from one of your Dial numbers to any phone number. You need two things: the recipient in E.164 format (e.g. `+14155550123`) and the `id` of the Dial number you're sending from (run [`dial number list`](/documentation/platform/manage-phone-numbers) to find it).

**`CLI`**

```bash title="CLI"
dial message \
  --to +14155550123 \
  --body "Hello from Dial" \
  --from-number-id pn_123
```

**`Node`**

```typescript title="Node"
import { DialClient } from "@getdial/sdk";

const dial = new DialClient({ apiKey: process.env.DIAL_API_KEY! });
const message = await dial.sendMessage({
  to: "+14155550123",
  fromNumberId: "pn_123",
  body: "Hello from Dial",
});
console.log(message.id, message.status);
```

**`Python`**

```python title="Python"
from dial_sdk import DialClient, DialConfig

dial = DialClient(DialConfig(api_key="sk_live_..."))
message = await dial.send_message(
    to="+14155550123",
    from_number_id="pn_123",
    body="Hello from Dial",
)
print(message.id, message.status)
```

**`LangChain`**

```python title="LangChain"
from dial_langchain import SendMessageTool

send = SendMessageTool(api_key="sk_live_...")
await send.ainvoke({
    "to": "+14155550123",
    "from_number_id": "pn_123",
    "body": "Hello from Dial",
})
```

**`cURL`**

```bash title="cURL"
curl -X POST https://api.getdial.ai/v1/messages \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"to":"+14155550123","fromNumberId":"pn_123","body":"Hello from Dial"}'
```

The message comes back with an `id` and a `deliveryState` of `pending`, which advances to `delivered` (or `undelivered`/`failed`, with a `deliveryError` reason) as the carrier reports back. You don't have to poll for it: each advance is published as a [`message.status_changed`](/api-reference/events/message-status-changed) event, so [streaming events](/documentation/platform/stream-account-events) tells you the moment a message lands or is rejected.

### Delivery and read state

Every message carries two **independent** fields, because delivery and reads are separate facts and not every rail reports both:

| Field           | Values                                                         | Notes                                                                                                    |
| --------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `deliveryState` | `pending`, `delivered`, `undelivered`, `failed`, `unconfirmed` | `unconfirmed` means the rail sends no delivery receipts (iMessage numbers) — only a read can upgrade it. |
| `readState`     | `unread`, `read`, `unsupported`                                | `unsupported` means the rail never reports reads (SMS). Nothing is coming — don't wait for it.           |
| `readAt`        | timestamp \| `null`                                            | When the recipient read the message; `null` if unread or unsupported.                                    |
| `deliveryError` | string \| `null`                                               | Plain-language failure reason. Non-null only when `deliveryState` is `undelivered` or `failed`.          |

A read receipt proves delivery, so a message that is read is also reported as `delivered`.

Inbound messages report `deliveryState: "delivered"` (they arrived) and `readState: "unsupported"` — Dial doesn't track whether you read an inbound message.

> **Note**
>
> **Migrating from `status`.** The older `status` and `statusError` fields are still returned and still describe **delivery only** — no change in behavior. `statusError` and `deliveryError` are identical. `status` and `deliveryState` are the same axis in two vocabularies, and differ on two values:
>
> | `status`                               | `deliveryState` |
> | -------------------------------------- | --------------- |
> | `sent`                                 | `pending`       |
> | `unknown`                              | `unconfirmed`   |
> | `delivered` / `undelivered` / `failed` | same            |
>
> Prefer `deliveryState`: it names those two states for what they mean, and it pairs with `readState`. Note that `status` **no longer returns `read`** — reads now live on `readState` and `readAt`, so a read message reports `status: "delivered"`.

> **Note**
>
> Accounts on a **subscription** can send SMS only to **US** numbers — any other destination is rejected with a `400`. Pay-as-you-go accounts can send to any supported destination.

## Attach media (MMS)

Attach up to 10 media items (5 MB each) to a message. Supply each one either as a **local file** — the CLI and SDKs upload it for you — or as a **public URL** that Dial downloads server-side. Either way Dial mirrors the bytes into its own storage and serves them from a stable public URL, returned in the message's `media` array.

**Supported types:** images (`jpeg`, `png`, `gif`, `webp`, `bmp`), audio (`mp3`, `m4a`, `ogg`, `wav`, `amr`), video (`mp4`, `3gpp`), `pdf`, vCard (`.vcf`), and iCalendar (`.ics`). Any other type is rejected with a `400`. Note that **HEIC** (the default iPhone photo format) and **SVG** are not supported — convert HEIC to JPEG/PNG before sending.

**`CLI`**

```bash title="CLI"
dial message \
  --to +14155550123 \
  --body "Here's your call summary" \
  --from-number-id pn_123 \
  --media ./summary.png \
  --media https://your-cdn.example.com/chart.jpg
```

**`Node`**

```typescript title="Node"
const message = await dial.sendMessage({
  to: "+14155550123",
  fromNumberId: "pn_123",
  body: "Here's your call summary",
  media: [
    { path: "./summary.png" },                    // local file
    "https://your-cdn.example.com/chart.jpg",     // public URL
  ],
});
console.log(message.media[0].url);
```

**`Python`**

```python title="Python"
from pathlib import Path

message = await dial.send_message(
    to="+14155550123",
    from_number_id="pn_123",
    body="Here's your call summary",
    media=[
        Path("./summary.png"),                    # local file
        "https://your-cdn.example.com/chart.jpg", # public URL
    ],
)
print(message.media[0].url)
```

**`cURL (URLs)`**

```bash title="cURL (URLs)"
curl -X POST https://api.getdial.ai/v1/messages \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"to":"+14155550123","fromNumberId":"pn_123","body":"Here is your call summary","mediaUrls":["https://your-cdn.example.com/chart.jpg"]}'
```

**`cURL (file upload)`**

```bash title="cURL (file upload)"
curl -X POST https://api.getdial.ai/v1/messages \
  -H "Authorization: Bearer sk_live_..." \
  -F to=+14155550123 \
  -F fromNumberId=pn_123 \
  -F body="Here's your call summary" \
  -F media=@summary.png
```

> **Note**
>
> Dial sends over SMS. The `to` and `from` numbers must both be in E.164 format.

> **Warning**
>
> True MMS delivery is supported only for **US and Canada** numbers. To other destinations, the carrier delivers the message as an **SMS containing a link** to the media rather than an inline attachment (and returns an error if that conversion is disabled). The media itself is still hosted by Dial at the `media[].url` either way.

> **Note**
>
> **iMessage numbers.** A message with media sent from an iMessage number is delivered as **native attachments** when the recipient supports rich messaging (iMessage or RCS) — text and media arrive together as one message. When the recipient supports neither (e.g. an Android device without RCS), Dial delivers the same message as a **text with the media links appended**, from the same number. The message's `media` array is identical either way.

> **Warning**
>
> Sending isn't idempotent — there's no idempotency key, so a retry sends a **second** SMS. If a request fails ambiguously, [confirm before re-sending](/documentation/reference/errors#retries-and-idempotency) rather than blind-retrying.

## Next

#### [Receive an SMS](/documentation/capabilities/receive-an-sms)

Wait for a reply or one-time code.

#### [Place a voice call](/documentation/capabilities/place-a-voice-call)

Make an AI voice call instead.