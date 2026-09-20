# 11 — Observer

The observer is a cross-cutting fixture that listens on every browser context and fails the test at teardown if it caught anything forbidden. It runs on every test automatically — no opt-in, no boilerplate.

Think of it as an always-on regression net for **security, hygiene, and browser-side signals** that ordinary assertions don't cover: banned scripts loading, console errors, missing security headers, insecure cookies, forbidden requests.

## Where it lives

| File | Role |
|---|---|
| `fixtures/observer.ts` | The `Observer` class + the `observerFixtures` fixture that wires it into every test |
| `config/observer.ts` | The rules table — what to catch, what to ignore |

The observer is registered in `fixtures/index.ts` via `mergeTests`, so every test that imports `test` from `helpers/test.ts` inherits it.

## What it watches

Five channels, all wired in `attach(page, context)`:

| Channel | Signal | Config keys |
|---|---|---|
| `console` | `console.error` / `console.warning` messages | `console.failOn`, `console.ignore` |
| `pageerror` | uncaught JS exceptions | (always on unless disabled) |
| `network` (request) | banned URL patterns | `network.banned`, `network.ignore` |
| `network` (response) | script/stylesheet 4xx/5xx, required response headers | `network.failOnScript4xx5xx`, `network.requiredHeaders`, `network.ignore` |
| `cookies` | banned cookie names, Secure/HttpOnly/SameSite requirements | `cookies.banned`, `cookies.mustBeSecure`, `cookies.mustBeHttpOnly`, `cookies.mustBeSameSite`, `cookies.ignore` |

## Global rules (currently enforced across every test)

Everything in `config/observer.ts`. Add a pattern here and every test starts enforcing it on the next run — no code change.

Currently enforced globally:

- **`network.banned`** — `jquery1.8.3` must never be requested
- **`network.failOnScript4xx5xx`** — no 404/500 on JS or CSS
- **`network.requiredHeaders`** — every top-level document response must carry `Strict-Transport-Security: max-age=<n>` (HSTS, pentest item 10)
- **`console.failOn`** — `Uncaught` and `is not defined` messages fail the test
- **Ignore lists** — Google analytics/tag manager, gstatic, doubleclick, facebook, clarity, hotjar, recaptcha are skipped so third-party noise doesn't create false failures

## When violations fire

The observer buffers violations during the test — the test body keeps running as normal. At teardown, `observer.assert()` throws with a bulleted summary of everything caught. Playwright marks the test failed and preserves the trace/video/screenshot for inspection.

Example failure output:
```
observer caught violations:
  - banned asset requested: https://tenant.com/js/jquery1.8.3-min.js
  - missing/invalid header /^strict-transport-security$/i on https://tenant.com/: got <none>
  - console.error: Uncaught ReferenceError: $ is not defined
```

## Per-test API

Sometimes a specific test needs local overrides — either tightening rules for that flow or suppressing noise it knows about. All three are stored per-test and dropped at teardown:

### `observer.watch({...})` — add extra rules for this test only

```ts
test(42, 'security', async ({ customer, observer }) => {
  observer.watch({
    cookies: { mustBeSecure: [/^session$/], mustBeHttpOnly: [/^session$/] },
    console: { failOn: [/CSP violation/] },
  });
  // ...rest of the test
});
```

Rules merge into the global config for this test only.

### `observer.suppress({...})` — widen the ignore lists for this test

```ts
observer.suppress({
  console: { ignore: [/CyberSource fingerprint/] },
  network: { ignore: [/adyen\.com/] },
});
```

Use when a specific flow legitimately produces noise the global config doesn't need to know about (payment iframes, 3DS redirects, etc.).

### `observer.disable(kind)` — shut off a whole channel

```ts
observer.disable('cookies');      // keep console/network on, skip cookie assertions
observer.disable('pageerror');    // skip uncaught-exception check
```

Kinds: `'console' | 'network' | 'pageerror' | 'cookies'`. Use sparingly — silencing a channel means real violations in that area slip through.

### On-demand cookie/storage snapshots

For temporal assertions — "cookie X exists after login but is gone after logout":

```ts
await customer.login(creds);
await observer.snapshotCookies('after-login');

await customer.logout();
await observer.snapshotCookies('after-logout');

const login  = observer.cookieSnapshot('after-login')!;
const logout = observer.cookieSnapshot('after-logout')!;
expect(login.cookies.some(c => c.name === 'PHPSESSID')).toBe(true);
expect(logout.cookies.some(c => c.name === 'PHPSESSID')).toBe(false);
```

Same pattern for `snapshotStorage(label)` / `storageSnapshot(label)` — captures `localStorage` + `sessionStorage`.

## Adding a new global rule

1. Open `config/observer.ts`
2. Add a regex/entry to the appropriate list
3. Run any existing spec to smoke-test the rule is picked up

Examples:

```ts
// New banned asset
network.banned: [
  /jquery1\.8\.3/i,
  /old-tracker\.js/,          // ← new
]

// Cookie hardening — every "session" cookie must be Secure + HttpOnly
cookies.mustBeSecure:   [/^session/],
cookies.mustBeHttpOnly: [/^session/],

// New required response header
network.requiredHeaders: [
  { name: /^strict-transport-security$/i, value: /max-age=\d+/ },
  { name: /^content-security-policy$/i,   value: /./ },    // ← new
]
```

No code change to the observer class needed. Rules are pure data.

## Adding a new signal type

If a new pentest item needs a check we don't have (e.g. WebSocket frames, service worker registrations, response body content), add it to the `Observer` class:

1. Extend `ObserverConfig` with the new config shape
2. Add a private handler method (`onServiceWorker(...)`, etc.)
3. Wire it in `attach()` via the corresponding Playwright event
4. Update `mergeRules` so per-test `watch`/`suppress` supports it
5. If it can be silenced independently, add a new `Kind` string

Existing channels all follow this shape — use `onConsole`, `onRequest`, `onResponse` as templates.

## Why cookie assertions run at teardown

Cookies aren't a stream event — there's no `cookieset` event on `Page` or `BrowserContext`. So the observer snapshots cookies from the context at teardown and walks them against the rules.

Because context cleanup closes the context *before* the observer runs, `attach()` monkey-patches `ctx.close()` to snapshot cookies just before delegating to the real close. This is why the browser fixture doesn't need to remember to call anything — the observer handles it internally.

## When to disable the observer for a spec

Almost never. Preferred order:
1. Add the pattern to `network.ignore` / `console.ignore` if it's noise
2. Use `observer.suppress({...})` for one-off exceptions per test
3. `observer.disable(kind)` only if a whole class of check is genuinely irrelevant to what the test is doing

Silencing hides the exact signals the observer was built to catch. Any use of `disable` should be justified by a comment above it.

## Relation to Playwright's traces

The observer complements Playwright's built-in trace/video/screenshot capture — those show *what happened*, the observer flags *what shouldn't have*. When a test fails on an observer violation, the trace is preserved so you can see the state of the page at the moment things went wrong.
