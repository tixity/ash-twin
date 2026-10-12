import type { Locator } from '@playwright/test';
import { BasePage, WAIT } from '../base';
import type { RegisterData, LoginCreds } from '../../../types/user';

/**
 * Register/login page for the default theme. Path `/register` renders both
 * the login form (`#signin-form2`, left column) and the register form
 * (`#user-register`, right column). Backed by
 * `includes/templates/default/web/user_register.tpl`.
 *
 * Client-side validation is jQuery Validate — invalid submissions are blocked
 * on the client (form never POSTs) and each invalid input gets `.error`
 * added, with a `<label class="error">` inserted next to it.
 */
export class DefaultAuthPage extends BasePage {
  readonly path = '/register';

  // ── Login form ──────────────────────────────────────────────────────────
  readonly loginForm:      Locator = this.page.locator('#signin-form2');
  readonly loginUsername:  Locator = this.page.locator('#signin-form2 input[name="username"]');
  readonly loginPassword:  Locator = this.page.locator('#signin-form2 input[name="password"]');
  readonly loginSubmit:    Locator = this.page.locator('#signin-form2 [type="submit"]');

  // ── Register form ───────────────────────────────────────────────────────
  readonly registerForm:      Locator = this.page.locator('#user-register');
  readonly firstNameInput:    Locator = this.page.locator('#user-register input[name="user_firstname"]');
  readonly lastNameInput:     Locator = this.page.locator('#user-register input[name="user_lastname"]');
  readonly emailInput:        Locator = this.page.locator('#user-register input[name="user_email"]');
  readonly dobInput:          Locator = this.page.locator('#user-register input[name="user_dob"]');
  readonly phoneInput:        Locator = this.page.locator('#user-register input[name="user_phone"]');
  readonly countrySelect:     Locator = this.page.locator('#user-register select[name="user_country"]');
  readonly password1Input:    Locator = this.page.locator('#user-register input[name="password1"]');
  readonly password2Input:    Locator = this.page.locator('#user-register input[name="password2"]');
  readonly termsCheckbox:     Locator = this.page.locator('#user-register input[name="check_condition"]');
  readonly registerSubmit:    Locator = this.page.locator('#user-register [type="submit"]');

  // ── Activation prompt (rendered after a successful register) ────────────
  readonly activationForm:    Locator = this.page.locator('#registration-activation');
  readonly activationInput:   Locator = this.page.locator('#registration-activation input[name="uar"]');

  async open(): Promise<void> {

    await this.page.addInitScript(() => {
      (window as unknown as { grecaptcha: unknown }).grecaptcha = {
        enterprise: {
          ready:   (cb: () => void) => cb(),
          execute: async () => 'ash-twin-stub-token',
        },
      };
    });
    await this.page.goto(this.path);
    await this.waitReady();
  }

  // ── Register form: fillers ──────────────────────────────────────────────

  /**
   * Fill every field on the register form from a RegisterData object.
   * Callers can pass `Partial<RegisterData>` merged with a valid base when
   * they want to leave specific fields blank or invalid.
   */
  async fillRegister(data: RegisterData): Promise<void> {
    if (data.firstName !== undefined) await this.firstNameInput.fill(data.firstName);
    if (data.lastName  !== undefined) await this.lastNameInput.fill(data.lastName);
    if (data.email     !== undefined) await this.emailInput.fill(data.email);
    if (data.dob       !== undefined) await this.setDob(data.dob);
    if (data.phone     !== undefined) await this.setPhone(data.phone);
    if (data.country !== undefined)   await this.setCountry(data.country);
    if (data.city)                    await this.selectCity(data.city);
    if (data.password  !== undefined) await this.password1Input.fill(data.password);
    const confirm = data.passwordConfirm ?? data.password;
    if (confirm !== undefined) await this.password2Input.fill(confirm);
    await this.setTerms(data.acceptTerms !== false);
  }

