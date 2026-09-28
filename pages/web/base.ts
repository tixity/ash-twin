import type { Locator, Page } from '@playwright/test';

//  Shared wait budgets for page-object waits.
export const WAIT = {
  QUICK:  1_500,
  MEDIUM: 10_000,
  LONG:   30_000,
} as const;

/**
 * Chassis for every web page object.
 * Holds the raw Playwright Page reference and shared utilities every concrete
 * page needs (wait strategies, URL assertions, error detection).
 */

export abstract class BasePage {
  constructor(protected page: Page) {}

  //  Default wait for server-rendered pages — DOM ready is enough. Override for SPAs.
  protected async waitReady(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
  }

  //  Stronger wait for SPAs and pages with meaningful async content.
  protected async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  //  Throws if the current URL doesn't match the expected pattern.
  protected async assertUrl(pattern: RegExp): Promise<void> {
    const current = this.page.url();
    if (!pattern.test(current)) {
      throw new Error(`Expected URL matching ${pattern}, got ${current}`);
    }
  }

  protected async isVisibleSoon(locator: Locator, timeout: number = WAIT.MEDIUM): Promise<boolean> {
    try { await locator.waitFor({ state: 'visible', timeout }); return true; }
    catch { return false; }
  }
}
