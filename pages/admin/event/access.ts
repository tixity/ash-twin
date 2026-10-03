import type { Page, Locator } from '@playwright/test';

export class AdminEventAccess {
  readonly tab:   Locator;
  readonly panel: Locator;

  constructor(private page: Page) {
    this.tab   = page.locator('a[href="#event_links"]');
    this.panel = page.locator('#event_links');
  }

  async exists(): Promise<boolean> {
    return (await this.tab.count()) > 0;
  }

  async openTab(): Promise<void> {
    await this.tab.click();
    await this.panel.waitFor({ state: 'visible', timeout: 5_000 });
  }

  // Access editor interactions go here as features need them:
  // linkPosUser, linkControlAdmin, linkAdminGroup, revoke, etc.
}
