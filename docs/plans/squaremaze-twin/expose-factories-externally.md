# squaremaze-twin

A thin, external-facing surface over ash-twin's factories so that tenants, QA engineers, and other services can build and tear down SquareMaze data on demand — not just during Playwright runs.

## Why

The factories (`factories/`) already know how to compose a valid SquareMaze event + categories + (future) addons + discounts, write them to a tenant DB under the `ash-twin*` namespace, and leave them available for the cleanup script to reclaim. Today the only caller is the resolver's auto-fallback inside a running spec. That's a lot of capability trapped behind a Playwright entry point.

squaremaze-twin opens that surface up:

- A dev debugging an admin page in staging can seed a specific shape of event in one command instead of hand-clicking the admin form.
- A QA engineer running an exploratory session can pre-populate the tenant with a known set of events, run their session, then wipe the ash-twin rows.
- A CI job unrelated to ash-twin (e.g. a release-smoke script) can call the API to produce seed data for its own checks.
- A future internal tool with a UI can POST to it and get back an event id to open in the admin.

## Scope

squaremaze-twin is a wrapper, not a rewrite. The factory classes stay the single source of truth for how a row is built, what defaults apply, and what inputs are refused. squaremaze-twin only adds:

1. A way to invoke the factories without a Playwright test context.
2. A way to specify which tenant/env to target from outside the project metadata system.
3. A way to serialize the input (JSON over the wire, flags on a CLI) and the output (ids + metadata of what was built).

## Shape (to be decided when we start)

Likely a thin CLI first (`scripts/squaremaze-twin.ts`) that reuses `sites/<name>.<env>.ts` for DB creds and the existing factory classes for logic. If a GUI or cross-service need shows up, promote the same core to an Express or Hono endpoint. Both front-ends call the same factory objects.

## What must stay honest

- Same `ash-twin*` naming convention. Nothing created by squaremaze-twin should escape the cleanup script's filter.
- Same refusal rules (seated, sub, hasAddons, hasHandling) — v1 limits apply equally to CLI and spec callers. No special-casing.
- Same determinism — the output of a squaremaze-twin invocation is a built row with a known id and a known shape. No hidden state.
- Same tenant-config loading. Credentials come from `.env` through `sites/<name>.<env>.ts`, never baked into squaremaze-twin itself.

## Non-goals

- Not a UI. squaremaze-twin is an operational surface, not an admin replacement.
- Not a scheduler. If seed data needs to exist on a schedule, a separate cron calls squaremaze-twin.
- Not a replacement for `./maze seed`. SquareMaze's own seeding builds curated baseline data; squaremaze-twin builds throwaway test data on top of it.

## When

After the factories have at least one spec consuming them in anger. The spec usage validates the factory API shape; squaremaze-twin inherits whatever shape proved ergonomic. Building the external surface before the internal one has consumers risks locking in an awkward API.
