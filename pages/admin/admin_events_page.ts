import type { Page, Locator } from '@playwright/test';

export class AdminEventsPage {
  readonly addButton: Locator;
  readonly rows: Locator;

  constructor(private page: Page) {
    this.addButton = page.getByRole('link', { name: /add event|new event/i })
      .or(page.getByRole('button', { name: /add event|new event/i }))
      .first();
    this.rows = page.locator('table tr[data-id], .event-row, .grid-row[data-id]');
  }

  async open() {
    await this.page.goto('/admin/events.php');
  }

  async clickAdd() {
    await this.addButton.click();
  }

  async rowCount(): Promise<number> {
    return await this.rows.count();
  }

  async lastEventId(): Promise<string | null> {
    if (await this.rows.count() === 0) return null;
    return await this.rows.first().getAttribute('data-id');
  }
}
