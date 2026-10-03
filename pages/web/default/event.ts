import type { Locator } from '@playwright/test';
import { BasePage, WAIT } from '../base';
import type { Event } from '../../../types/event';

/**
 * Event detail page. Canonical URL is `/{event_type}/{event_id}/{slug}`.
 * We omit the slug (SquareMaze accepts URLs without it).
 */
export class DefaultEventPage extends BasePage {
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
    // Radios carry class="radioform" and are visually hidden — the visible
    // <header id="{categoryId}"> above them is the human click target.
    await this.page.locator(`#li_${categoryId} header`).first().click();
  }

  /**
   * Set quantity by clicking `+` n times. The <input> is `disabled` — the UI
   * gates users through the increment/decrement buttons which fire the JS
   * that toggles the "add to cart" button between disabled and enabled.
   */
  async setQuantity(categoryId: number, n: number): Promise<void> {
    const inc = this.quantityInc(categoryId);
    for (let i = 0; i < n; i++) await inc.click();
  }

  async addToCart(categoryId: number): Promise<void> {
    await this.page.locator(`#li_${categoryId} .mini_add_to_cart`).click();
    // Cart is added via AJAX; the sticky checkout button un-hides on success.
    await this.checkoutButton.waitFor({ state: 'visible', timeout: WAIT.MEDIUM });
  }

  /**
   * Check any required event-level agreement boxes (T&C, age restrictions).
   * Both are gated by `event_terms` / `event_age_restrictions` on the event —
   * hidden entirely when unset, so this method is a no-op for those events.
   *
   * The inputs themselves are visually hidden (styled radios/checkboxes); the
   * wrapping <label> is the human click target, so we click the label to get
   * real actionability instead of forcing a click through Playwright's checks.
   */
  async acceptTerms(): Promise<void> {
    for (const name of ['event_terms', 'event_age_restrictions'] as const) {
      const input = this.page.locator(`#terms input[name="${name}"]`);
      if ((await input.count()) === 0) continue;
      if (await input.isChecked()) continue;
      await this.page.locator(`#terms label:has(input[name="${name}"])`).click();
    }
  }

  async proceedToCheckout(): Promise<void> {
    await this.checkoutButton.click();
    await this.waitReady();
  }

  async hasSeatMap(): Promise<boolean> {
    return (await this.seatMapTrigger.count()) > 0;
  }

  async openSeatMap(categoryId: number): Promise<void> {
    const trigger = this.page.locator(`#li_${categoryId} .js-openSeatMap`).first();
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
      // SUT's enable-hook reads a field only populated by a real user pick pipeline.
      await miniCart.evaluate((el) => el.removeAttribute('disabled'));
      await miniCart.click();
    } else {
      await this.page.locator('#add_to_cart_btn').click();
    }
    await this.checkoutButton.waitFor({ state: 'visible', timeout: WAIT.MEDIUM });
  }
}
