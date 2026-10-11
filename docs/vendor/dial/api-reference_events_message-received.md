> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# message.received

> Event emitted when an inbound message arrives on a Dial number.

Emitted when an inbound message (SMS, MMS, an iMessage, or a WhatsApp message) arrives on one of your Dial numbers. This is the event you wait for when [receiving a one-time code](/documentation/capabilities/receive-an-sms) or any inbound reply.

Messages sent to a [group conversation](/documentation/capabilities/groups) arrive on this same event, carrying `groupId`.

## Schema

Shares the common [event envelope](/api-reference/events/overview#envelope) (`id`, `object`, `type`, `version`, `createdAt`, `relatedObject`). `relatedObject` is `{ id: <messageId>, type: "message", url: null }` — messages have no get-by-id endpoint yet. The `data` payload:

| `data` field | Type           | Description                                                                                                                                                                                                                                                                                                                                                             |
| ------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `messageId`  | string         | Dial-issued ID for the message. Matches the `id` returned by `GET /api/v1/messages`.                                                                                                                                                                                                                                                                                    |
| `from`       | string         | Sender phone number, E.164. On a group message, the participant who sent it — not the group.                                                                                                                                                                                                                                                                            |
| `to`         | string \| null | Your Dial number that received the message, E.164 — and **`null` when `groupId` is set**, because a group message is addressed to the group. Which of your numbers the conversation is on is the message's `phoneNumberId`.                                                                                                                                             |
| `groupId`    | string \| null | The [group conversation](/documentation/capabilities/groups) the message belongs to, or `null` for a one-to-one conversation. A Dial ID — never the channel's own group identifier. Filter on it with `filters: { "groupId": "grp_123" }` to wait for one group's traffic.                                                                                              |
| `channel`    | string         | The channel the message arrived on: `"sms"`, `"imessage"`, `"rcs"`, or `"whatsapp"`. A group message is `"whatsapp"` or `"imessage"`.                                                                                                                                                                                                                                   |
| `body`       | string         | Message text.                                                                                                                                                                                                                                                                                                                                                           |
| `media`      | array          | Media attachments (MMS on SMS numbers, attachments on iMessage numbers), in received order. Empty for text-only messages. Each item: `id` (public media ID), `url` (stable unauthenticated Dial URL serving the media — safe to fetch or render immediately), `contentType` (MIME type), `originalUrl` (always `null` on inbound messages; media is served from `url`). |
| `replyToId`  | string \| null | On iMessage numbers, when the inbound message is a threaded reply or a reaction targeting one of your messages: the targeted message's ID. Null for ordinary messages, or when the target isn't a message on your account.                                                                                                                                              |
| `reaction`   | string \| null | On iMessage numbers, when the inbound message is a reaction (e.g. a Tapback): the reaction's emoji. `body` is empty for reactions. Null for ordinary messages and threaded replies.                                                                                                                                                                                     |
| `source`     | string         | `"external"` for messages delivered by a carrier; `"internal"` for messages synthesized by Dial (e.g. test injections). Filter on `"external"` if you only care about real inbound traffic.                                                                                                                                                                             |

## Example

```json
{
  "id": "evt_3f9a2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90",
  "object": "event",
  "type": "message.received",
  "version": 1,
  "createdAt": "2026-05-28T14:32:08.412Z",
  "relatedObject": { "id": "msg_01HW3X7P5QF6K2YQ9YJ7Q8R5N3", "type": "message", "url": null },
  "data": {
    "messageId": "msg_01HW3X7P5QF6K2YQ9YJ7Q8R5N3",
    "from": "+14155550123",
    "to": "+14155559876",
    "channel": "sms",
    "body": "Your verification code is 123456",
    "media": [
      {
        "id": "a3f9c2d41e8b4f0a9c6d2e7b5a1f8c30",
        "url": "https://getdial.ai/public-media/a3f9c2d41e8b4f0a9c6d2e7b5a1f8c30.jpg",
        "contentType": "image/jpeg",
        "originalUrl": null
      }
    ],
    "replyToId": null,
    "reaction": null,
    "source": "external"
  }
}
```

### A group message

Same event, with the destination moved from `to` to `groupId`:

```json
{
  "data": {
    "messageId": "msg_01HW3X7P5QF6K2YQ9YJ7Q8R5N4",
    "from": "+14155550123",
    "to": null,
    "groupId": "grp_123",
    "channel": "whatsapp",
    "body": "I'll bring the cake",
    "media": [],
    "replyToId": null,
    "reaction": null,
    "source": "external"
  }
}
```

`from` is the participant who sent it. To know which of your numbers the conversation is on, read the message's `phoneNumberId` from `GET /api/v1/messages?groupId=grp_123`.

## When it fires

* Every time a message is delivered to one of your Dial numbers (SMS, MMS, an iMessage/RCS message on an iMessage number, or a WhatsApp message on a line with WhatsApp connected).
* For a message sent to a group your line is in — once per line that is in the group.
* Once per inbound message — no retries on the stream itself.
* Internal test traffic (from dashboard or `/api/v1/test/*` helpers) carries `data.source: "internal"`; ignore those unless you're explicitly testing.