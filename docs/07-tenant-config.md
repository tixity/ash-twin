# 07 — Tenant config

`tenants/` — one JSON file per (tenant × env) combo. Holds every value the framework needs to talk to a specific tenant's environment.

## File naming

```
tenants/
├── cca.local.json
├── cca.staging.json
├── adrea.staging.json
├── ...
```

Pattern: `{tenant}.{env}.json`. `fixtures/tenant.ts` reads project metadata (declared in `playwright.config.ts`) to pick the file.

## Schema

```jsonc
{
  "name": "cca",
  "env":  "staging",
  "theme": "default",                    // 'default' | 'capetown' | 'next'

  "baseUrl": "https://staging.coca-cola-arena.com",   // admin / POS / dashboard / scanner
  "webUrl":  "https://staging.coca-cola-arena.com",   // customer web (may differ on Next.js tenants)

  "currency": "AED",
  "locale":   "en",

  "users": {
    "superadmin": {
      "username": "${CCA_STAGING_SUPERADMIN_USER}",
      "password": "${CCA_STAGING_SUPERADMIN_PASSWORD}"
    },
    "testCustomer": {
      "username": "${CCA_STAGING_TESTCUSTOMER_USER}",
      "password": "${CCA_STAGING_TESTCUSTOMER_PASSWORD}"
    }
  },

  "db": {
    "host":     "${CCA_STAGING_DB_HOST}",
    "port":     "${CCA_STAGING_DB_PORT}",
    "user":     "${CCA_STAGING_DB_USER}",
    "password": "${CCA_STAGING_DB_PASSWORD}",
    "database": "${CCA_STAGING_DB_NAME}"
  }
}
```

**Required fields:** `name`, `env`, `theme`, `baseUrl`, `webUrl`, `currency`, `locale`, `users.superadmin`, `db`.
**Optional:** `users.testCustomer` (needed for tests that log in as a customer), plus optional roles `cashier`, `scanner`, `organizer` on `users`.

## The `theme` field

Determines which page-object bundle the WebCustomer actor uses. See [04-page-objects.md](./04-page-objects.md) and [pages/web/factory.ts](../pages/web/factory.ts).

| Value | Meaning | Tenants using it |
|---|---|---|
| `default` | Stock SquareMaze Smarty theme | cca |
| `capetown` | Capetown Smarty theme (CSS-heavy overrides, config-gated fields) | adrea, blublood, theagenda |
| `next` | External Next.js customer app hitting the public API | antoine, virgin |

Adding a tenant on an existing theme = one JSON file + one project entry. Adding a new theme = a new bundle function under `pages/web/{theme}/` + factory branch.

## Env var interpolation

Any `${VAR_NAME}` in the JSON is replaced with `process.env.VAR_NAME` at load time. Secrets (passwords, tokens) live in `.env` (gitignored), never in committed JSON.

`fixtures/tenant.ts` performs the interpolation. Missing env vars throw a clear error.

**Naming convention:** `{TENANT}_{ENV}_{SETTING}`, uppercase, underscore-separated. Grep-friendly, easy to spot in `.env` files.

## Local `.env` — never committed

Every developer creates their own:

```bash
# ash-twin/.env
CCA_STAGING_SUPERADMIN_USER=admin
CCA_STAGING_SUPERADMIN_PASSWORD=...
CCA_STAGING_TESTCUSTOMER_USER=user@example.com
CCA_STAGING_TESTCUSTOMER_PASSWORD=...
CCA_STAGING_DB_HOST=staging-db.example.internal
CCA_STAGING_DB_PORT=3306
CCA_STAGING_DB_USER=ashtwin_ro
CCA_STAGING_DB_PASSWORD=...
CCA_STAGING_DB_NAME=cca_staging
```

CI uses a secrets manager (GitHub Secrets, etc.) that populates the same env vars.

## What's accessible in tests

The `tenant` fixture exposes the fully interpolated config:

```ts
test('foo', async ({ tenant }) => {
  console.log(tenant.name);              // 'cca'
  console.log(tenant.theme);             // 'default'
  console.log(tenant.baseUrl);           // 'https://staging.coca-cola-arena.com'
  console.log(tenant.users.superadmin);  // { username: 'admin', password: '...' }
  // ...
});
```

Small helpers on `helpers/tenant.ts` give better error messages than raw `!`:

```ts
import { requireTestCustomer } from '../../helpers/tenant';
const creds = requireTestCustomer(tenant);   // throws with the exact env-var names if unset
```

## Adding a new tenant — end-to-end

### 1. Verify site prerequisites

Before wiring anything, confirm these on the tenant's target environment:

