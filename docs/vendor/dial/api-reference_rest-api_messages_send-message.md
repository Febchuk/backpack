> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# Send a message

POST https://api.getdial.ai/api/v1/messages
Content-Type: application/json

Sends a message from one of your Dial numbers.

**The number determines the channel, except on a line that carries two.**
A standard number sends SMS/MMS. An iMessage number sends iMessage,
automatically falling back to RCS/SMS when the recipient can't receive
iMessage. A line with WhatsApp connected carries both rails on one
number, and that is the one case where you say which you mean — see
`channel` below. For standard numbers, `status` tracks delivery
(`sent` → `delivered`/`undelivered`/`failed`, with a `statusError`
reason on failure); iMessage sends report `status: "unknown"`.

**Destination.** Provide exactly one of `to` (a phone number) or
`groupId` (a group conversation). Sending both — or neither — is
rejected with `400` ("Provide exactly one of `to` or `groupId`."). A
`groupId` that isn't on your account is `400` ("No such group on this
account."), and a group paired with a `channel` it isn't on is `400`
("This group is on a different channel than the one you named.") —
leave `channel` out and the group supplies it. See Group conversations
for what a group send does differently.

**Media.** Attach media as public URLs (`mediaUrls`, JSON or multipart) or
as uploaded `media` file parts (multipart only):
- Standard numbers: up to **10** items combined, **5 MB** each.
- iMessage numbers: **at most one** attachment (URL or file).
- WhatsApp numbers: **at most one** attachment (URL or file); a `body`
  may accompany it only when the attachment is an image or video.

`body` is optional when media is attached — a media-only message sends
just the attachment (its `body` is recorded as an empty string). A request
with neither a non-empty `body` nor media is rejected with `400`.

**Content size (standard numbers).** A standard-number message is validated
against the carrier's content-size limits before it is sent, and one that
exceeds them is rejected with `400` ("Content size exceeds carrier limit.")
rather than sent.

The `body` limit depends on the characters used. Plain text allows **1530
characters**, but a single character outside the basic SMS alphabet — an
em dash, a curly quote, an emoji, any non-Latin script — switches the whole
message to a wider encoding and lowers the limit to **670 characters**.
Attached media may total at most **5 MB**.

Even within these limits an individual carrier may still refuse an
oversized message at delivery — that surfaces as a failed `status` with
the same `statusError` reason.

**Voice messages (iMessage numbers).** When the attachment is a single
audio file, it is delivered as a native voice message. If a `body` is
also present, the recipient receives two messages — the text, then the
voice message — but the API still returns (and records) a single Message.
If the recipient can't receive voice messages (no iMessage/RCS), the
audio is delivered as a link over SMS instead. Set `forceAudioFile: true`
to always send audio as a regular file attachment in one message.
`forceAudioFile` has no effect on standard numbers, non-audio media, or
multi-attachment sends — audio attached to a standard number's message is
always MMS media.

Supported types: images (jpeg, png, gif, webp, bmp), audio (mp3, m4a, ogg,
wav, amr), video (mp4, 3gpp), pdf, vCard, and iCalendar; any other type is
rejected with `400` (HEIC and SVG are not supported). Dial mirrors every
attachment into its own storage and serves it from a stable public URL
(see Get public media); the message's `media` array carries those URLs.
For standard numbers, true MMS delivery is supported only for US and Canada
— to other destinations the carrier delivers an SMS with a link to the
media.

**Destination limits** (standard numbers): accounts on a **subscription**
can send only to **US** numbers — any other destination is rejected with
`400`. Pay-as-you-go accounts can send to any supported destination (a
destination with no SMS price tier is rejected with `400`).

**Choosing the from-number.** Provide exactly one of `fromNumber` (a
flexible reference: phone-number ID, one of your numbers in E.164
format, or a nickname) or the legacy `fromNumberId` (ID only). Sending
both — or neither — is rejected with `400`.

**On a `groupId` send the from-number is optional**, because the group
already belongs to one of your lines and Dial sends from that one.
Supplying one anyway is allowed and must agree: a from-number naming a
different line is rejected with `400` rather than silently overridden.

**WhatsApp (`channel: "whatsapp"`).** Sends text and a **single** media
attachment. More than one attachment (across `media` and `mediaUrls`) is
rejected with `400`. A `body` may accompany media **only** when the
attachment is an image or video — a body alongside audio or a document is
rejected with `400`. A lone audio attachment is delivered as a **voice
note** by default; set `forceAudioFile: true` to deliver it as a regular
audio file instead. Supported attachment types match the rest of this
endpoint (images, audio, video, PDF, vCard, iCalendar); a vCard is
delivered as a document, not a native contact card. Inbound WhatsApp
attachments are unaffected and arrive as normal media. A WhatsApp send
returns `status: "unknown"` (`deliveryState: "unconfirmed"`) and firms up
as receipts arrive; unlike SMS, WhatsApp reports reads, so
`readState`/`readAt` are meaningful. A WhatsApp line sends one message at
a time: a second send while the first is in flight is refused rather than
queued.

