import type { Page, Locator } from '@playwright/test';

// Drives the admin form that edits a POS Office at
// /admin/users.php?tab=1&action=edit&user_id=<id>.
export class AdminPosPage {
  readonly storeNowYes: Locator;
  readonly storeNowNo:  Locator;
  readonly strictYes:   Locator;
  readonly strictNo:    Locator;
  readonly saveButton:  Locator;
  readonly notice:      Locator;

  constructor(private page: Page) {
    // switch-field radios: inputs are CSS-hidden; check() with force:true
    // sets .checked directly (and fires change events) without needing them
    // visible.
    this.storeNowYes = page.locator('#user_prefs_store_now-yes');
    this.storeNowNo  = page.locator('#user_prefs_store_now-no');
    this.strictYes   = page.locator('#user_prefs_strict-yes');
    this.strictNo    = page.locator('#user_prefs_strict-no');
    this.saveButton  = page.locator('button#save, button[type="submit"]').first();
    this.notice      = page.locator('#messagebar .notify_notice');
  }

  async open(userId: number): Promise<void> {
    await this.page.goto(`/admin/users.php?tab=1&action=edit&user_id=${userId}`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async setStoreNow(on: boolean): Promise<void> {
    await this.setRadio('user_prefs_store_now', on);
  }

  async setStrict(on: boolean): Promise<void> {
    await this.setRadio('user_prefs_strict', on);
  }

  // switch-field radios are hidden by CSS and Playwright's .check() gets
  // reverted by the switch-field JS. Firing the input's native .click() from
  // inside the page mimics what the browser does when the user clicks the
  // label — the radio flips, change event fires, form serializes correctly.
  private async setRadio(name: string, on: boolean): Promise<void> {
    await this.page.evaluate(({ name, on }) => {
      const target = document.querySelector<HTMLInputElement>(`#${name}-${on ? 'yes' : 'no'}`);
      target?.click();
    }, { name, on });
  }

  async save(): Promise<void> {
    await this.saveButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async noticeText(): Promise<string | null> {
    if (await this.notice.count() === 0) return null;
    return (await this.notice.textContent())?.trim() ?? null;
  }
}
