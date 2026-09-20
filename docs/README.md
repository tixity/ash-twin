# Ash Twin — Documentation

Granular documentation of the framework. Each file covers one concern; read in order or dip into whichever piece you need.

## Reading order

1. [Architecture](./01-architecture.md) — the four layers and how they hand off
2. [Types](./02-types.md) — domain shapes (Event, Category, Order, selectors)
3. [Resolver](./03-resolver.md) — how tests pick entities to work with
4. [Page objects](./04-page-objects.md) — UI abstraction, base + tenant overrides
5. [Actors](./05-actors.md) — business orchestration on top of pages
6. [Fixtures](./06-fixtures.md) — how tests receive dependencies
7. [Tenant config](./07-tenant-config.md) — per-tenant JSON schema
8. [SquareMaze DB conventions](./08-squaremaze-conventions.md) — table/column naming rules (read before writing SQL)
9. [Writing tests](./09-writing-tests.md) — the registry, the `test(id, fn)` wrapper, and the folder-based tag convention
10. [Payments](./10-payments.md) — one strategy per gateway; how `payWith(paymentKey, card, opts)` works
11. [Observer](./11-observer.md) — cross-cutting fixture enforcing global browser-side rules (security headers, banned scripts, cookie hardening, console errors)

## Reference layout

```
ash-twin/
├── actors/           — business orchestrators (WebCustomer, Admin)
├── factories/        — direct-DB fixture builders (addons, etc.)
├── helpers/          — Resolver, DbClient, tenant helpers, test wrapper
│   └── presets/      — curated criteria bundles (events, addons)
├── pages/            — page objects (base + per-theme under pages/web/{theme}/)
├── payments/         — one strategy per gateway (cybersource_unified, ...)
├── fixtures/         — test dependency wiring
├── config/           — cross-cutting configuration (observer rules)
├── sites/            — per-tenant TS config ({tenant}.{env}.ts)
├── types/            — domain type definitions
├── specs/            — the actual tests
└── docs/             — you are here
```