**WhatsApp text sends type first.** Before a WhatsApp text message goes
out, the recipient (or the group) sees "typing…" for about 200-250 ms per
character, up to about 30 seconds however long the message is, and
then the message arrives, as it would from a person. The request returns
once the message is sent, so it takes that much longer: about 7 seconds
for a 30-character message. A send with an attachment doesn't type.

Not idempotent — there is no idempotency key, so retrying a failed request
can send a duplicate message. On an ambiguous failure, confirm via List
messages before re-sending.


Reference: https://docs.getdial.ai/api-reference/rest-api/messages/send-message

## Authentication

- `Authorization` header (bearer token, required) — Your Dial API key, sent as `Authorization: Bearer sk_live_...`

## Request

### Body (application/json)

This endpoint expects an object.

- `to` (string, optional) — Recipient phone number in E.164 format. Provide exactly one of `to` or `groupId`.
- `groupId` (string, optional) — ID of a group conversation on your account (see List groups), instead of a `to` number. The sending line comes from the group.
- `channel` (enum, optional) — Which rail to send on, for a line that carries more than one. Omit to use the number's own default — a standard number sends SMS, an iMessage number sends iMessage — so existing requests need no change. `sms` sends a carrier text from a number without iMessage; on a standard number it is the same as omitting `channel`. `whatsapp` requires a line whose WhatsApp channel is `ready` (otherwise `400`, "WhatsApp isn't connected on this number."). `imessage` requires an iMessage-capable number; on a standard SMS/call number it is rejected with `400` rather than delivered as an SMS. Redundant on a `groupId` send, which is always WhatsApp.
  - Allowed values: `sms`, `imessage`, `whatsapp`
- `fromNumber` (string, optional) — The Dial number to send from, referenced flexibly: a phone-number ID, one of your numbers in E.164 format, or a number's nickname. A nickname shared by more than one of your numbers is rejected with `400`. A replaced number's ID sends from the number that replaced it (see `replacedBy`); its E.164 no longer works and returns `404`. Provide exactly one of `fromNumber` or `fromNumberId`.
- `fromNumberId` (string, optional) — ID of the Dial number to send from (see List phone numbers). Legacy alternative to `fromNumber` — provide exactly one of the two.
- `body` (string, optional) — Message text. Optional when media is attached; a request with neither a non-empty body nor media is rejected with `400`.
- `forceAudioFile` (boolean, optional, default: false) — Send a lone audio attachment as a regular file attachment instead of a voice message — an iMessage voice message on iMessage numbers, a WhatsApp voice note on WhatsApp numbers. No effect on standard numbers or non-audio media.
- `mediaUrls` (list of string, optional) — Publicly reachable http(s) URLs of media to attach. Dial downloads each one server-side and re-hosts it; the source URL is preserved on the media item as `originalUrl`. iMessage numbers accept at most one item.

## Response

### 201

Message queued.

- `message` (Message, optional)

## Errors

### 400 Bad Request Error

The request body failed validation.

- `error` (ErrorError, optional) — An error message, or a validation-error object for 400 responses.

### 401 Unauthorized Error

Missing or invalid API key.

- `error` (ErrorError, optional) — An error message, or a validation-error object for 400 responses.

### 402 Payment Required Error

Insufficient Dial credit. The number is pay-as-you-go and the account's credit balance is at or below zero. Add credit or start a subscription. (error code `insufficient_credit`.)

- `error` (ErrorError, optional) — An error message, or a validation-error object for 400 responses.

### 403 Forbidden Error

WhatsApp has limited this number's access, so it can't start a new conversation with this recipient yet. Nothing was sent. Replies to people who have messaged the number still go through, and retrying right away fails the same way. (error code `whatsapp_limited`.)

- `error` (ErrorError, optional) — An error message, or a validation-error object for 400 responses.

### 404 Not Found Error

The requested resource was not found on this account.

- `error` (ErrorError, optional) — An error message, or a validation-error object for 400 responses.

### 413 Content Too Large Error

Request body too large — the media exceeds the 10-item / 5 MB-per-file limits.

- `any`

### 429 Too Many Requests Error

