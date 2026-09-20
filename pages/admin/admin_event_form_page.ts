import type { Page, Locator } from '@playwright/test';

/**
 * The event add/edit form at /admin/events.php?action=add|edit.
 * Validation errors render as <span class='err error'> next to each input.
 * Global notices render as <h4 class='success'> / <h4 class='error'>.
 * Successful saves may also fire a JS toast (showNoticeMsg) — the form re-renders on the same URL.
 */
export class AdminEventFormPage {
  readonly titleInput: Locator;
  readonly priceInput: Locator;
  readonly capacityInput: Locator;
  readonly saveButton: Locator;
  readonly fieldError: Locator;
  readonly globalNotice: Locator;

  constructor(private page: Page) {
    this.titleInput    = page.locator('input[name="event_name"]').first();
    this.priceInput    = page.locator('input[name="event_price"], input[name="price"]').first();
    this.capacityInput = page.locator('input[name="event_capacity"], input[name="capacity"]').first();
    this.saveButton    = page.locator('form button[type="submit"], form input[type="submit"]').first();
    this.fieldError    = page.locator('span.err.error');
    this.globalNotice  = page.locator('h4.success, h4.error').first();
  }

  async openForAdd() {
    await this.page.goto('/admin/events.php?action=add');
  }

  async fillTitle(v: string)    { await this.titleInput.fill(v); }
  async fillPrice(v: number)    { await this.priceInput.fill(String(v)); }
  async fillCapacity(v: number) { await this.capacityInput.fill(String(v)); }

  async save() {
    await this.saveButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async hasError(): Promise<boolean> {
    if ((await this.fieldError.count()) > 0) return true;
    const globalErr = this.page.locator('h4.error').first();
    return (await globalErr.count()) > 0;
  }

  async errorSummary(): Promise<string> {
    const errs: string[] = [];
    const count = await this.fieldError.count();
    for (let i = 0; i < count; i++) {
      const txt = (await this.fieldError.nth(i).textContent())?.trim();
      if (txt) errs.push(txt);
    }
    const globalErr = this.page.locator('h4.error').first();
    if ((await globalErr.count()) > 0) {
      const gtxt = (await globalErr.textContent())?.trim();
      if (gtxt) errs.unshift(gtxt);
    }
    return errs.join(' | ');
  }
}
