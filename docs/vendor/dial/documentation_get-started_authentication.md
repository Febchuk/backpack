> For clean Markdown of any page, append .md to the page URL.
> For a complete documentation index, see https://docs.getdial.ai/llms.txt.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.getdial.ai/_mcp/server.

# Authentication

> Authenticate every Dial request with a sk_live_ API key sent as a Bearer token.

Every Dial request is authenticated with an API key — a string that begins with `sk_live_`. Send it as a Bearer token:

```bash
curl https://api.getdial.ai/v1/numbers \
  -H "Authorization: Bearer sk_live_..."
```

Requests without a valid key get `401 Unauthorized`.

## Get an API key

Create an account and key with the CLI:

```bash
dial auth login you@example.com
dial auth verify-otp --code 123456
dial auth register-number +14155550123
dial auth verify-otp --number --code 654321
```

Creating an account requires a **verified phone number** as well as a verified email, so a new signup runs all four steps. Signing in to an account you already have needs only the first two.

The final step returns your key once and **saves it locally**, so subsequent `dial` commands are already authenticated.

### Coupon codes

If you have an event coupon, pass it on the first step: `dial auth login you@example.com --coupon <code>`, or `coupon` in the `POST /v1/auth/signup` body. A valid coupon lets a new account sign up even while new signups are paused, and its credit is added when the account is created. Coupon credits can expire: whatever is left is taken back at the coupon's expiry. An invalid, inactive, or already-used coupon is refused on that first step, before any code is sent. Coupons apply to new accounts only.

Calling the API directly follows the same shape: `POST /v1/auth/signup`, then `POST /v1/auth/verify`. If verify returns `registrationId` rather than an `apiKey`, the flow isn't finished — continue with `POST /v1/auth/register-number` and `POST /v1/auth/verify-number`, and that last call returns `apiKey` a single time. Store it.

## Use your key

* **CLI** — handled automatically once `dial auth verify-otp` completes.
* **SDKs** — pass the key when you construct the client:

**`Node`**

```typescript title="Node"
import { DialClient } from "@getdial/sdk";
const dial = new DialClient({ apiKey: process.env.DIAL_API_KEY! });
```

**`Python`**

```python title="Python"
from dial_sdk import DialClient, DialConfig
dial = DialClient(DialConfig(api_key="sk_live_..."))
```

> **Warning**
>
> Treat your API key like a password. It grants full access to your account — send messages, place calls, and read history. Never commit it; prefer an environment variable.

## Base URL

All requests go to:

```
https://api.getdial.ai
```

The CLI and SDKs target this by default. To point a tool at a different deployment, set the `DIAL_API_URL` environment variable (CLI) or pass `baseUrl` / `base_url` when constructing an SDK client.

> **Info**
>
> **Older SDK or CLI versions** default to `https://getdial.ai` instead. Both URLs serve the same API — your existing code keeps working. Upgrade when convenient (`npm update @getdial/sdk` / `pip install --upgrade dial-sdk` / `npm i -g @getdial/cli@latest`) to pick up the new default.

## Review your keys

`GET /v1/account` returns your account and a **preview** of each key (never the full value). See [Core concepts](/documentation/get-started/core-concepts) for the object model.