The recipient is rate-limited. New contacts on iMessage numbers can only receive a limited number of messages until they reply; once they respond, the limit lifts. Some numbers also carry a monthly SMS sending allowance; once it is spent, SMS from that number is refused with "This number has reached its SMS sending limit for this month." until the next month. (error code `rate_limited`.)

- `error` (ErrorError, optional) — An error message, or a validation-error object for 400 responses.

## Types

### Message

- `id` (string, optional)
- `phoneNumberId` (string, optional)
- `from` (string, optional) — Sender in E.164 format. On an inbound group message this is the participant who sent it — not the group, and not your own line.
- `to` (string, optional, nullable) — Recipient in E.164 format, and **null exactly when `groupId` is set** — in both directions. A group message is addressed to the group, and a group is not a phone number. Which of your numbers the conversation is on is `phoneNumberId`, which is set on every message. Code that reads `to` as "my number" must read `phoneNumberId` instead.
- `groupId` (string, optional, nullable) — The group conversation this message belongs to, or null for a one-to-one conversation. A Dial ID (see List groups) — never the channel's own group identifier.
- `body` (string, optional)
- `direction` (enum, optional)
  - Allowed values: `inbound`, `outbound`
- `channel` (enum, optional) — The channel the message was delivered on. `sms` for SMS/call numbers. For iMessage numbers, inbound messages report the channel actually used — `imessage`, `rcs`, or `sms`. Outbound iMessage sends report `unknown`, because the iMessage channel does not confirm which channel was ultimately used. `whatsapp` is a channel in its own right — a WhatsApp registration on an iMessage line — and is reported in both directions. Every group message is `whatsapp` today.
  - Allowed values: `sms`, `imessage`, `rcs`, `whatsapp`, `unknown`
- `service` (enum, optional) — For iMessage numbers, the confirmed delivery channel. Null for SMS/call numbers (where `channel` already says `sms`). Deprecated — prefer `channel`, which is authoritative.
  - Allowed values: `imessage`, `rcs`, `sms`
- `status` (enum, optional) — Delivery status. Outbound SMS/call messages start at `sent` and reach a terminal `delivered`, `undelivered`, or `failed`. Outbound iMessage messages are `unknown` (the iMessage channel does not report delivery). Inbound messages are `received`.
  - Allowed values: `sent`, `delivered`, `undelivered`, `failed`, `unknown`, `received`
- `statusError` (string, optional, nullable) — A human-readable reason, present only when `status` is `undelivered` or `failed` (for example, when a carrier rejects the message). Null otherwise.
- `deliveryState` (enum, optional) — The delivery axis — the same information as `status`, in the vocabulary that says what to do about it. `pending` means wait for a disposition (`status: "sent"`); `unconfirmed` means never expect one (`status: "unknown"`, an iMessage send, or a WhatsApp send before its first receipt). Inbound messages are `delivered`.
  - Allowed values: `pending`, `delivered`, `undelivered`, `failed`, `unconfirmed`
- `readState` (enum, optional) — The read axis, independent of delivery — a message can be both delivered and read, which `status` alone could never express. `unsupported` on channels that report no reads (SMS) and on every inbound message, since Dial does not track whether you read one. iMessage and WhatsApp report reads, so an outbound message there is `unread` until it is `read`. In a group, `read` means every recipient has read it — never just somebody.
  - Allowed values: `unread`, `read`, `unsupported`
- `readAt` (datetime, optional, nullable) — When the message was read, or null. Always null on inbound messages and on channels that report no reads.
- `deliveryError` (string, optional, nullable) — The current name for `statusError`; identical value. A vendor-neutral reason, present only on an `undelivered` or `failed` message.
- `media` (list of MessageMedia, optional) — Media attachments on the message, in send order. Empty for plain text messages.
- `replyToId` (string, optional, nullable) — ID of the message this one replies or reacts to. Set on messages created via Reply to a message, and on inbound threaded replies and reactions received on iMessage numbers. Null for ordinary messages, or when the target of an inbound reply isn't a message on your account.
- `reaction` (string, optional, nullable) — The reaction this message carries — a reaction name (`love`, `like`, `dislike`, `laugh`, `emphasize`, `question`) or an emoji — when the message is a reaction, sent or received. Null otherwise. A reaction delivered natively has an empty `body`; a reaction delivered as a regular message over SMS carries the emoji in `body` too.
- `createdAt` (datetime, optional)

### ErrorError

An error message, or a validation-error object for 400 responses.

### MessageMedia

A media attachment on a message, hosted by Dial.

