import { test as base, type Page, type BrowserContext, type ConsoleMessage, type Cookie } from '@playwright/test';
import type { TenantConfig } from '../types/tenant';
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

interface Violation {
  kind:    string;
  summary: string;
  url?:    string;
  raw?:    string;
}

export class Observer {
  private violations: Violation[] = [];
  private seen = new Set<string>();
  private disabled   = new Set<Kind>();
  private extraWatch: Partial<ObserverConfig> = {};
  private suppressed: Partial<ObserverConfig> = {};
  private contexts   = new Set<BrowserContext>();
  private pages      = new Set<Page>();
  private cookieCache      = new Map<BrowserContext, Cookie[]>();
  private cookieSnapshots  = new Map<string, CookieSnapshot>();
  private storageSnapshots = new Map<string, StorageSnapshot>();

  // primaryHost is the tenant's own host name
  constructor(private config: ObserverConfig, private primaryHost?: string) {}

  attach(page: Page, context: BrowserContext): void {
    if (this.pages.has(page)) return;
    this.pages.add(page);
    this.contexts.add(context);

    page.on('console',       (msg) => this.onConsole(msg, page));
    page.on('pageerror',     (err) => this.onPageError(err, page));
    page.on('request',       (req) => this.onRequest(req.url()));
    page.on('response',      (res) => this.onResponse(res.url(), res.status(), res.request().resourceType(), res.headers()));
    page.on('requestfailed', (req) => {
      if (this.disabled.has('network')) return;
      if (!this.isPrimaryHost(req.url())) return;
      const f = req.failure();
      if (f && !this.isIgnored('network', req.url())) {
        this.add({
          kind:    'network-failed',
          summary: `Network request failed: ${f.errorText}`,
          url:     req.url(),
        });
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
    if (this.violations.length === 0) return;

    const lines: string[] = [];
    lines.push(`Observer caught ${this.violations.length} issue(s) during this test:`);
    lines.push('');
    this.violations.forEach((v, i) => {
      lines.push(`  ${i + 1}. ${v.summary}`);
      if (v.url) lines.push(`     where:  ${v.url}`);
      if (v.raw) lines.push(`     raw:    ${truncate(v.raw, 240)}`);
      lines.push('');
    });
    throw new Error(lines.join('\n'));
  }

  private add(v: Violation): void {
    const key = `${v.kind}|${v.summary}|${v.url ?? ''}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.violations.push(v);
  }

  private isPrimaryHost(url: string): boolean {
    if (!this.primaryHost) return true;
    try { return new URL(url).hostname === this.primaryHost; }
    catch { return false; }
  }

  private onConsole(msg: ConsoleMessage, page: Page): void {
    if (this.disabled.has('console')) return;
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const text = msg.text();
    if (this.isIgnored('console', text)) return;
    const failOn = merge(this.config.console.failOn, this.extraWatch.console?.failOn);
    if (!matches(failOn, text)) return;
    this.add({
      kind:    'console',
      summary: summarizeConsole(text),
      url:     page.url(),
      raw:     text,
    });
  }

  private onPageError(err: Error, page: Page): void {
    if (this.disabled.has('pageerror')) return;
    this.add({
      kind:    'pageerror',
      summary: `Uncaught JavaScript error: ${err.message.split('\n')[0]}`,
      url:     page.url(),
      raw:     err.message,
    });
  }

  private onRequest(url: string): void {
    if (this.disabled.has('network')) return;
    const banned = merge(this.config.network.banned, this.extraWatch.network?.banned);
    if (matches(banned, url)) {
      this.add({
        kind:    'banned-asset',
        summary: `Banned asset was requested (should have been removed from the codebase)`,
        url,
      });
    }
  }

  private onResponse(url: string, status: number, resourceType: string, headers: Record<string, string>): void {
    if (this.disabled.has('network')) return;
    if (!this.isPrimaryHost(url)) return;
    if (this.isIgnored('network', url)) return;

    if (this.config.network.failOnScript4xx5xx
        && (resourceType === 'script' || resourceType === 'stylesheet')
        && status >= 400) {
      this.add({
        kind:    'asset-error',
        summary: `A ${resourceType} returned HTTP ${status} — likely a stale asset reference`,
        url,
      });
    }
    if (resourceType === 'document') {
      const rules = [...this.config.network.requiredHeaders, ...(this.extraWatch.network?.requiredHeaders ?? [])];
      for (const rule of rules) {
        const key = Object.keys(headers).find(h => rule.name.test(h));
        const value = key ? headers[key] : undefined;
        if (!value || !rule.value.test(value)) {
          this.add({
            kind:    'missing-header',
            summary: `Response is missing the ${describeHeader(rule.name)} header (got ${value ?? '<none>'})`,
            url,
          });
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
    const mustBeSameSite = [...this.config.cookies.mustBeSameSite, ...(this.extraWatch.cookies?.mustBeSameSite ?? [])];
    const ignore         = merge(this.config.cookies.ignore,         this.suppressed.cookies?.ignore);

    for (const c of seen.values()) {
      if (matches(ignore, c.name)) continue;
      if (matches(banned, c.name)) {
        this.add({
          kind:    'banned-cookie',
          summary: `Banned cookie "${c.name}" is still set on ${c.domain}`,
        });
      }
      if (matches(mustBeSecure, c.name) && !c.secure) {
        this.add({
          kind:    'insecure-cookie',
          summary: `Cookie "${c.name}" on ${c.domain} is missing the Secure flag`,
        });
      }
      if (matches(mustBeHttpOnly, c.name) && !c.httpOnly) {
        this.add({
          kind:    'readable-cookie',
          summary: `Cookie "${c.name}" on ${c.domain} is missing the HttpOnly flag (JavaScript can read it)`,
        });
      }
      for (const rule of mustBeSameSite) {
        if (rule.name.test(c.name) && c.sameSite !== rule.value) {
          this.add({
            kind:    'wrong-samesite',
            summary: `Cookie "${c.name}" on ${c.domain} has SameSite=${c.sameSite ?? '<none>'}, expected ${rule.value}`,
          });
        }
      }
    }
  }
}

async function safeCookies(ctx: BrowserContext): Promise<Cookie[]> {
  try { return await ctx.cookies(); } catch { return []; }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function describeHeader(pattern: RegExp): string {
  const src = pattern.source.toLowerCase();
  if (src.includes('content-security-policy')) return 'Content-Security-Policy';
  if (src.includes('strict-transport-security')) return 'Strict-Transport-Security (HSTS)';
  if (src.includes('x-frame-options')) return 'X-Frame-Options';
  return pattern.source.replace(/[\^$]/g, '');
}

function summarizeConsole(text: string): string {
  if (/content security policy/i.test(text) && /style-src/i.test(text)) {
    return `Content Security Policy blocked an inline style — some code wrote element.style.X or injected <style> without a nonce`;
  }
  if (/content security policy/i.test(text) && /script-src/i.test(text)) {
    return `Content Security Policy blocked an inline script — some code injected <script> or used eval without a nonce`;
  }
  if (/content security policy/i.test(text)) {
    return `Content Security Policy blocked something on this page — see raw for the directive and resource`;
  }
  if (/is not defined/i.test(text)) {
    const m = /(\w+) is not defined/i.exec(text);
    return `JavaScript variable "${m?.[1] ?? '<unknown>'}" is not defined — a script probably failed to load`;
  }
  if (/plugin prefix is missing/i.test(text)) {
    return `SquareMaze "Plugin prefix is missing" error leaked to the UI — a Plugin::call() invocation has a bad event name`;
  }
  if (/^uncaught\b/i.test(text)) {
    return `Uncaught JavaScript error on this page — see raw for details`;
  }
  return text.slice(0, 160);
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
      mustBeSameSite: [...(a.cookies?.mustBeSameSite ?? []), ...(b.cookies?.mustBeSameSite ?? [])],
      ignore:         merge(a.cookies?.ignore ?? [],         b.cookies?.ignore),
    },
  };
}

export const observerFixtures = base.extend<{ observer: Observer }, { tenant: TenantConfig }>({
  observer: async ({ tenant }, use, testInfo) => {
    const primaryHost = new URL(tenant.webUrl).hostname;
    const obs = new Observer(observerConfig, primaryHost);
    await use(obs);
    try {
      await obs.assert();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      testInfo.annotations.push({ type: 'feedback', description: `✗ observer:\n  ${msg.replace(/\n/g, '\n  ')}` });
      throw err;
    }
  },
});
