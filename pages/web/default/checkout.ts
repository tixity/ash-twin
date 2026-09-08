import type { Locator } from '@playwright/test';
import { BasePage } from '../base';

export interface CheckoutUserInfo {
  firstName?: string;
  lastName?:  string;
  email?:     string;
  phone?:     string;
  country?:   string;
  city?:      string;
  address?:   string;
}

/** A handling radio the server rendered on the current checkout preview. */
export interface RenderedHandling {
  id:         number;
  paymentKey: string;   // data-payment-type — matches handling_payment in the DB
  feeLabel:   string;   // data-fee-label — display text next to the fee
}

export class DefaultCheckoutPage extends BasePage {
  readonly path = '/checkout';
  readonly form:            Locator = this.page.locator('form#order-handling');
  readonly handlingRadios:  Locator = this.page.locator('input[name="handling_id"]');
  readonly termsCheckbox:   Locator = this.page.locator('input[name="checkout_terms"]');
  readonly submitButton:    Locator = this.page.locator(
    'form#order-handling button[type="submit"], form#order-handling input[type="submit"]',
  );

  // Address-form fields — only rendered when the selected shipment requires a
  // physical address. CCA overrides checkout_address_form.tpl with emirate/area
  // selects driven by customSelect (~300ms init timeout); this bare filler is
  // a placeholder until we tackle shipment flows.
  readonly firstNameInput: Locator = this.page.locator('input[name="user_firstname"]');
  readonly lastNameInput:  Locator = this.page.locator('input[name="user_lastname"]');
  readonly emailInput:     Locator = this.page.locator('input[name="user_email"]');
  readonly phoneInput:     Locator = this.page.locator('input[name="user_phone"]');
  readonly countryInput:   Locator = this.page.locator('input[name="user_country"]');
  readonly cityInput:      Locator = this.page.locator('[name="user_city"]');
  readonly addressInput:   Locator = this.page.locator('input[name="user_address"]');

  async open(): Promise<void> {
    await this.page.goto(this.path);
    await this.waitReady();
  }

  // ── Handling selection ──────────────────────────────────────────────────

  /**
   * Read every handling radio the server rendered. Filtering (event/cart
   * compatibility, country, sale mode) runs server-side, so what's in the
   * DOM is the ground truth for what's available on this checkout.
   */
  async readAvailableHandlings(): Promise<RenderedHandling[]> {
    return await this.handlingRadios.evaluateAll(rows =>
      rows.map(r => {
        const el = r as HTMLInputElement;
        return {
          id:         Number(el.value),
          paymentKey: el.getAttribute('data-payment-type') ?? '',
          feeLabel:   el.getAttribute('data-fee-label')    ?? '',
        };
      }),
    );
  }

  /**
   * Click the handling with the given payment type and return the wrapping
   * <label> Locator. Payment strategies use it to scope their own selectors
   * (iframe, widget) without colliding with sibling handling widgets.
   *
   * Some handlings (e.g. Tabby) render the row with `display:none` until an
   * eligibility AJAX resolves. Tests can't rely on that pass — the caller
   * asked for the handling by name, so force the label visible before clicking.
   */
  async pickHandlingByPayment(paymentKey: string): Promise<Locator> {
    await this.page.evaluate((key) => {
      const input = document.querySelector(`input[name="handling_id"][data-payment-type="${key}"]`);
      const lbl = input?.closest('label') as HTMLElement | null;
      if (lbl) lbl.style.display = '';
    }, paymentKey);
    const label = this.page.locator(
      `label:has(input[name="handling_id"][data-payment-type="${paymentKey}"])`,
    );
    await label.click();
    return label;
  }

  /**
   * Terms-of-service checkbox on the checkout page. Only rendered when the
   * tenant has `legacyweb_config_terms_and_conditions_link` configured — no-op
   * otherwise. Separate from the event-level terms handled on the event page.
   */
  async acceptTerms(): Promise<void> {
    if ((await this.termsCheckbox.count()) === 0) return;
    if (await this.termsCheckbox.isChecked()) return;
    // Input is visually hidden by the theme; click the wrapping label so
    // Playwright's actionability checks run against the real click target.
    await this.page.locator('label:has(input[name="checkout_terms"])').click();
  }

  // ── User info (placeholder — see note above) ───────────────────────────

  async fillUserInfo(info: CheckoutUserInfo): Promise<void> {
    if (info.firstName !== undefined) await this.firstNameInput.fill(info.firstName);
    if (info.lastName  !== undefined) await this.lastNameInput.fill(info.lastName);
    if (info.email     !== undefined) await this.emailInput.fill(info.email);
    if (info.phone     !== undefined) await this.phoneInput.fill(info.phone);
    if (info.country   !== undefined) await this.countryInput.fill(info.country);
    if (info.city      !== undefined) await this.cityInput.fill(info.city);
    if (info.address   !== undefined) await this.addressInput.fill(info.address);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
    await this.waitReady();
  }

  // ── Cart line inspection (cart_content.tpl on the preview) ─────────────

  async readAddonLineUnitPrice(parentEventId: number, addonName: string): Promise<string> {
    const line = this.page.locator(`#cart-item-${parentEventId}-product dd`).filter({
      has: this.page.locator('.price-item-name', { hasText: addonName }),
    }).first();
    
    return line.locator('.unit-price').first().evaluate(el => {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.seat-count').forEach(n => n.remove());
      return clone.textContent?.trim() ?? '';
    });
  }
}
