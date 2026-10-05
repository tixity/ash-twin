# CLAUDE.md

Guidance for Claude Code working in this repository.

## Project Identity

ash-twin is tixity's automated regression testing platform for SquareMaze. Playwright + TypeScript. Runs the same functional flows every cycle against every tenant, detects deviation, replaces manual QA.

## Onboarding, read before doing work

1. **SUT context first.** Read `/Users/ryan/Developer/squaremaze/CLAUDE.md` and `/Users/ryan/Developer/squaremaze/docs/INDEX.md`. Dip into `architecture/overview.md`, `development/plugin-system.md`, and the relevant `integrations/*.md` when the task touches those areas.
2. **Framework docs here.** Read `docs/README.md`, then walk `docs/01-architecture.md` through `docs/10-payments.md` in order. One concern per file.
3. **Registry.** Skim `specs/registry.json` to see existing test IDs before proposing new ones.

## Stack

Playwright 1.49, TypeScript 5.7, Node 22, mysql2, dotenv. No lint or formatter configs, do not add any.

## Layout

```
actors/     business orchestrators (WebCustomer, Admin)
pages/      page objects, one class per page. base + per-theme overrides under pages/web/{theme}/
payments/   one PaymentStrategy per gateway (cybersource_unified, tabby, ...)
fixtures/   Playwright dependency injection (tenant, db, auth, actors)
helpers/    Resolver, DbClient, test wrapper, tenant helpers, event presets
sites/      per-tenant JSON config as {tenant}.{env}.json
types/      shared TypeScript contracts
specs/      the actual tests, plus registry.json
docs/       framework documentation
```

Active tenants: `cca` (default theme), `adrea`, `blublood`, `theagenda` (capetown theme), `antoine`, `virgin` (next theme, headless external apps on the public API).

## Commands

```bash
npm install
npx playwright install chromium
cp .env.example .env                              # per-tenant credentials

npx playwright test --project=cca-staging         # one tenant/env
npx playwright test --grep @vitality              # by category
npx playwright test --grep "^ID: 11 "             # by registry id (trailing space matters)
npx playwright test --ui                          # interactive
npm run test:headed                               # headed browser
```

## Hard rules

- **Every test lives in `specs/registry.json`.** The `test(id, category, fn)` wrapper throws at import if the id is missing. Reserve next unused id, add title, then write the spec.
- **IDs are permanent.** Never renumber. Deleting leaves a gap, that is fine.
- **Category on every test.** `test(id, 'vitality', fn)`. Folder equals category convention (`specs/vitality/` uses `'vitality'`).
- **Verify DB and DOM.** Frontend can lie about actual state. Signup and purchase tests check both sides.
- **Clean up in `finally`.** Any test that creates a user, order, or row cleans it up unconditionally.
- **Own your timeout.** Global per-test is 60s. Gateway sandbox tests call `test.setTimeout(120_000)` (or `180_000` for Tabby) at the top.
- **No branching on tenant in actors or specs.** Tenant differences live in `pages/web/{theme}/` behind the factory in `pages/web/factory.ts`. Actors and specs stay theme-agnostic.
- **No logic in spec files.** A spec file hosts `test(id, ...)` bodies and nothing else. Selectors, DOM interaction, waits, and gesture sequences belong in page objects. Business orchestration (login-then-purchase, add-addon-then-checkout) belongs in actors. Fixture seeding belongs in `factories/`. Criteria bundles belong in `helpers/presets/`. If a spec needs a helper, extract it to the right layer — do not define it inline. The only inline code a spec should contain is: a `validBase()` payload for negative-validation tests, `expect(...)` assertions, and a `feedback(...)` line.
- **Payment keys are strings, not numeric handling IDs.** Use `data-payment-type` (e.g. `'cybersource_unified'`, `'tabby'`). Numeric IDs change per tenant and re-seed.
- **One strategy per gateway.** Add `payments/{name}.ts`, register in `payments/index.ts`, colocate its `cards` map. Loud failure on unknown key.
- **Selectors inside gateway iframes use role + accessible name.** Class names shift across SDK versions, ARIA does not. `getByRole('textbox', { name: /card number/i })`.
- **SquareMaze DB conventions.** Singular tables, `{table}_{field}` prefixed columns, short-form enums (`'pub'` not `'published'`). Full rules in `docs/08-squaremaze-conventions.md`.
- **`configuration` writes need cache invalidation.** Set `disable_config_cache=1` and call `admin.clearCache()` in `beforeAll` when any test flips config via `db.overrideConfig`.
- **Playwright URLs.** Open exactly as given by the user, do not "fix" them.
- **Snake_case for files and folders.** `event_form.ts`, `pos_registration.spec.ts`, `discount_validity/`. Never kebab-case. Product names in prose (`ash-twin`, `squaremaze-twin`) are allowed in text bodies; file paths are not.
- **Git writes ask first.** Never commit, stage, or push without explicit confirmation.

## Themes

| Theme | Tenants | Pages bundle | testMatch |
|---|---|---|---|
| `default` | cca | `pages/web/default/` | `vitality/native/**` + `vitality/default/**` |
| `capetown` | adrea, blublood, theagenda | `pages/web/capetown/` | `vitality/native/**` + `vitality/capetown/**` |
| `next` | antoine, virgin | (external Next.js) | `vitality/{tenant}/**` |

Specs in `specs/vitality/native/` run against every Smarty theme. Theme-only quirks (capetown's config-gated DOB, default's always-required DOB) live under `specs/vitality/{theme}/`.

## Verification

- **Type check** with `npx tsc --noEmit` before claiming a change compiles.
- **UI reality check** for any change to page objects, actors, or strategies. Run the affected spec against a real tenant, headed if debugging: `npx playwright test --project=cca-staging --grep "^ID: 15 " --headed`.
- **Never claim a UI change works without running the spec.** Type-check green is not enough.

## Where truth lives

- Framework behavior: `docs/` in this repo.
- SUT DOM, DB schema, plugin behavior: source in `/Users/ryan/Developer/squaremaze/`. The rendered `.tpl` and the model files are authoritative, not documentation.
- When docs and code disagree, code wins. Update the doc in the same change.

## Adding a new test (quick recipe)

1. Reserve next id in `specs/registry.json`, add title.
2. Pick the folder by scope: `specs/vitality/native/` (all Smarty themes), `specs/vitality/{theme}/` (theme-only).
3. Write `test(id, 'vitality', async ({ customer, ... }) => { ... })`.
4. Verify both DB and DOM. Clean up in `finally`. Raise timeout if it hits a gateway.

## Adding a new payment gateway

1. Read `includes/plugins/eph_{name}.php` on the SquareMaze side to understand the DOM contract and post-submit flow.
2. Create `payments/{name}.ts` exporting the strategy and a `cards` map.
3. Register in `payments/index.ts`.
4. Write one spec against a tenant that has the handling enabled.

Full detail in `docs/10-payments.md`.

## MCP and tooling

- **Playwright MCP** for browser inspection during selector work.
- **Context7** for library docs (Playwright, mysql2, gateway SDKs) before web search.