  /**
   * Set the country select. Empty string clears the selection (selectedIndex
   * = -1) so jQuery Validate's `required` rule fires on submit — needed for
   * the empty-country test.
   */
  async setCountry(value: string): Promise<void> {
    if (value === '') {
      await this.countrySelect.evaluate((el) => {
        (el as HTMLSelectElement).selectedIndex = -1;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      return;
    }
    await this.countrySelect.selectOption(value);
  }

  /**
   * The city input becomes a <select> when the chosen country has a fixed
   * city list (via `citiesMapping` in user_form.tpl); otherwise it stays a
   * text <input>. Handle both shapes.
   */
  async selectCity(value: string): Promise<void> {
    const select = this.page.locator('#user-register select[name="user_city"]');
    const input  = this.page.locator('#user-register input[name="user_city"]');
    if (await select.count() > 0) {
      await select.selectOption({ label: value }).catch(() => select.selectOption(value));
    } else {
      await input.fill(value);
    }
  }

  async submitRegister(): Promise<void> {
    await this.registerSubmit.click();
  }

  async submitRegisterProgrammatically(): Promise<void> {
    // form.submit() doesn't block on the navigation response; we must wait
    // for the POST to come back before querying the DB, or the user row
    // won't be committed yet.
    const responsePromise = this.page.waitForResponse(
      r => r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await this.registerForm.evaluate((form) => {
      (form as HTMLFormElement).submit();
    });
    await responsePromise;
    await this.waitReady();
  }

  async setPhone(number: string): Promise<void> {
    await this.phoneInput.evaluate((el, num) => {
      const $ = (window as unknown as { jQuery?: (el: unknown) => { intlTelInput: (m: string, v?: string) => void } }).jQuery;
      if ($) $(el).intlTelInput('setNumber', num);
      else (el as HTMLInputElement).value = num;
    }, number);
  }

  /**
   * Bypass the captcha server-side using the platform's built-in dev/staging
   * skipCaptcha param. Adds a hidden `skipCaptcha=1` to the register form so
   * validateCaptcha() short-circuits to true. Only effective when the site
   * is running with INSTALL_VERSION containing 'dev' or 'staging'.
   */
  async enableTestCaptchaBypass(): Promise<void> {
    await this.registerForm.evaluate((form) => {
      if (form.querySelector('input[name="skipCaptcha"]')) return;
      const input = document.createElement('input');
      input.type  = 'hidden';
      input.name  = 'skipCaptcha';
      input.value = '1';
      form.appendChild(input);
    });
  }

  /**
   * The T&C checkbox may already be in the target state (e.g. carried over
   * from previous session or set by JS). Playwright's `check()` errors when
   * clicking doesn't flip state — set via DOM to make the call idempotent.
   */
  async setTerms(checked: boolean): Promise<void> {
    await this.termsCheckbox.evaluate((el, val) => {
      const input = el as HTMLInputElement;
      input.checked = val;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, checked);
  }

  /**
   * DOB is controlled by the pickadate plugin; the raw input is `readonly`.
   * We set both the visible input's value and the plugin's hidden submit
   * input so jQuery Validate sees a filled field.
   */
  async setDob(iso: string): Promise<void> {
    await this.dobInput.evaluate((el, v) => {
      const input = el as HTMLInputElement;
      input.removeAttribute('readonly');
      input.value = v;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, iso);
  }

  // ── Register form: assertions ───────────────────────────────────────────

  /**
   * True when jQuery Validate has flagged the input `[name={field}]` as
   * invalid — it adds `.error` to the input itself. Robust across the varied
   * label placements in the template.
   */
  async hasFieldError(field: string, timeout?: number): Promise<boolean> {
    return this.isVisibleSoon(
      this.page.locator(`#user-register [name="${field}"].error`).first(),
      timeout,
    );
  }

  /** Count of visible field-level error labels — useful for "form is dirty" checks. */
  async errorCount(): Promise<number> {
    return this.page.locator('#user-register label.error:visible').count();
  }

  /** True when the server accepted registration and rendered the activation prompt. */
  async isOnActivationPage(timeout?: number): Promise<boolean> {
    return this.isVisibleSoon(this.activationForm, timeout);
  }

  // ── Login form: fillers + submit ────────────────────────────────────────

  async fillLogin(creds: LoginCreds): Promise<void> {
    await this.loginUsername.fill(creds.username);
    await this.loginPassword.fill(creds.password);
  }

  async submitLogin(): Promise<void> {
    const previousUrl = this.page.url();
    await this.loginSubmit.click();
    await Promise.race([
      this.page.waitForURL(u => u.href !== previousUrl, { timeout: WAIT.MEDIUM, waitUntil: 'domcontentloaded' }),
      this.page.locator('#signin-form2 .error').first().waitFor({ state: 'visible', timeout: WAIT.MEDIUM }),
    ]);
  }

  /** True when either the login or register form is visible on the current page. */
  async isOnPage(): Promise<boolean> {
    if (await this.loginForm.isVisible())    return true;
    if (await this.registerForm.isVisible()) return true;
    return false;
  }

  async hasLoginFieldError(field: string, timeout?: number): Promise<boolean> {
    return this.isVisibleSoon(
      this.page.locator(`#signin-form2 [name="${field}"].error`).first(),
      timeout,
    );
  }

  async activate(activationPath: string): Promise<void> {
    // On successful activation the server responds with an immediate 302 to
    // `?profileVerified=success`, so `page.goto(activationPath)` never
    // commits to the activation URL — Playwright reports it as "interrupted
    // by another navigation". That interruption IS the success signal.
    // Swallow it and wait for the final page.
    try {
      await this.page.goto(activationPath);
    } catch (err) {
      if (!String(err).includes('interrupted by another navigation')) throw err;
    }
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** True when the header renders the signed-in variant of `#user`. */
  async isSignedIn(timeout?: number): Promise<boolean> {
    return this.isVisibleSoon(this.page.locator('#user.signedin').first(), timeout);
  }

  async logout(): Promise<void> {
    const widget = this.page.locator('#user.signedin').first();
    await widget.locator('> a').first().hover();
    const link = widget.locator('a[href*="action=logout"]').first();
    await link.waitFor({ state: 'visible' });
    await link.click();
    await this.page.waitForLoadState('domcontentloaded');
  }
}
