import { test as base, type Page, type BrowserContext, type ConsoleMessage, type Cookie } from '@playwright/test';
import { observerConfig, type ObserverConfig } from '../config/observer';

type Kind = 'console' | 'network' | 'pageerror' | 'cookies';

interface CookieSnapshot {
  label:   string;
  cookies: Cookie[];
}

interface StorageSnapshot {
  label:   string;
  local:   Record<string, string>;
  session: Record<string, string>;
}

function matches(patterns: RegExp[], text: string): boolean {
  return patterns.some(rx => rx.test(text));
}

function merge(a: RegExp[], b: RegExp[] | undefined): RegExp[] {
  return b?.length ? [...a, ...b] : a;
}

export class Observer {
  private violations = new Set<string>();
  private disabled   = new Set<Kind>();
  private extraWatch: Partial<ObserverConfig> = {};
  private suppressed: Partial<ObserverConfig> = {};
  private contexts   = new Set<BrowserContext>();
  private pages      = new Set<Page>();
  private cookieCache      = new Map<BrowserContext, Cookie[]>();
  private cookieSnapshots  = new Map<string, CookieSnapshot>();
  private storageSnapshots = new Map<string, StorageSnapshot>();

  constructor(private config: ObserverConfig) {}

  attach(page: Page, context: BrowserContext): void {
    if (this.pages.has(page)) return;
    this.pages.add(page);
    this.contexts.add(context);

    page.on('console',       (msg) => this.onConsole(msg));
    page.on('pageerror',     (err) => this.onPageError(err));
    page.on('request',       (req) => this.onRequest(req.url()));
    page.on('response',      (res) => this.onResponse(res.url(), res.status(), res.request().resourceType(), res.headers()));
    page.on('requestfailed', (req) => {
      if (this.disabled.has('network')) return;
      const f = req.failure();
      if (f && !this.isIgnored('network', req.url())) {
        this.violations.add(`requestfailed: ${req.url()} — ${f.errorText}`);
      }
    });
  }

  suppress(rules: Partial<ObserverConfig>): void {
    this.suppressed = mergeRules(this.suppressed, rules);
  }

  watch(rules: Partial<ObserverConfig>): void {
    this.extraWatch = mergeRules(this.extraWatch, rules);
  }

  disable(kind: Kind): void {
    this.disabled.add(kind);
  }

  async snapshotCookies(label: string): Promise<void> {
    const cookies: Cookie[] = [];
    for (const ctx of this.contexts) cookies.push(...await ctx.cookies());
    this.cookieSnapshots.set(label, { label, cookies });
  }

  async captureContext(context: BrowserContext): Promise<void> {
    if (!this.contexts.has(context)) return;
    this.cookieCache.set(context, await context.cookies());
  }

  async snapshotStorage(label: string, page?: Page): Promise<void> {
    const target = page ?? [...this.pages].at(-1);
    if (!target) return;
    const snap = await target.evaluate(() => ({
      local:   Object.fromEntries(Object.entries(localStorage)),
      session: Object.fromEntries(Object.entries(sessionStorage)),
    }));
    this.storageSnapshots.set(label, { label, ...snap });
  }

  cookieSnapshot(label: string): CookieSnapshot | undefined {
    return this.cookieSnapshots.get(label);
  }

  storageSnapshot(label: string): StorageSnapshot | undefined {
    return this.storageSnapshots.get(label);
  }

  async assert(): Promise<void> {
    if (this.pages.size === 0) return;
    if (!this.disabled.has('cookies')) await this.checkCookies();
    if (this.violations.size === 0) return;
    throw new Error('observer caught violations:\n  - ' + [...this.violations].join('\n  - '));
  }

  private onConsole(msg: ConsoleMessage): void {
    if (this.disabled.has('console')) return;
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const text = msg.text();
    if (this.isIgnored('console', text)) return;
    const failOn = merge(this.config.console.failOn, this.extraWatch.console?.failOn);
    if (matches(failOn, text)) this.violations.add(`console.${msg.type()}: ${text}`);
  }

  private onPageError(err: Error): void {
    if (this.disabled.has('pageerror')) return;
    this.violations.add(`pageerror: ${err.message}`);
  }

