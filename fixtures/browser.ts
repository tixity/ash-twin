import { test as base, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { TenantConfig } from '../types/tenant';
import type { Observer } from './observer';
import { AdminLoginPage } from '../pages/admin/admin-login-page';

interface OpenTabOpts {
  baseURL: string;
  setup?:  (page: Page, ctx: BrowserContext) => Promise<void>;
}

function hostOf(url: string): string {
  return new URL(url).hostname;
}

function oneYearFromNow(): number {
  return Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
}

async function suppressCookieBanner(ctx: BrowserContext, tenant: TenantConfig): Promise<void> {
  await ctx.addCookies([
    { name: 'cookieconsent_status', value: 'dismiss', domain: hostOf(tenant.webUrl), path: '/', expires: oneYearFromNow() },
  ]);
}

async function preseedSkipCaptcha(ctx: BrowserContext, tenant: TenantConfig): Promise<void> {
  await ctx.addCookies([
    { name: 'skipCaptcha', value: '1', domain: hostOf(tenant.webUrl), path: '/', expires: oneYearFromNow() },
  ]);
}

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
    await ctx.close();
  }
}

export const browserFixtures = base.extend<{
  adminPage:    Page;
  customerPage: Page;
}, {
  tenant:   TenantConfig;
  observer: Observer;
}>({

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
    }, use); // passing use reference to be resolved by openTab
  },

  customerPage: async ({ browser, tenant, observer }, use) => {
    await openTab(browser, tenant, observer, {
      baseURL: tenant.webUrl,
      setup: async (_page, ctx) => {
        await preseedSkipCaptcha(ctx, tenant);
      },
    }, use); // passing use reference to be resolved by openTab
  },
});
