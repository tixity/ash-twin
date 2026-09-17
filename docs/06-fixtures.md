# 06 — Fixtures

`fixtures/` — the wiring that hands tests their dependencies. Playwright's dependency injection system.

## What lives here

| File | Provides | Depends on |
|---|---|---|
| `tenant.ts` | `tenant` — loaded TenantConfig | `TENANT` and `ENV` env vars |
| `browser.ts` | `adminPage`, `customerPage` — role-scoped browser tabs (admin pre-logged-in, customer anonymous) | `tenant`, `observer` |
| `observer.ts` | `observer` — cross-cutting listener for console/network/cookies; asserts at teardown | — |
| `actors.ts` | `db`, `resolver`, `admin`, `customer` | `tenant`, `adminPage`, `customerPage` |
| `feedback.ts` | `feedback(message)` — attach a note to the test result | — |
| `index.ts` | Merged `test` export tests import from | All of the above |

## How tests use fixtures

```ts
import { test, expect } from '../../fixtures';

test('foo', async ({ customer, resolver, tenant }) => {
  //                    ↑          ↑         ↑
  //  names match the fixtures declared above
  const event = await resolver.event({ status: 'published' });
  await customer.buyTicket(event, ...);
});
```

Test destructures the fixtures it needs. Playwright resolves dependencies in order, constructs each one, hands them over.

## Resolution chain — example

```
Test declares: { customer }
   ↓
Playwright looks up 'customer' in actors.ts
   ↓
'customer' needs { customerPage, tenant }
   ↓
'customerPage' needs { browser, tenant }
   ↓
'tenant' loads tenants/${TENANT}.${ENV}.json
   ↓
Everything constructed bottom-up, test receives ready-to-use customer
```

## Lifecycle

Each fixture has setup + teardown:

```ts
db: async ({ tenant }, use) => {
  const client = new DbClient(tenant.db);   // setup
  await use(client);                          // hand to test
  await client.close();                       // teardown after test
},
```

Teardown runs automatically even if the test fails.

## Fixture scopes

- **Test-scoped** (default) — new instance per test. Isolation.
- **Worker-scoped** — one instance per parallel worker. Useful for expensive setup (login, DB seed).

We currently use test-scoped everywhere. Worker-scoped storage-state auth is a future optimization when the suite grows.

## The tenant/env variables

```bash
TENANT=cca ENV=local npx playwright test
```

`fixtures/tenant.ts` reads these:

```ts
const name = process.env.TENANT ?? 'cca';
const env  = process.env.ENV    ?? 'local';
const cfg  = loadTenant(`tenants/${name}.${env}.json`);
```

Same test file runs against any tenant/env by changing env vars. Test code never mentions tenant name.

## Adding a new fixture

**Rule**: every fixture lives in its own file under `fixtures/`. `fixtures/index.ts` only imports, merges, and re-exports — it never contains fixture logic. This keeps concerns isolated as the framework grows (plugin-setup, entity-registry, snapshot, etc. all land as new files, not appended into a growing index).

1. Create `fixtures/{name}.ts` with an `{name}Fixtures` export
2. Import + add it to `mergeTests(...)` in `fixtures/index.ts`
3. Tests destructure it: `test('x', async ({ myFixture }) => { ... })`

Example — the `feedback` fixture (`fixtures/feedback.ts`):

```ts
import { test as base } from '@playwright/test';

export const feedbackFixtures = base.extend<{
  feedback: (message: string) => void;
}>({
  feedback: async ({}, use, testInfo) => {
    await use((message: string) => {
      testInfo.annotations.push({ type: 'feedback', description: message });
    });
  },
});
```

Wired into `fixtures/index.ts`:

```ts
export const test = mergeTests(tenantFixture, observerFixtures, browserFixtures, actorsFixtures, feedbackFixtures);
```

Tests then use it naturally:

```ts
test(14, async ({ customer, feedback }) => {
  // ...
  feedback(`user ${email} signed up`);
});
```

Annotations show in the JSON report under each test's `annotations` array and in the HTML report's test detail view. Same channel a future ash-twin dashboard would ingest via a custom reporter.
