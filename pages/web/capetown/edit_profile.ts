import type { Locator } from '@playwright/test';
import { BasePage, WAIT } from '../base';

/**
 * Edit Profile page for the capetown theme. Shares the `#user-register` form
 * id with the default theme — only wrapper markup differs. Backed by
 * `includes/templates/capetown/web/user_profile_edit.tpl`.
 */
export class CapetownEditProfilePage extends BasePage {
  readonly path = '/?action=user_profile_edit';

  readonly form:              Locator = this.page.locator('#user-register');
  readonly firstNameInput:    Locator = this.page.locator('#user-register input[name="user_firstname"]');
  readonly submitDetailsBtn:  Locator = this.page.locator('#user-register button[name="submit_info"][value="save"]');

  async open(): Promise<void> {
    await this.page.goto(this.path);
    await this.waitReady();
  }

  async fillFirstname(value: string): Promise<void> {
    await this.firstNameInput.fill(value);
  }

  async submitDetails(): Promise<void> {
    const nav = this.page.waitForURL(
      u => /action=user_profile(?!_edit)/.test(u.href),
      { timeout: WAIT.MEDIUM },
    );
    await this.form.evaluate(f => (f as HTMLFormElement).submit());
    await nav;
  }
}
