import type { Page, Locator } from '@playwright/test';

export class AdminEventPlacemap {
  readonly tab:   Locator;
  readonly panel: Locator;

  constructor(private page: Page) {
    this.tab   = page.locator('a[href="#event_placemap"]');
    this.panel = page.locator('#event_placemap');
  }

  async exists(): Promise<boolean> {
    return (await this.tab.count()) > 0;
  }

  async openTab(): Promise<void> {
    await this.tab.click();
    await this.panel.waitFor({ state: 'visible', timeout: 5_000 });
  }

  // Placemap editor interactions go here as features need them:
  // uploadLayout, addSection, addCategory, assignSeats, publish, etc.
}