- `id` (string, optional) — Public media ID — an unguessable 32-character token.
- `url` (string, optional) — Stable public URL serving the media (see Get public media). Safe to use directly as an image source; requires no authentication.
- `contentType` (string, optional) — MIME type of the media. A contact card shared with the line (on iMessage, WhatsApp or MMS) is `text/vcard`, and its `url` serves the `.vcf` file itself.
- `originalUrl` (string, optional, nullable) — The caller-supplied source URL on outbound messages. Null on inbound messages and when the media was uploaded directly as bytes — inbound media is always served from `url`.

## Examples

**Request**

```json
{}
```

**Response**

```json
{
  "message": {
    "id": "string",
    "phoneNumberId": "string",
    "from": "+14155550123",
    "to": "+14155559876",
    "groupId": null,
    "body": "string",
    "direction": "inbound",
    "channel": "sms",
    "service": "imessage",
    "status": "delivered",
    "statusError": null,
    "deliveryState": "delivered",
    "readState": "unread",
    "readAt": null,
    "deliveryError": null,
    "media": [
      {
        "id": "a3f9c2d41e8b4f0a9c6d2e7b5a1f8c30",
        "url": "https://getdial.ai/public-media/a3f9c2d41e8b4f0a9c6d2e7b5a1f8c30.jpg",
        "contentType": "image/jpeg",
        "originalUrl": "https://your-cdn.example.com/summary.png"
      }
    ],
    "replyToId": null,
    "reaction": null,
    "createdAt": "2024-01-15T09:30:00Z"
  }
}
```

**SDK Code**

```python
import requests

url = "https://api.getdial.ai/api/v1/messages"

payload = {}
headers = {
    "Authorization": "Bearer <token>",
    "Content-Type": "application/json"
}

response = requests.post(url, json=payload, headers=headers)

print(response.json())
```

```javascript
const url = 'https://api.getdial.ai/api/v1/messages';
const options = {
  method: 'POST',
  headers: {Authorization: 'Bearer <token>', 'Content-Type': 'application/json'},
  body: '{}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}
```

```go
package main

import (
	"fmt"
	"strings"
	"net/http"
	"io"
)

func main() {

	url := "https://api.getdial.ai/api/v1/messages"

	payload := strings.NewReader("{}")

	req, _ := http.NewRequest("POST", url, payload)

	req.Header.Add("Authorization", "Bearer <token>")
	req.Header.Add("Content-Type", "application/json")

	res, _ := http.DefaultClient.Do(req)

	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)

	fmt.Println(res)
	fmt.Println(string(body))

}
```

```ruby
require 'uri'
require 'net/http'

url = URI("https://api.getdial.ai/api/v1/messages")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Post.new(url)
request["Authorization"] = 'Bearer <token>'
request["Content-Type"] = 'application/json'
request.body = "{}"

response = http.request(request)
puts response.read_body
```

```java
import com.mashape.unirest.http.HttpResponse;
import com.mashape.unirest.http.Unirest;

HttpResponse<String> response = Unirest.post("https://api.getdial.ai/api/v1/messages")
  .header("Authorization", "Bearer <token>")
  .header("Content-Type", "application/json")
  .body("{}")
  .asString();
```

```php
<?php
require_once('vendor/autoload.php');

$client = new \GuzzleHttp\Client();

$response = $client->request('POST', 'https://api.getdial.ai/api/v1/messages', [
  'body' => '{}',
  'headers' => [
    'Authorization' => 'Bearer <token>',
    'Content-Type' => 'application/json',
  ],
]);

echo $response->getBody();
```

```csharp
using RestSharp;

var client = new RestClient("https://api.getdial.ai/api/v1/messages");
var request = new RestRequest(Method.POST);
request.AddHeader("Authorization", "Bearer <token>");
request.AddHeader("Content-Type", "application/json");
request.AddParameter("application/json", "{}", ParameterType.RequestBody);
IRestResponse response = client.Execute(request);
```

```swift
import Foundation

let headers = [
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
]
let parameters = [] as [String : Any]

let postData = JSONSerialization.data(withJSONObject: parameters, options: [])

let request = NSMutableURLRequest(url: NSURL(string: "https://api.getdial.ai/api/v1/messages")! as URL,
                                        cachePolicy: .useProtocolCachePolicy,
                                    timeoutInterval: 10.0)
request.httpMethod = "POST"
request.allHTTPHeaderFields = headers
request.httpBody = postData as Data

let session = URLSession.shared
let dataTask = session.dataTask(with: request as URLRequest, completionHandler: { (data, response, error) -> Void in
  if (error != nil) {
    print(error as Any)
  } else {
    let httpResponse = response as? HTTPURLResponse
    print(httpResponse)
  }
})

dataTask.resume()
```