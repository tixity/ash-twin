# 09 — Writing tests

Every ash-twin test goes through two things: the **registry** and the **`test(id, fn)` wrapper**.

## The registry — `specs/registry.json`

One JSON array, one entry per test:

```json
[
  { "id": 1,  "title": "empty first name blocks submission" },
  { "id": 2,  "title": "empty last name blocks submission" },
  ...
  { "id": 14, "title": "an existing user logs in with valid credentials" }
]
```

Each entry holds:
- **`id`** — an integer, the test's stable identity. Referenced from Linear tickets, PR bodies, the HTML report, and any future dashboard.
- **`title`** — what shows in the report and terminal output. Editable without touching the spec file.

The registry never renumbers. Deleting a test leaves a gap in the ids — that's fine and expected. IDs are permanent so external references (Linear tickets, PR comments, dashboards) stay meaningful.

## The wrapper — `helpers/test.ts`

Import `test` and `expect` from `helpers/test`, then call `test(id, category, fn)`:

```ts
import { test, expect } from '../../helpers/test';

test(1, 'vitality', async ({ customer }) => {
  await customer.openAuth();
  // ...
});
```

Three arguments:
- **`id`** — integer, looked up in the registry
- **`category`** — string, becomes an `@{category}` tag (`'vitality'`, `'regression'`, `'smoke'`, ...)
- **`fn`** — the test body, same signature as Playwright's

Under the hood the wrapper:
1. Looks up `id` in the registry
2. Builds the Playwright test title as `ID: {id} {registry.title}`
3. Auto-injects a single tag: `@{category}`
4. Throws at import time if the id isn't in the registry, or if the registry has a duplicate

Playwright's own methods (`test.describe`, `test.beforeAll`, `test.step`, `test.use`, ...) still work — the wrapper passes them through.

## Title and tag convention

Each test surfaces as:

- **Title**: `ID: 1 empty first name blocks submission` — id lives at the start so it's visible in the terminal, the HTML report, UI mode, and any JSON export without ever needing to inspect tags.
- **Tag**: `@{category}` — only one tag emitted. Today every test in `specs/vitality/` passes `'vitality'` → `@vitality`.

**Folder rule** (a convention, not framework-enforced):
- Tests under `specs/vitality/` pass `'vitality'` as the category.
- (Future) tests under `specs/regression/` will pass `'regression'`.
- (Future) tests under `specs/smoke/` will pass `'smoke'`.

Grouping tests by folder + naming their category explicitly at every call keeps the tag intent obvious to reviewers and makes misplaced tests visible in code review.

Filter examples:
```bash
# Run every vitality test
npx playwright test --grep @vitality

# Run only test 11 — three equivalent options
npx playwright test --grep "^ID: 11 "               # by title (mind the trailing space so 11 doesn't match 110)
npx playwright test specs/vitality/auth.spec.ts:103 # by file path + line number
npx playwright test --ui                            # UI mode, click any test to run it
```

## Adding a new test

1. **Reserve an id.** Open `specs/registry.json`, look at the last entry's `id`, add 1.
2. **Add the entry:**
   ```json
   { "id": 15, "title": "logout returns the user to signed-out state" }
   ```
3. **Write the test** in any file under `specs/vitality/`:
   ```ts
   test(15, 'vitality', async ({ customer }) => {
     // ...
   });
   ```
4. Commit both changes together (registry entry + spec file). The wrapper handles tag injection.

## What we're NOT tagging (any more)

The registry used to also carry `feature`, `surface`, and `validatedOn` fields, each surfaced as a separate tag. Those were dropped once we realized the tag list was noise: `@id:N` uniquely identifies the test, `@vitality` categorizes it, and everything else belongs in a proper metadata layer (a future test-coverage store, not a Playwright tag string).

When we build the coverage dashboard, richer metadata will land in a real schema — not in dot-separated tag strings.

## Verify both sides — DB and DOM

Tests that just check the frontend can pass while the DB says something totally different. The signup test (id 11) is the gold standard for the mixed-verification pattern:

```ts
test(11, 'vitality', async ({ customer, db }) => {
  const email = `ash.twin.${Date.now()}@example.com`;
  try {
    await customer.openAuth();
    await customer.fillRegister(validBase(email));
    await customer.enableTestCaptchaBypass();
    await customer.submitRegisterProgrammatically();

    const activationPath = await db.activationUrlFor(email);      // DB: user + auth row exist
    expect(activationPath).toContain('/activation.php?uar=');

    await customer.activate(activationPath);

    expect(await db.isUserActive(email)).toBe(true);              // DB: user active, auth cleared
    expect(await customer.isSignedIn()).toBe(true);               // DOM: header shows signed-in state
  } finally {
    await db.deleteUserByEmail(email);                            // cleanup
  }
});
```

Every step is verified on both sides, and the `finally` cleans the row even if the test throws mid-body.