| Prerequisite | Why | How to check |
|---|---|---|
| `INSTALL_VERSION` contains `dev` or `staging` | Server honors `skipCaptcha=1` from ash-twin only when `isTestVersion()` returns true (see [08-squaremaze-conventions.md](./08-squaremaze-conventions.md#the-captcha-test-mode-bypass)) | `curl -sI {baseUrl}` → check `X-Powered-By: SquareMaze/…` header, or the admin footer |
| `disable_config_cache` flag exists (SquareMaze `data_config.php`) | Lets `db.overrideConfig` take effect without dancing around the file cache | `beforeAll` will bootstrap it on first run; nothing to do manually |
| Payment handlings you need are enabled | Purchase tests do `payWith('cybersource_unified', …)` — the plugin has to be configured and rendered on the checkout preview | Load the checkout preview manually with a cart, check the handlings list |
| Admin superadmin creds work | `beforeAll` logs in as superadmin to clear caches | Log into `{baseUrl}/admin/` manually with the creds you'll use |

### 2. Add env vars

Append the tenant's secrets to your local `.env`:

```bash
THEAGENDA_STAGING_SUPERADMIN_USER=admin
THEAGENDA_STAGING_SUPERADMIN_PASSWORD=...
THEAGENDA_STAGING_TESTCUSTOMER_USER=customer@example.com
THEAGENDA_STAGING_TESTCUSTOMER_PASSWORD=...
THEAGENDA_STAGING_DB_HOST=...
THEAGENDA_STAGING_DB_PORT=3306
THEAGENDA_STAGING_DB_USER=...
THEAGENDA_STAGING_DB_PASSWORD=...
THEAGENDA_STAGING_DB_NAME=...
```

### 3. Create the tenant JSON

```jsonc
// tenants/theagenda.staging.json
{
  "name": "theagenda",
  "env":  "staging",
  "theme": "capetown",

  "baseUrl": "https://staging.theagenda.example.com",
  "webUrl":  "https://staging.theagenda.example.com",

  "currency": "AED",
  "locale":   "en",

  "users": {
    "superadmin":   { "username": "${THEAGENDA_STAGING_SUPERADMIN_USER}",   "password": "${THEAGENDA_STAGING_SUPERADMIN_PASSWORD}" },
    "testCustomer": { "username": "${THEAGENDA_STAGING_TESTCUSTOMER_USER}", "password": "${THEAGENDA_STAGING_TESTCUSTOMER_PASSWORD}" }
  },
  "db": {
    "host":     "${THEAGENDA_STAGING_DB_HOST}",
    "port":     "${THEAGENDA_STAGING_DB_PORT}",
    "user":     "${THEAGENDA_STAGING_DB_USER}",
    "password": "${THEAGENDA_STAGING_DB_PASSWORD}",
    "database": "${THEAGENDA_STAGING_DB_NAME}"
  }
}
```

### 4. Add the Playwright project

Pick `testMatch` by theme:

| Theme | testMatch |
|---|---|
| `default` | `['vitality/native/**/*.spec.ts', 'vitality/default/**/*.spec.ts']` |
| `capetown` | `['vitality/native/**/*.spec.ts', 'vitality/capetown/**/*.spec.ts']` |
| `next` | `['vitality/{tenant}/**/*.spec.ts']` (Next.js apps don't share `native/`) |

```ts
// playwright.config.ts
{
  name: 'theagenda-staging',
  testDir: './specs',
  testMatch: ['vitality/native/**/*.spec.ts', 'vitality/capetown/**/*.spec.ts'],
  metadata: { tenant: 'theagenda', env: 'staging' },
},
```

### 5. First-run smoke test

```bash
npx playwright test --project=theagenda-staging --reporter=line
```

Expect some tests to fail — theme-specific selector differences will surface here. Common breakage:

- **Config-gated fields** (DOB, city, address, residence country on capetown) — `fillRegister` throws when the field isn't rendered. Patch the theme's `auth.ts` to guard field-existence.
- **Separate login URL on capetown** — login form lives at `/login`, not `/register`. Adjust the auth page's `path` or add a login-specific method.
- **Selector fixes** — anywhere capetown's DOM wraps default's in extra containers.

Fix in `pages/web/{theme}/*.ts`. Every tenant on that theme benefits.

### 6. Iterate

- Genuinely universal tests belong in `specs/vitality/native/`.
- Theme-specific tests (e.g. capetown's config-gated field toggle tests) belong in `specs/vitality/{theme}/`.
- Rare tenant-within-theme quirks: `test.skip(tenant.name !== '…', 'specific reason')` inline in the test.

See [09-writing-tests.md](./09-writing-tests.md) and [04-page-objects.md](./04-page-objects.md) for the ongoing test/page conventions.

## Common gotchas we've hit

- **reCAPTCHA + INSTALL_VERSION.** `skipCaptcha=1` only bypasses captcha when server-side `isTestVersion()` returns true. If your deployment pipeline strips the `-dev`/`-staging` suffix from `INSTALL_VERSION`, add it back — otherwise test 11 (signup) rejects silently. See [08-squaremaze-conventions.md](./08-squaremaze-conventions.md).
- **Config cache shadowing.** `db.overrideConfig` writes to the DB, but SquareMaze serves from `cached_config_data.dat`. `disable_config_cache=1` + `admin.clearCache()` in `beforeAll` bootstraps the tenant out of this trap.
- **DB read-after-write lag.** Staging tenants on Azure MySQL sometimes lag ~50ms behind writes. `helpers/db-client.ts::withRetry()` guards the two register-time reads that hit this window.
- **The `skipCaptcha=1` injection** in `fixtures/browser.ts::injectSkipCaptchaOnCustomerPosts` only applies to the tenant's own host — third-party posts (analytics, gateway callbacks) are untouched.
- **Anonymous cart flow lands on a template swap, not a redirect.** Test 18's assertion uses DOM (`customer.isOnAuthPage()`), not URL matching, because SquareMaze re-renders the auth form at `checkout.php?action=preview` for guests.

## Future fields

Not yet in schema but planned as needs surface:

- `fixtures.venues` — pre-seeded test venues per tenant
- `fixtures.customers` — additional named customer roles
- `baseline.plugins` — required plugins for tests to work
- `payments.default` — a fallback handling key for tests that don't care which gateway