  private onRequest(url: string): void {
    if (this.disabled.has('network')) return;
    const banned = merge(this.config.network.banned, this.extraWatch.network?.banned);
    if (matches(banned, url)) this.violations.add(`banned asset requested: ${url}`);
  }

  private onResponse(url: string, status: number, resourceType: string, headers: Record<string, string>): void {
    if (this.disabled.has('network')) return;
    if (this.config.network.failOnScript4xx5xx
        && (resourceType === 'script' || resourceType === 'stylesheet')
        && status >= 400
        && !this.isIgnored('network', url)) {
      this.violations.add(`${status} on ${resourceType}: ${url}`);
    }
    if (resourceType === 'document' && !this.isIgnored('network', url)) {
      const rules = [...this.config.network.requiredHeaders, ...(this.extraWatch.network?.requiredHeaders ?? [])];
      for (const rule of rules) {
        const key = Object.keys(headers).find(h => rule.name.test(h));
        const value = key ? headers[key] : undefined;
        if (!value || !rule.value.test(value)) {
          this.violations.add(`missing/invalid header ${rule.name} on ${url}: got ${value ?? '<none>'}`);
        }
      }
    }
  }

  private isIgnored(kind: 'console' | 'network', text: string): boolean {
    const base   = kind === 'console' ? this.config.console.ignore : this.config.network.ignore;
    const extra  = kind === 'console' ? this.suppressed.console?.ignore : this.suppressed.network?.ignore;
    return matches(merge(base, extra), text);
  }

  private async checkCookies(): Promise<void> {
    const seen = new Map<string, Cookie>();
    for (const ctx of this.contexts) {
      const cookies = this.cookieCache.get(ctx) ?? await safeCookies(ctx);
      for (const c of cookies) {
        seen.set(`${c.domain}${c.path}${c.name}`, c);
      }
    }
    const banned         = merge(this.config.cookies.banned,         this.extraWatch.cookies?.banned);
    const mustBeSecure   = merge(this.config.cookies.mustBeSecure,   this.extraWatch.cookies?.mustBeSecure);
    const mustBeHttpOnly = merge(this.config.cookies.mustBeHttpOnly, this.extraWatch.cookies?.mustBeHttpOnly);
    const ignore         = merge(this.config.cookies.ignore,         this.suppressed.cookies?.ignore);

    for (const c of seen.values()) {
      if (matches(ignore, c.name))                            continue;
      if (matches(banned, c.name))                            this.violations.add(`banned cookie: ${c.name} on ${c.domain}`);
      if (matches(mustBeSecure, c.name)   && !c.secure)       this.violations.add(`insecure cookie: ${c.name} on ${c.domain}`);
      if (matches(mustBeHttpOnly, c.name) && !c.httpOnly)     this.violations.add(`non-httpOnly cookie: ${c.name} on ${c.domain}`);
    }
  }
}

async function safeCookies(ctx: BrowserContext): Promise<Cookie[]> {
  try { return await ctx.cookies(); } catch { return []; }
}

function mergeRules(a: Partial<ObserverConfig>, b: Partial<ObserverConfig>): Partial<ObserverConfig> {
  return {
    console: {
      failOn: merge(a.console?.failOn ?? [], b.console?.failOn),
      ignore: merge(a.console?.ignore ?? [], b.console?.ignore),
    },
    network: {
      banned:             merge(a.network?.banned ?? [], b.network?.banned),
      failOnScript4xx5xx: b.network?.failOnScript4xx5xx ?? a.network?.failOnScript4xx5xx ?? false,
      requiredHeaders:    [...(a.network?.requiredHeaders ?? []), ...(b.network?.requiredHeaders ?? [])],
      ignore:             merge(a.network?.ignore ?? [], b.network?.ignore),
    },
    cookies: {
      banned:         merge(a.cookies?.banned ?? [],         b.cookies?.banned),
      mustBeSecure:   merge(a.cookies?.mustBeSecure ?? [],   b.cookies?.mustBeSecure),
      mustBeHttpOnly: merge(a.cookies?.mustBeHttpOnly ?? [], b.cookies?.mustBeHttpOnly),
      ignore:         merge(a.cookies?.ignore ?? [],         b.cookies?.ignore),
    },
  };
}

export const observerFixtures = base.extend<{ observer: Observer }>({
  observer: async ({}, use) => {
    const obs = new Observer(observerConfig);
    await use(obs);
    await obs.assert();
  },
});
