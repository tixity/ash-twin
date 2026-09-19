import { test as base, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { TenantConfig } from '../types/tenant';
import type { Observer } from './observer';
import { AdminLoginPage } from '../pages/admin/admin-login-page';

function hostOf(url: string): string {
  return new URL(url).hostname;
}

async function suppressCookieBanner(ctx: BrowserContext, tenant: TenantConfig): Promise<void> {
  const expires = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
  await ctx.addCookies([
    { name: 'cookieconsent_status', value: 'dismiss', domain: hostOf(tenant.webUrl),  path: '/', expires },
    { name: 'cookieconsent_status', value: 'dismiss', domain: hostOf(tenant.baseUrl), path: '/', expires },
  ]);
}

interface OpenTabOpts {
  baseURL: string;
  setup?:  (page: Page, ctx: BrowserContext) => Promise<void>;
}

/**
 * Central tab lifecycle: context + page + banner suppression + observer wiring
 * + cookie capture + close. Per-role fixtures only declare `baseURL` and any
 * role-specific setup (auth, route hooks). New touchpoints (POS, dashboard,
 * scanning) plug in as a 5-line fixture — no risk of forgetting the observer
 * or the cookie snapshot dance.
 */
async function openTab(
  browser:  Browser,
  tenant:   TenantConfig,
  observer: Observer,
  opts:     OpenTabOpts,
  use:      (page: Page) => Promise<void>,
): Promise<void> {
  const ctx = await browser.newContext({ baseURL: opts.baseURL, ignoreHTTPSErrors: true });
  await suppressCookieBanner(ctx, tenant);
  const page = await ctx.newPage();
  observer.attach(page, ctx);
  await opts.setup?.(page, ctx);
  try {
    await use(page);
  } finally {
    await observer.captureContext(ctx);
    await ctx.close();
  }
}

async function injectSkipCaptchaOnCustomerPosts(page: Page, tenant: TenantConfig): Promise<void> {
  const tenantHost = hostOf(tenant.webUrl);
  await page.route('**/*', async (route, request) => {
    if (request.method() !== 'POST') return route.continue();

    let host: string;
    try { host = new URL(request.url()).hostname; }
    catch { return route.continue(); }
    if (host !== tenantHost) return route.continue();

    const contentType = request.headers()['content-type'] ?? '';
    if (!contentType.startsWith('application/x-www-form-urlencoded')) return route.continue();

    const body = request.postData() ?? '';
    if (/(?:^|&)skipCaptcha=/.test(body)) return route.continue();
    const newBody = body.length ? `${body}&skipCaptcha=1` : 'skipCaptcha=1';
    await route.continue({ postData: newBody });
  });
}

export const browserFixtures = base.extend<{
  adminPage:    Page;
  customerPage: Page;
  observer:     Observer;
}, { tenant: TenantConfig }>({
  adminPage: async ({ browser, tenant, observer }, use) => {
    await openTab(browser, tenant, observer, {
      baseURL: tenant.baseUrl,
      setup: async (page) => {
        const login = new AdminLoginPage(page);
        await login.open();
        await login.login(tenant.users.superadmin.username, tenant.users.superadmin.password);
        const err = await login.errorText();
        if (err) throw new Error(`admin login failed: ${err}`);
      },
    }, use);
  },

  customerPage: async ({ browser, tenant, observer }, use) => {
    await openTab(browser, tenant, observer, {
      baseURL: tenant.webUrl,
      setup: async (page) => {
        await injectSkipCaptchaOnCustomerPosts(page, tenant);
      },
    }, use);
  },
});
