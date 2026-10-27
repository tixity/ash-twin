import type { Locator } from '@playwright/test';
import { BasePage, WAIT } from '../base';

/**
 * Edit Profile page for the default theme. Path `?action=user_profile_edit`
 * renders the same `#user-register` form id as the register page; shop.tpl
 * dispatches on `action`. Backed by
 * `includes/templates/default/web/user_profile_edit.tpl`.
 *
 * The server redirects to `?action=user_profile` on a successful save
 * (see shop.tpl's `user_profile_edit` branch), so submitDetails() waits for
 * that URL change as its success signal.
 */
export class DefaultEditProfilePage extends BasePage {
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
