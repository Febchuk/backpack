> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# Manage phone numbers

> List and purchase the phone numbers on your Dial account.

Every message and call is sent *from* a Dial phone number. Your first number is included with onboarding; you can list your numbers and purchase more at any time.

## List your numbers

Each number has an `id` (used as `fromNumberId`), the `number` itself in E.164, its `country`, its `capabilities`, an optional `nickname` (a human-readable label you choose), and its `inboundInstruction` (the system prompt its AI voice agent uses on inbound calls).

**`CLI`**

```bash title="CLI"
dial number list --json
```

**`Node`**

```typescript title="Node"
import { DialClient } from "@getdial/sdk";

const dial = new DialClient({ apiKey: process.env.DIAL_API_KEY! });
const numbers = await dial.listNumbers();
for (const n of numbers) console.log(n.id, n.number, n.country);
```

**`Python`**

```python title="Python"
from dial_sdk import DialClient, DialConfig

dial = DialClient(DialConfig(api_key="sk_live_..."))
for n in await dial.list_numbers():
    print(n.id, n.number, n.country)
```

**`cURL`**

```bash title="cURL"
curl https://api.getdial.ai/v1/numbers \
  -H "Authorization: Bearer sk_live_..."
```

## Purchase a number

Request a new number, optionally in a specific area code. Only US numbers can be provisioned at this time. An `inboundInstruction` is **optional** — it becomes the new number's inbound voice-agent prompt, and a default greeting is used if you omit it.

Every purchase requires `explicitProgrammaticConsent` (CLI: `--explicit-programmatic-consent`): a short, human-readable attestation that the account holder has explicitly consented to provisioning this number programmatically. It's stored on the number for the provisioning audit trail. Omitting it is rejected with `400`.

**`CLI`**

```bash title="CLI"
dial number purchase \
  --inbound-instruction "You are my receptionist. Greet the caller and find out what they need." \
  --explicit-programmatic-consent "Account holder approved via our signup flow" \
  --area-code 415 --json
```

**`Node`**

```typescript title="Node"
import { DialClient } from "@getdial/sdk";

const dial = new DialClient({ apiKey: process.env.DIAL_API_KEY! });
const number = await dial.purchaseNumber({
  inboundInstruction: "You are my receptionist. Greet the caller and find out what they need.",
  explicitProgrammaticConsent: "Account holder approved via our signup flow",
  areaCode: "415",
});
console.log(number.id);
```

**`Python`**

```python title="Python"
from dial_sdk import DialClient, DialConfig, PurchaseNumberParams

dial = DialClient(DialConfig(api_key="sk_live_..."))
number = await dial.purchase_number(PurchaseNumberParams(
    inbound_instruction="You are my receptionist. Greet the caller and find out what they need.",
    explicit_programmatic_consent="Account holder approved via our signup flow",
    area_code="415",
))
print(number.id)
```

**`cURL`**

```bash title="cURL"
curl -X POST https://api.getdial.ai/v1/numbers \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"inboundInstruction":"You are my receptionist. Greet the caller and find out what they need.","explicitProgrammaticConsent":"Account holder approved via our signup flow","areaCode":"415"}'
```

The purchased number is returned with its `id`. Pass that `id` as `fromNumberId` when you [send a message](/documentation/capabilities/send-an-sms) or [place a call](/documentation/capabilities/place-a-voice-call).

### Purchase an iMessage number

Add `--include-imessage` (CLI), `includeImessage: true` (Node), or `include_imessage=True` (Python) — or include `imessage` in `capabilities` over REST — to provision an [iMessage number](/documentation/capabilities/send-an-imessage). Two things differ from a standard number:

* **Pay-as-you-go only.** iMessage numbers can't be added to a flat-rate subscription; an account on a subscription is rejected with `403`. Switch to pay-as-you-go to add one.
* **Messaging is free.** Every message from an iMessage number — the iMessage itself, and any automatic RCS/SMS fallback — is billed at **\$0** (it appears in your usage as the `imessage.message` fare). You pay only the number's monthly ownership; the per-message SMS tiers don't apply. Calls are billed at the usual per-minute rate.
* **Asynchronous setup.** The number is returned immediately with `setupStatus: provisioning`. Poll [List your numbers](#list-your-numbers) until its `setupStatus` is `ready` before you send or call from it. (`areaCode` is ignored for iMessage numbers.)

**`CLI`**

```bash title="CLI"
dial number purchase \
  --include-imessage \
  --inbound-instruction "You are my receptionist. Greet the caller and find out what they need." \
  --explicit-programmatic-consent "Account holder approved via our signup flow" \
  --json
```

**`Node`**

```typescript title="Node"
import { DialClient } from "@getdial/sdk";

const dial = new DialClient({ apiKey: process.env.DIAL_API_KEY! });
const number = await dial.purchaseNumber({
  includeImessage: true,
  inboundInstruction: "You are my receptionist. Greet the caller and find out what they need.",
  explicitProgrammaticConsent: "Account holder approved via our signup flow",
});
console.log(number.id, number.setupStatus); // "provisioning" — poll until "ready"
```

**`Python`**

```python title="Python"
from dial_sdk import DialClient, DialConfig, PurchaseNumberParams

dial = DialClient(DialConfig(api_key="sk_live_..."))
number = await dial.purchase_number(PurchaseNumberParams(
    include_imessage=True,
    inbound_instruction="You are my receptionist. Greet the caller and find out what they need.",
    explicit_programmatic_consent="Account holder approved via our signup flow",
))
print(number.id, number.setup_status)  # "provisioning" — poll until "ready"
```

**`cURL`**

```bash title="cURL"
curl -X POST https://api.getdial.ai/v1/numbers \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"capabilities":["sms","call","imessage"],"inboundInstruction":"You are my receptionist. Greet the caller and find out what they need.","explicitProgrammaticConsent":"Account holder approved via our signup flow"}'
```

## Set the inbound instruction

Change how a number's AI voice agent behaves on inbound calls at any time. The change takes effect on the next inbound call; calls in progress are unaffected.

**`CLI`**

```bash title="CLI"
dial number set +14155550123 \
  --inbound-instruction "You are ACME's receptionist. Greet the caller and route them."
```

**`cURL`**

```bash title="cURL"
curl -X PATCH https://api.getdial.ai/v1/numbers/pn_123 \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"inboundInstruction":"You are ACME'\''s receptionist. Greet the caller and route them."}'
```

The CLI takes the number in E.164 and resolves it to its `id` for you; the REST API takes the number `id` in the path.

## Set the inbound language

By default the agent detects the language from the caller's country prefix on each inbound call, and handles both that language and `en-US`. Set the number's `inboundLanguage` — a BCP-47 tag such as `es-ES` — to pin every inbound call to a single language instead. Clear it (empty string in the CLI, `null` over REST) to go back to per-call detection. Takes effect on the next inbound call.

**`CLI`**

```bash title="CLI"
dial number set +14155550123 --inbound-language es-ES
```

**`cURL`**

```bash title="cURL"
curl -X PATCH https://api.getdial.ai/v1/numbers/pn_123 \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"inboundLanguage":"es-ES"}'
```

You can also set it at purchase time with `--inbound-language` (REST: `inboundLanguage`).

## Give a number a nickname

Attach a human-readable label to a number — useful once an account holds several (e.g. "Support line", "Sales — EU"). Nicknames are free text up to 100 characters and don't have to be unique. Clear one by setting it to an empty string (CLI) or `null` (REST).

**`CLI`**

```bash title="CLI"
dial number set +14155550123 --nickname "Support line"
```

**`Node`**

```typescript title="Node"
import { DialClient } from "@getdial/sdk";

const dial = new DialClient({ apiKey: process.env.DIAL_API_KEY! });
const number = await dial.setNumberProperties("pn_123", { nickname: "Support line" });
console.log(number.nickname);
```

**`Python`**

```python title="Python"
from dial_sdk import DialClient, DialConfig

dial = DialClient(DialConfig(api_key="sk_live_..."))
number = await dial.set_number_properties("pn_123", nickname="Support line")
print(number.nickname)
```

**`cURL`**

```bash title="cURL"
curl -X PATCH https://api.getdial.ai/v1/numbers/pn_123 \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"nickname":"Support line"}'
```

`nickname`, `inboundInstruction`, and `inboundLanguage` all go through the same update call — send any subset of them in one request.

## Turn calling off for a number

A number can run messaging-only. Set `callingEnabled` to `false` and the number stops doing voice in **both** directions:

* Inbound calls are **not connected**. The caller is never answered, so no AI agent runs and no minute is billed.
* [Place a call](/api-reference/rest-api/calls/make-call) from the number is refused with `409 calling_disabled`.

Messaging is untouched — SMS, iMessage, RCS, and WhatsApp keep working exactly as before. This is the setting to use for a line that only ever texts, or for a number you intend to route to your own voice stack.

**`CLI`**

```bash title="CLI"
dial number set +14155550123 --calling off
```

**`Node`**

```typescript title="Node"
import { DialClient } from "@getdial/sdk";

const dial = new DialClient({ apiKey: process.env.DIAL_API_KEY! });
const number = await dial.setNumberProperties("pn_123", { callingEnabled: false });
console.log(number.callingEnabled);
```

**`Python`**

```python title="Python"
from dial_sdk import DialClient

dial = DialClient(api_key="sk_live_...")
number = await dial.set_number_properties("pn_123", calling_enabled=False)
print(number.calling_enabled)
```

**`cURL`**

```bash title="cURL"
curl -X PATCH https://api.getdial.ai/v1/numbers/pn_123 \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"callingEnabled":false}'
```

Switch it back on with `--calling on` (CLI) or `"callingEnabled": true` (REST). You can also provision a number this way from the start — pass `callingEnabled: false` to [Provision a number](/api-reference/rest-api/phone-numbers/provision-number), and the line never answers a call at all.

The switch takes effect on the **next** call. A call already in progress is not terminated.

> **Note**
>
> `callingEnabled` is separate from `capabilities`. `capabilities` reports what the line was provisioned to do and does not change when you flip the switch, so a messaging-only number still lists `call` there. To decide whether a call can be placed from a number right now, read all three: `capabilities` contains `call`, `setupStatus` is `ready`, and `callingEnabled` is `true`.

## Forward inbound calls to another phone

By default the AI voice agent answers every inbound call. Set `forwardTo` to a phone number in E.164 and inbound calls ring straight through to that phone instead — for example, so calls to an iMessage number reach your own business line while its messages keep flowing through Dial.

* The caller hears ringing until the forwarded phone answers, then the two are connected. The AI voice agent does not run.
* The forwarded phone sees the **original caller's number** as caller ID where the network allows it, and this Dial number otherwise.
* If the forwarded phone is busy or doesn't answer, the call ends. Its own voicemail, if it has one, picks up as usual.
* A forwarded call is a normal inbound call: it appears in your call history, emits the same [events](/documentation/platform/stream-account-events), and is billed at the same per-minute rate. The call carries the forwarded number as `transferTo`, and `transferredAt` is stamped when that phone answers.

**`CLI`**

```bash title="CLI"
dial number set +14155550123 --forward-to +18005550100
```

**`Node`**

```typescript title="Node"
import { DialClient } from "@getdial/sdk";

const dial = new DialClient({ apiKey: process.env.DIAL_API_KEY! });
const number = await dial.setNumberProperties("pn_123", { forwardTo: "+18005550100" });
console.log(number.forwardTo);
```

**`Python`**

```python title="Python"
from dial_sdk import DialClient

dial = DialClient(api_key="sk_live_...")
number = await dial.set_number_properties("pn_123", forward_to="+18005550100")
print(number.forward_to)
```

**`cURL`**

```bash title="cURL"
curl -X PATCH https://api.getdial.ai/v1/numbers/pn_123 \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"forwardTo":"+18005550100"}'
```

Stop forwarding with `--forward-to off` (CLI) or `"forwardTo": null` (REST), and the AI voice agent answers again. `forwardTo` must be a valid E.164 number other than the number itself. Like the other settings, it takes effect on the **next** call.

> **Note**
>
> Forwarding applies only while calling is on. With `callingEnabled` set to `false`, inbound calls are still not connected, whether or not `forwardTo` is set.

## Set one display identity across channels

A number can carry a different profile per channel, but most numbers shouldn't — the same business name and the same photo belong on iMessage and WhatsApp alike. Pass `channel` with `name` and/or an avatar and Dial writes both in one call:

* `channel: "both"` — every channel the number has.
* `channel: "imessage"` or `channel: "whatsapp"` — just that one.

`name` is a single string. WhatsApp stores it verbatim; iMessage has no single-name field, so Dial **splits it on the first space** — `"Maya Chen"` becomes first name `"Maya"`, last name `"Chen"`; `"Ana Maria de Souza"` becomes `"Ana"` and `"Maria de Souza"`; a one-word name leaves the last name cleared.

**`CLI`**

```bash title="CLI"
dial number set +14155550123 --channel both --name "Maya Chen" --avatar ./avatar.png
```

**`Node`**

```typescript title="Node"
import { DialClient } from "@getdial/sdk";

const dial = new DialClient({ apiKey: process.env.DIAL_API_KEY! });
const number = await dial.setNumberProperties("pn_123", {
  channel: "both",
  name: "Maya Chen",
  avatar: "./avatar.png",
});
console.log(number.firstName, number.whatsappName);
```

**`Python`**

```python title="Python"
from dial_sdk import DialClient

dial = DialClient(api_key="sk_live_...")
number = await dial.set_number_properties(
    "pn_123", channel="both", name="Maya Chen", avatar="./avatar.png"
)
print(number.first_name, number.whatsapp_name)
```

**`cURL`**

```bash title="cURL"
curl -X PATCH https://api.getdial.ai/v1/numbers/pn_123 \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"channel":"both","name":"Maya Chen","avatarUrl":"https://your-cdn.example.com/avatar.png"}'
```

**`both` is all-or-nothing.** The name and photo are checked against every channel you targeted *before* any of them is written, so the request either updates both profiles or neither. That matters because the channels don't accept the same values: WhatsApp caps the name at 25 characters where iMessage allows 30 per part, and WhatsApp requires a square jpeg or png between 192×192 and 640×640, with no transparent pixels, where iMessage takes jpeg/png/gif/webp up to 5 MB. A name or photo only one channel accepts — or a number whose WhatsApp line isn't connected yet — is rejected with `400` and nothing changes, rather than landing on one profile and leaving the other behind.

> **Note**
>
> `channel` can't be combined with the per-channel fields (`firstName`, `lastName`, `whatsappName`, `whatsappAvatar`/`whatsappAvatarUrl`) — the two forms write the same values, so sending both is rejected with `400`. Use the per-channel fields when the profiles genuinely differ; see below.

## Set the iMessage display identity

Numbers with the `imessage` capability can carry a **display identity** — a first name, last name, and avatar photo shown beside the number's messages in recipients' Messages apps. Names are up to 30 characters each; clear one by setting it to an empty string (CLI) or `null` (REST). The photo accepts jpeg, png, gif, or webp up to 5 MB — a square image of 512×512 or larger is recommended (it's shown as a circle). Photos can be **replaced but not removed**. Setting any identity field on a number without the `imessage` capability is rejected with `400`.

Upload the photo as a `multipart/form-data` file part, or pass a public image URL as `avatarUrl` (JSON or multipart) for Dial to download server-side. Either way, Dial mirrors the photo into its own storage and returns its stable public URL as the number's `avatarUrl`. Identity changes can take a few minutes to propagate to recipients' devices.

**`CLI`**

```bash title="CLI"
dial number set +14155550123 --first-name Maya --last-name Chen --avatar ./avatar.png
```

**`Node`**

```typescript title="Node"
import { DialClient } from "@getdial/sdk";

const dial = new DialClient({ apiKey: process.env.DIAL_API_KEY! });
const number = await dial.setNumberProperties("pn_123", {
  firstName: "Maya",
  lastName: "Chen",
  avatar: { path: "./avatar.png" },
});
console.log(number.avatarUrl);
```

**`Python`**

```python title="Python"
from dial_sdk import DialClient, DialConfig

dial = DialClient(DialConfig(api_key="sk_live_..."))
number = await dial.set_number_properties(
    "pn_123", first_name="Maya", last_name="Chen", avatar="./avatar.png"
)
print(number.avatar_url)
```

**`cURL (multipart upload)`**

```bash title="cURL (multipart upload)"
curl -X PATCH https://api.getdial.ai/v1/numbers/pn_123 \
  -H "Authorization: Bearer sk_live_..." \
  -F firstName=Maya \
  -F lastName=Chen \
  -F avatar=@avatar.png
```

**`cURL (JSON, avatar by URL)`**

```bash title="cURL (JSON, avatar by URL)"
curl -X PATCH https://api.getdial.ai/v1/numbers/pn_123 \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Maya","avatarUrl":"https://your-cdn.example.com/avatar.png"}'
```

## Register a US number for 10DLC

US carriers **block** outbound SMS and MMS sent from an unregistered 10-digit number to a US phone number. It isn't filtering or a delay — the message doesn't arrive. Registering the number for 10DLC lifts the block.

What the block does **not** affect: inbound texts to your number, voice calls in either direction, and messaging to numbers outside the US. Those work whether or not the number is registered.

### Which numbers this applies to

A number is eligible when it's US, has the `sms` capability, and does **not** have the `imessage` capability — iMessage numbers send over Apple Messages for Business rather than carrier SMS, so 10DLC never applies to them. Registration is currently offered on **pay-as-you-go** accounts.

Read `tenDlc` on the number to know where you stand. It's `null` when 10DLC doesn't apply, and otherwise carries a `status`:

| `status`         | Meaning                                                                       |
| ---------------- | ----------------------------------------------------------------------------- |
| `not_registered` | Nothing submitted yet — outbound US SMS/MMS from this number is blocked.      |
| `in_review`      | Submitted; Dial is checking the details.                                      |
| `with_carrier`   | Filed with the carrier registry. Decisions usually land in 3–5 business days. |
| `approved`       | Registered — the number can send to US numbers.                               |
| `rejected`       | Changes needed. `reason` says exactly what; fix it and resubmit for free.     |

### What it costs

**\$25.00 one-time per number**, taken from your credit balance when the submission is accepted. A balance below the fee is rejected with `402`. **Resubmitting after a rejection is free** — a number is charged at most once, ever.

### Submitting

A registration has two halves, mirroring what the carrier registry registers: a **brand** — who is registering, the identity carriers vet — and a **campaign** — what you send and how people agreed to receive it. Your number is registered by joining the campaign.

Register as a **sole proprietor** if you operate under your own name and have no EIN: fewer fields, lower throughput, quicker approval. Register as a **business** if you're a registered company with an EIN. The full field list for each is in the API reference, under `POST /api/v1/numbers/{id}/10dlc`.

Carriers require a privacy policy and a terms page on every campaign, and they read them. A business gives its own `privacyPolicyUrl` and `termsUrl`, and reviewers expect to find them on the `websiteUrl` you registered — a policy somewhere unrelated to the brand is a rejection. A sole proprietor usually has no website, so both are optional: leave them out, send `"acceptPublishedNotice": true`, and Dial publishes a privacy notice and a terms page for the brand — written from what you submitted, naming you as the operator of the messaging program — and registers those URLs. Read them back from the registration and link them wherever people opt in. Your own URLs, if you send them, always win.

One field is easy to get wrong: a sole proprietor gives a `vertical` — the trade they operate in — while a business gives a `businessIndustry`. They look interchangeable and aren't. The registry validates them against different vocabularies, so `PROFESSIONAL` is a vertical while `PROFESSIONAL_SERVICES` is an industry, and several industries have no vertical at all. Take the value from the list for the field you're actually sending.

**`cURL`**

```bash title="cURL"
curl -X POST https://api.getdial.ai/v1/numbers/pn_123/10dlc \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "business",
    "brand": {
      "brandName": "Northwind Supply Co.",
      "firstName": "Maya", "lastName": "Chen",
      "email": "maya@northwind.io", "phone": "+14155550110",
      "street": "480 Bryant St", "city": "San Francisco", "country": "US", "state": "CA", "zip": "94107",
      "businessType": "Limited Liability Corporation",
      "businessIndustry": "RETAIL",
      "registrationIdType": "EIN", "registrationNumber": "84-3921776",
      "websiteUrl": "https://northwind.io",
      "jobPosition": "Other", "businessTitle": "Head of Operations",
      "businessRegionsOfOperation": "USA_AND_CANADA", "companyType": "private"
    },
    "campaign": {
      "useCase": "CUSTOMER_CARE",
      "description": "We text customers who placed an order to confirm delivery windows and let them reschedule. Every recipient checked the SMS box at checkout.",
      "messageFlow": "Customers tick an unchecked SMS consent box at checkout under the heading Text me delivery updates, beside message frequency and STOP instructions.",
      "samples": [
        "Northwind Supply: your order #40218 is out for delivery today between 2-4pm. Reply STOP to opt out.",
        "Northwind Supply: thanks for your order! Track it at northwind.io/track. Reply STOP to unsubscribe."
      ],
      "privacyPolicyUrl": "https://northwind.io/privacy",
      "termsUrl": "https://northwind.io/terms",
      "containsUrls": true, "containsPhones": false
    }
  }'
```

Then read the registration back — brand, campaign, and where it stands — with `GET /api/v1/numbers/pn_123/10dlc`.

### A second use case on a brand you already registered

A brand is the business identity carriers vet; a campaign is one messaging use case beneath it. **One brand can carry several campaigns** — so a second use case isn't a second registration of the same business, it's a new campaign on the brand you already have.

That distinction is worth money and time. The brand is the expensive half: it carries the vetting, the score, and the compliance profile behind it. Registering the same business twice re-pays for all of it and waits for approval again.

List the brands a new campaign can join, then name one as `brandId`:

**`cURL`**

```bash title="cURL"
curl https://api.getdial.ai/v1/10dlc/brands -H "Authorization: Bearer sk_live_..."
```

**`cURL`**

```bash title="cURL"
curl -X POST https://api.getdial.ai/v1/numbers/pn_456/10dlc \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "brandId": "tdb_abc123",
    "campaign": {
      "useCase": "CUSTOMER_CARE",
      "description": "We text guests who RSVP'\''d to an event to confirm their spot and remind them the day before.",
      "messageFlow": "Guests tick an unchecked SMS box on the RSVP form, under the heading Text me about this event, beside STOP instructions.",
      "samples": [
        "Larkfield: you'\''re confirmed for Saturday 7pm. Reply STOP to opt out.",
        "Larkfield: reminder — your event is tomorrow at 7pm. Reply STOP to opt out."
      ],
      "privacyPolicyUrl": "https://example.com/privacy",
      "termsUrl": "https://example.com/terms"
    }
  }'
```

With `brandId` you send no `kind` and no `brand`: both come from the brand that's already registered, and this submission can't change them. Only the campaign is new.

Three things to know before you plan around it:

* **Each campaign needs its own number.** A number joins exactly one campaign, so two use cases means two numbers — and the **\$25 fee is per number**, as always. What reuse saves is the brand registration and its approval wait, not the fee.
* **The brand must already be approved.** A brand still in review isn't offered, because the registry refuses a campaign filed against one.
* **Business brands only.** A sole proprietor brand covers exactly one use case; reusing one returns `403`.

> **Note**
>
> The number you register is always a US number — that's what 10DLC is — but **your business doesn't have to be US-based**. A business may be registered from any country the registry accepts, using its own country's tax ID; give the `country` of your registered address and its `state` — the two-letter code in the US and Canada, the region name elsewhere. Sole proprietor registration is the exception: it's available in the **US and Canada only**.

> **Warning**
>
> The brand's `phone` may not be one of your Dial numbers. Carriers won't verify a number issued by a messaging provider, so use a mobile the person named on the registration answers directly. For a sole proprietor that number receives a verification text — reply `YES` within 24 hours or the registration is turned down.

> **Tip**
>
> Carriers reject vague answers. Say concretely who is messaged, why, and how they agreed to it; keep marketing language out of it. Sample messages must name your brand and end with an opt-out instruction — at least two are required, and repeating one is fine if that's the only message you'll ever send. If you write your own privacy policy, it has to state that mobile information and messaging consent are never shared or sold to third parties or affiliates for marketing — the single most common reason a campaign is turned down. If your registration is rejected, the `reason` tells you precisely what to change — a resubmission costs nothing.

Dial emails you when the registration is approved or rejected. Once approved, keep your message content matching what you described — carriers audit it, and violations can suspend the number.

## Release a number, and what it costs

Releasing a number returns it to the carrier and removes it from your account, immediately and irreversibly. A released number can't be reclaimed.

On **pay-as-you-go** there's nothing more to it — you simply stop being charged the monthly ownership fee for it.

On a **flat-rate subscription**, a release lowers the subscription by one number and Stripe prorates the change. The quantity never drops below **one number**, though, which means:

* Releasing your **last** number leaves the subscription active at the single-number rate — it isn't cancelled. Cancel the subscription itself (`POST /api/v1/billing/subscription/cancel`) to stop paying.
* While you hold no numbers, the **next number you provision is free** — the subscription is already paying for one, so there's no prorated charge. Holding zero numbers and holding one cost exactly the same.
* The new number is covered by the subscription as soon as the purchase returns, so you can send and call from it right away.

Swapping a number — release, then provision a replacement — is therefore free on a subscription, however many times you do it.

> **Note**
>
> iMessage numbers are pay-as-you-go only and are never part of a flat-rate subscription, so none of the quantity rules above apply to them.

## Non-payment and number release

Each number carries a small monthly ownership fee. On pay-as-you-go, that fee is drawn from your account balance, which is allowed to go negative — so a lapsed top-up doesn't interrupt service immediately.

You have a **30-day grace period**, measured from the moment your balance first goes negative. During grace, ownership fees keep being charged and your numbers keep working. Topping your balance back to zero or above resets the grace period.

If your balance is still negative when the grace period ends, Dial stops charging for ownership and instead **releases your numbers** — returning them to the carrier and removing them from your account. Once the grace period ends, all of your numbers are released together (Dial checks daily), so add credit before the grace period ends to keep them. A released number is gone and cannot be reclaimed; purchase a new one to continue.

Numbers covered by an active subscription are unaffected by your balance — they are never released for non-payment.