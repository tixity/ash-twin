import type { Locator } from '@playwright/test';
import { BasePage, WAIT } from '../base';


export class CapetownEventDatesPage extends BasePage {
  readonly dateRadios: Locator = this.page.locator('input[name="event-time"]');

  /** Whether the date-picker step is currently displayed (main event landed here). */
  async isVisible(): Promise<boolean> {
    return (await this.dateRadios.count()) > 0;
  }

  /**
   * Click the anchor for the target sub event's row, then wait for the
   * category list to load in-place (AJAX response).
   */
  async pickDate(subEventId: number): Promise<void> {
    const row = this.page.locator(`li:has(input[name="event-time"][value="${subEventId}"])`);
    await row.locator('a').first().click();
    await this.page.locator('#list.rd').waitFor({ state: 'visible', timeout: WAIT.MEDIUM });
  }
}
