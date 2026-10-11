> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# Context MCP

> Attach your own MCP server so your voice agent can call its tools during a call — with Dial managing OAuth and token refresh for you.

A **Context MCP** connects an [MCP](https://modelcontextprotocol.io) server you control to your
account's AI voice agent. Once connected, the server's tools become available to the agent
**during calls** — so it can look things up, take actions, or read your systems mid‑conversation.

Dial handles the connection plumbing. You give it the MCP server URL (plus any extra headers,
query params, and a timeout); Dial probes how the server authenticates and wires its tools into
your agent. For OAuth‑protected servers, Dial also runs the **full OAuth 2.1 flow** and keeps the
access token fresh in the background — your agent stays authenticated without you managing tokens.

## Connect a server

Connect one from the [dashboard Context MCPs page](https://getdial.ai/dashboard/context-mcps), or via the API:

```bash
curl -X POST https://api.getdial.ai/v1/context-mcps \
  -H "Authorization: Bearer $DIAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "My MCP", "url": "https://mcp.example.com/mcp" }'
```

On connect, Dial probes the URL to determine how it authenticates (`authMode`):

| Mode     | When                                           | What Dial does                                                                                               |
| -------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `none`   | Server needs no auth                           | Wires the tools immediately.                                                                                 |
| `static` | You supplied fixed `headers` (e.g. an API key) | Sends those headers as‑is; no token management.                                                              |
| `oauth`  | Server advertises OAuth 2.1                    | Discovers the authorization server, dynamically registers a client (DCR), and returns an `authorizationUrl`. |

For an OAuth server the response includes `authorizationUrl` and the connection stays
`pending_auth` until you open that URL and grant consent. After consent Dial completes the
connection, injects the managed `Authorization` bearer, and schedules a background refresh so the
token never expires out from under the agent. The server's authorization server must support
[Dynamic Client Registration (RFC 7591)](https://datatracker.ietf.org/doc/html/rfc7591).

> **Note**
>
> Secrets you provide (headers, query params) and the OAuth tokens Dial obtains are encrypted at
> rest and never returned by the API — list and get responses mask their values.

## Per‑call context headers

On **every** request to your MCP server during a call, Dial adds three headers describing the
call, populated live at call time:

| Header                | Value                                                                             |
| --------------------- | --------------------------------------------------------------------------------- |
| `X-Dial-Direction`    | `inbound` or `outbound`.                                                          |
| `X-Dial-User-Number`  | The other party's number — the caller on inbound, the callee on outbound (E.164). |
| `X-Dial-Agent-Number` | Your Dial number — the callee on inbound, the caller on outbound (E.164).         |

There is no raw "from/to": the user vs. agent side is expressed **relative to direction**, so derive
from/to yourself if you need it (`from = user` on inbound, `from = agent` on outbound).

These are present during a live call. On the initial tool‑discovery connection (no active call)
they may be absent or arrive as unsubstituted templates — authorize on their *presence and value*,
not their mere existence.

## Authorize per call — don't rely on the connection identity alone

> **Warning**
>
> The OAuth (or static) credential authenticates the connection as **one identity — your account**,
> with whatever scopes you granted. Every call through the agent shares that identity. Most MCP
> servers return data and expose functionality strictly according to the authenticated account's
> scopes — so if your server authorizes on the connection alone, **any** person who reaches the
> agent (any caller on an inbound line, or any number you dial out to) can access **everything those
> scopes allow**.
>
> Treat the connection identity as *authentication*, and the `X-Dial-*` headers as the input to
> *authorization*. Your MCP server should enforce access **at request time** using
> `X-Dial-User-Number`, `X-Dial-Agent-Number`, and `X-Dial-Direction` — for example: only return a
> user's records when `X-Dial-User-Number` matches them, restrict sensitive tools to `inbound` vs.
> `outbound`, or reject calls from numbers you don't recognize. Without this per‑call handling, the
> connection's scopes are effectively granted to whoever is on the line.

## Tools on the agent

When a connection succeeds, Dial fetches the server's tool list and makes those tools callable by
the agent for the rest of the account's calls. Disconnecting a Context MCP (the dashboard's delete,
or `DELETE /api/v1/context-mcps/{id}`) removes its tools from the agent and stops the token refresh.