Purchase tests follow the same shape via `db.orderById(orderRef)` — the confirmation page's `h1.success` can lie about the actual state (webhook races leave the DB `pending` while the heading is already green). A paid-and-committed order is `status='ord'` + `paymentStatus='paid'` (mirrors `Order::isOrdered()` in `model.order.php`):

```ts
const order   = await customer.buyTicket(event, category, 1, { payment: 'any' });
expect(order.status).toBe('paid');                              // DOM: heading

const dbOrder = await db.orderById(order.orderRef);
expect(dbOrder, `order ${order.orderRef} not found in DB`).not.toBeNull();
expect(dbOrder?.paymentStatus).toBe('paid');                    // DB: not stuck at 'pending'
expect(dbOrder?.status).toBe('ord');                            // DB: committed, not 'res'
```

`db.deleteOrderById()` doesn't exist yet — paid orders are the desired state, so purchase tests don't clean up. Cancelled/failed test orders can be tidied by an offline job if they pile up.

## Factories — self-contained fixtures via direct DB insert

Some tests need a specific fixture shape (e.g. an addon with `category_min=3, category_max=5, category_multiple_of=2`, or a promo-code discount capped at 5 uses) that no tenant currently has seeded. Rather than depending on pre-existing rows, seed them inline via `factories/`.

Each factory follows the same shape: a `create*` for the raw insert, a `delete*` for cleanup, and a `with*` combinator that wraps the test body in try/finally so the row is torn down whether the test passes, fails, or throws. Callers use only the `with*` combinator.

### Available factories

`factories/addon.ts` — `withAddon(db, parentEventId, opts, fn)`:

```ts
import { withAddon } from '../../../factories/addon';

await withAddon(db, event.id, {
  categories: [{ min: 3, max: 5, multipleOf: 2 }],
}, async (addon) => {
  // addon: { addonId, categoryIds, addonLinkId, name }
  await customer.openEvent(event);
  // ... drive the flow, assert, feedback ...
});
// addonlink → seat → category → event rows deleted unconditionally on exit
```

Inserts into `event` (with `event_addon=1, event_model='product'`), `category`, `addonlink`, and 20 `seat` rows per category (so the reservation flow finds inventory).

`factories/discount.ts` — `withDiscount(db, opts, fn)`:

```ts
import { withDiscount } from '../../../factories/discount';

await withDiscount(db, {
  eventId: addon.addonId, type: 'percent', value: 25,
  promoCode: 'ASHTWIN-25',            // optional — omit for auto-apply
  minTickets: 3, maxTickets: 20,      // optional — discountrestrictions plugin
}, async (discount) => {
  // discount: { discountId, promoId, promoCode, name, linkedEventIds, isPromo }
});
// promocode → discountlink → discount rows deleted on exit
```

Inserts into `discount` (with `discount_promo` populated when `promoCode` is set), one `discountlink` row per `linkedEventIds` entry (for multi-event / global discounts), and one `promocode` row (with `promo_max` / `promo_used` for the exhausted-code tests) when a code is provided.

### When to write a new factory

- The test needs a specific row shape that varies per-test, and hard-coding it via `db.setEventField` would leak setup into the spec.
- Multiple specs would benefit from the same seeded shape.
- Cleanup is non-trivial (dependent rows, plugin side-tables).

The pattern: interface for `opts`, function for `create*`, function for `delete*`, `with*` combinator wrapping `create → fn → delete` in try/finally. Bypassing PHP save hooks is fine for pure-content rows; if a future test needs plugin side-effects (e.g. seat inventory init that only fires from the admin path), escalate that specific case to an admin HTTP fixture.

## Long-running tests raise their own timeout

The global per-test timeout is 60s (`playwright.config.ts` → `timeout: 60_000`); `actionTimeout` is 30s and `navigationTimeout` is 60s. Payment tests run through real sandbox gateways and need more:

```ts
test(16, 'vitality', async ({ customer, resolver, tenant, feedback }) => {
  test.setTimeout(120_000);   // gateway sandbox + 3DS
  // ...
});
```

Raise per-test, not globally. Auth tests still fail loudly at 60s when something's stuck.

Renumbered ID reference: payment tests are 16 (visa no-3DS), 17 (visa 3DS complete), 18 (visa 3DS cancel), 21 (Tabby), and 19 (anonymous → auth redirect).

## Conventions in practice

These aren't framework-enforced. Every existing spec follows them — match the pattern when adding new tests so review stays about behaviour, not style.

**Alias `customer.pages.{page}` at the top of the test.** Every spec pulls the page object into a local variable before using it, so the body reads cleanly:

```ts
test(N, 'vitality', async ({ customer }) => {
  const auth = customer.pages.auth;
  await auth.open();
  await auth.fillLogin(creds);
  // ...
});
```

**"Valid minus one" for negative validation tests.** Each spec file defines a `validBase()` factory that returns a fully valid payload, and each negative test spreads it, overriding one field:

```ts
const validBase = (email?: string): RegisterData => ({ /* every field valid */ });

test(1, 'vitality', async ({ customer }) => {
  await auth.fillRegister({ ...validBase(), firstName: '' });
  await auth.submitRegister();
  expect(await auth.hasFieldError('user_firstname')).toBe(true);
});
```

One failing field per test. If you find yourself blanking two fields, that's two tests.

**The `feedback()` fixture.** Attaches a human-readable note to the report so the HTML dashboard shows what actually happened, not just green/red:

```ts
feedback(`user ${email} signed up`);
feedback(`event ${event.id} category ${category.id}: paid order ${order.orderRef}`);
```

Use it once, after the last assertion. State the outcome (what got created and with what identifiers), not the steps.

**Config-touching specs need a cache-invalidation `beforeAll`.** Any test that flips a `configuration` row through `db.overrideConfig` reads stale values until the memcache is cleared. Every purchase and payment spec starts with:

```ts
test.beforeAll(async ({ admin, db }) => {
  await db.overrideConfig('disable_config_cache', '1');
  await admin.clearCache();
});
```

Boilerplate, but skip it and the test flakes intermittently.

**Standard purchase setup.** Every purchase test resolves the same event/category shape:

```ts
const event    = await resolver.event({ ...events.normal, hasHandling: '<gateway key>' });
const category = await resolver.category({
  eventId:      event.id,
  numbering:    'none',
  webPublished: true,
  soldout:      false,
});
```

`events.normal` lives in `helpers/presets/event.ts` and means "regular published event, tickets on sale". Reach for a different preset only when the test specifically targets a soldout / hidden / out-of-window event.

**`payment: 'any'` for tenant-agnostic purchases.** Use it in specs under `specs/vitality/native/` so the same spec runs against every tenant regardless of which gateway is configured:

```ts
const order = await customer.buyTicket(event, category, 1, { payment: 'any' });
```

`buyTicket` picks the first rendered handling that has a registered strategy. Under `specs/payments/` you name the gateway explicitly (`payment: { key: 'cybersource_unified', card: cards.visaSuccess }`).

**`test.setTimeout(...)` on the first line of the body**, with a trailing comment explaining why:

```ts
test(16, 'vitality', async ({ customer, resolver, tenant, feedback }) => {
  test.setTimeout(120_000);   // paid checkout goes through the gateway sandbox
  // ...
});
```

Keeps the raised timeout visible at a glance during review.

**Section headers use Unicode box characters.** Long spec files group tests with dividers:

```ts
// ── Register form: per-field client-side validation ────────────────────────
// ── Login form: validation, rejection, and success ────────────────────────
```

The `──` (U+2500) reads better in a terminal than `-----`. Match the existing style.

## Spec files host tests, nothing else

A spec file is a container for `test(id, ...)` bodies. It does **not** own logic. Every layer below the spec has its own home:

| Concern | Home |
|---|---|
| Selectors, DOM waits, atomic gestures | `pages/web/{theme}/{page}.ts` |
| Business orchestration (login → open event → buy) | `actors/{web-customer,admin}.ts` |
| Fixture creation / teardown | `factories/{name}.ts` |
| Curated criteria bundles for the resolver | `helpers/presets/{event,addon,...}.ts` |
| Cross-spec DB probes | `helpers/db-client.ts` |

Inside a `test(id, ...)` body the only things that belong inline are:
- `test.setTimeout(...)` at the top when overriding the 60s default
- `test.skip(...)` guards for theme/tenant divergence
- Local aliases (`const auth = customer.pages.auth`)
- Resolver calls to pick fixtures (`await resolver.event(events.normal)`)
- Actor / page-object / factory invocations to drive the flow
- `expect(...)` assertions
- A closing `feedback(...)` line

Everything else — helper functions, shared setup, ad-hoc selectors, `page.evaluate` blocks, custom waits, DOM parsing — is a smell. If you catch yourself writing a private helper at the top of a spec, extract it to the right layer instead. If two specs need it, that's twice as much reason.

The one narrow exception is the **`validBase()` payload factory** each negative-validation spec defines locally — it's a per-spec vocabulary for "a fully valid submission" that gets partially overridden per test. Keeps the "valid minus one" pattern legible in one file.

## Rules to write down

- **Every test lives in `specs/registry.json`.** The wrapper enforces this at import time.
- **IDs are permanent.** Renaming a test's title in the registry is free; changing its id breaks external references.
- **Test files under `specs/vitality/` produce `@vitality`-tagged tests.** The wrapper does this automatically today. When we add other categories, we'll grow the wrapper to reflect folder structure.
- **Verify both sides.** Frontend assertions catch UI regressions; DB assertions catch state corruption. Together they catch both.
- **Clean up in `finally`.** Any test that creates a user / order / row cleans it up unconditionally.
- **Own your timeout.** Tests that hit gateway sandboxes call `test.setTimeout(...)` explicitly at the top.
- **No logic in spec files.** Selectors → page objects. Orchestration → actors. Fixtures → factories. Presets → `helpers/presets/`. Specs stay declarative.
