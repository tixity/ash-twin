import type { Locator } from '@playwright/test';
import { BasePage, WAIT } from '../base';
import type { Event } from '../../../types/event';

/**
 * Event detail page. Canonical URL is `/{event_type}/{event_id}/{slug}`.
 * We omit the slug (SquareMaze accepts URLs without it).
 */
export class CapetownEventPage extends BasePage {
  readonly categoryList:     Locator = this.page.locator('#list.rd');
  readonly categoryRadios:   Locator = this.page.locator('input[name="category_id"]');
  readonly addToCartButtons: Locator = this.page.locator('.mini_add_to_cart');
  readonly seatMapTrigger:   Locator = this.page.locator('.js-openSeatMap');
  readonly checkoutButton:   Locator = this.page.locator('#checkoutBtn');

  // Per-category controls — one .quantity-picker per <li id="li_{catId}">.
  quantityInc(categoryId: number): Locator {
    return this.page.locator(`#li_${categoryId} .quantity-picker .inc`);
  }
  quantityDec(categoryId: number): Locator {
    return this.page.locator(`#li_${categoryId} .quantity-picker .dec`);
  }

  buildPath(event: Pick<Event, 'id' | 'type'>): string {
    if (!event.type) throw new Error(`Event ${event.id} has no type — cannot build URL`);
    return `/${event.type}/${event.id}`;
  }

  async open(event: Pick<Event, 'id' | 'type'>): Promise<void> {
    await this.page.goto(this.buildPath(event));
    await this.waitReady();
    await this.dismissNotice();

    const buyLink = this.page.locator(`a[href*="addtocart&event_id=${event.id}"]`).first();
    if ((await buyLink.count()) > 0) {
      await buyLink.click();
      await this.categoryRadios.first().waitFor({ state: 'attached', timeout: WAIT.MEDIUM });
    }
  }

  /**
   * Two flavours of fancybox may pop on page load:
   *   - `#popup` — the event-level notice, triggered by `showConfirm()` from
   *     init.js when `event_notice_popup = 1` on the event.
   *   - venue/category info fancyboxes (e.g. "Family Package", "Rates for
   *     mates") that intercept pointer events on the categories.
   *
   * Both are dismissed by clicking a button whose href calls
   * `$.fancybox.close()`. We wait briefly for either to appear so we don't
   * race the popup opening.
   */
  async dismissNotice(): Promise<void> {
    const closer = this.page.locator(
      '#popup .btns a, .fancybox-wrap.fancybox-opened a[href*="fancybox.close"], .fancybox-wrap.fancybox-opened .fancybox-close',
    ).first();
    // waitFor throws TimeoutError when no popup renders in QUICK — that's the
    // expected shape for the no-popup path, so we narrow the catch to it.
    try {
      await closer.waitFor({ state: 'visible', timeout: WAIT.QUICK });
      await closer.click();
    } catch (err) {
      if (!(err instanceof Error) || err.name !== 'TimeoutError') throw err;
    }
  }

  async pickCategory(categoryId: number): Promise<void> {
    const legacyHeader = this.page.locator(`#li_${categoryId} header`).first();
    if ((await legacyHeader.count()) > 0) await legacyHeader.click();
  }

  /**
   * Set quantity by clicking `+` n times. The <input> is `disabled` — the UI
   * gates users through the increment/decrement buttons which fire the JS
   * that toggles the "add to cart" button between disabled and enabled.
   */
  async setQuantity(categoryId: number, n: number): Promise<void> {
    const legacyInc = this.quantityInc(categoryId);
    const inc = (await legacyInc.count()) > 0
      ? legacyInc
      : this.page.getByRole('button', { name: /increase quantity/i }).first();
    for (let i = 0; i < n; i++) await inc.click();
  }

  async addToCart(categoryId: number): Promise<void> {
    const legacyAdd = this.page.locator(`#li_${categoryId} .mini_add_to_cart`);
    const add = (await legacyAdd.count()) > 0
      ? legacyAdd
      : this.page.getByRole('button', { name: /^add\b/i }).first();
    await add.click();

    try {
      await this.checkoutButton.waitFor({ state: 'visible', timeout: WAIT.MEDIUM });
    } catch (err) {
      if (!(err instanceof Error) || err.name !== 'TimeoutError') throw err;
    }
  }

// Check any required event-level agreement boxes (T&C, age restrictions).
  async acceptTerms(): Promise<void> {
    for (const name of ['event_terms', 'event_age_restrictions'] as const) {
      const input = this.page.locator(`#terms-modal-content input[name="${name}"]`);
      if ((await input.count()) === 0) continue;
      if (await input.evaluate((el) => (el as HTMLInputElement).checked)) continue;
      await input.evaluate((el) => {
        const cb = el as HTMLInputElement;
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
  }

  async proceedToCheckout(): Promise<void> {
    if (await this.checkoutButton.isVisible()) {
      await this.checkoutButton.click();
    } else {
      await this.page.goto('/checkout.php');
    }
    await this.waitReady();
  }

  async hasSeatMap(): Promise<boolean> {
    return (await this.seatMapTrigger.count()) > 0;
  }

  async openSeatMap(categoryId: number): Promise<void> {
    // Capetown moved the click handler from .js-openSeatMap to .btn-choose-seats
    // (init.js:1330); the old class still exists for styling but is a no-op.
    const trigger = this.page.locator(
      `#li_${categoryId} .btn-choose-seats, #li_${categoryId} .js-openSeatMap`,
    ).first();
    if ((await trigger.count()) === 0) return;
    await trigger.click();
  }

  async commitSeatMap(categoryId: number): Promise<void> {
    const modalConfirm = this.page.locator('.fancybox-skin a.btn_primary').first();
    if ((await modalConfirm.count()) > 0 && await modalConfirm.isVisible()) {
      await modalConfirm.click();
      await modalConfirm.waitFor({ state: 'detached', timeout: WAIT.MEDIUM });
      const miniCart = this.page.locator(`#li_${categoryId} .mini_add_to_cart`);
      await miniCart.waitFor({ state: 'attached', timeout: WAIT.MEDIUM });
      await miniCart.evaluate((el) => el.removeAttribute('disabled'));
      await miniCart.click();
    } else {
      await this.page.locator('#add_to_cart_btn').click();
    }
    await this.isVisibleSoon(this.checkoutButton);
  }
}
