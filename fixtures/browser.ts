import { test as base, type BrowserContext, type Page } from '@playwright/test';
import type { TenantConfig } from '../types/tenant';
import type { Observer } from './observer';
import { AdminLoginPage } from '../pages/admin/admin-login-page';

/** Extract hostname from a URL for cookie domain assignment. */
function hostOf(url: string): string {
  return new URL(url).hostname;
}

/**
 * Suppress the cookieconsent banner on the given context by pre-setting its
 * dismissal cookie. Safe to call even for tenants without the banner —
 * unused cookies are harmless.
 */
async function suppressCookieBanner(ctx: BrowserContext, tenant: TenantConfig): Promise<void> {
  await ctx.addCookies([
    {
      name:   'cookieconsent_status',
      value:  'dismiss',
      domain: hostOf(tenant.webUrl),
      path:   '/',
      expires: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    },
    {
      name:   'cookieconsent_status',
      value:  'dismiss',
      domain: hostOf(tenant.baseUrl),
      path:   '/',
      expires: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    },
  ]);
}

/**
 * Provides role-scoped browser tabs. Each tab is a fresh Playwright context
 * (isolated cookies/storage) with the right baseURL. The admin tab is
 * pre-logged-in; the customer tab is anonymous by default (login happens via
 * the customer actor when a spec needs it).
 */
export const browserFixtures = base.extend<{
  adminPage:    Page;
  customerPage: Page;
  observer:     Observer;
}, { tenant: TenantConfig }>({
  adminPage: async ({ browser, tenant, observer }, use) => {
    const ctx = await browser.newContext({ baseURL: tenant.baseUrl, ignoreHTTPSErrors: true });
    await suppressCookieBanner(ctx, tenant);
    const page = await ctx.newPage();
    observer.attach(page, ctx);
    const login = new AdminLoginPage(page);
    await login.open();
    await login.login(tenant.users.superadmin.username, tenant.users.superadmin.password);
    const err = await login.errorText();
    if (err) throw new Error(`admin login failed: ${err}`);
    await use(page);
    await observer.captureContext(ctx);
    await ctx.close();
  },

  customerPage: async ({ browser, tenant, observer }, use) => {
    const ctx = await browser.newContext({ baseURL: tenant.webUrl, ignoreHTTPSErrors: true });
    await suppressCookieBanner(ctx, tenant);
    const page = await ctx.newPage();
    observer.attach(page, ctx);
    await injectSkipCaptchaOnCustomerPosts(page, tenant);
    await use(page);
    await observer.captureContext(ctx);
    await ctx.close();
  },
});

/**
 * Append `skipCaptcha=1` to every form-encoded POST body that goes to the
 * tenant's web host.
 */
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
    if (/(?:^|&)skipCaptcha=/.test(body)) return route.continue();   // already present
    const newBody = body.length ? `${body}&skipCaptcha=1` : 'skipCaptcha=1';
    await route.continue({ postData: newBody });
  });
}
