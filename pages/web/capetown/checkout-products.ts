import type { Locator } from '@playwright/test';
import { BasePage } from '../base';


export class CapetownCheckoutProductsPage extends BasePage {

  readonly checkoutButton: Locator = this.page.locator('#btns #checkoutBtn');

  async isCurrent(): Promise<boolean> {
    return await this.page.locator('body.checkout-products').first().isVisible();
  }

  async continue(): Promise<void> {
    await this.checkoutButton.click();
    await this.waitReady();
  }

  async pickAddon(addonId: number, categoryId: number, qty: number): Promise<void> {
    if (qty <= 0) return;

    const picker = this.page.locator(
      `.quantity-picker.addon[data-addon-id="${addonId}"][id="${categoryId}"]`,
    );
    await picker.waitFor({ state: 'visible' });

    const inc = picker.locator('.inc.addon-button');
    for (let i = 0; i < qty; i++) {
      await inc.click();
    }

    const item = this.page.locator(
      `.product-category-item:has(.quantity-picker.addon[data-addon-id="${addonId}"])`,
    );
    const addBtn = item.locator('.subCatBtn button.btn-add-addon').first();

    for (let i = 0; i < 20 && !(await addBtn.isEnabled()); i++) {
      await this.page.waitForTimeout(100);
    }

    await Promise.all([
      this.page.waitForResponse(r => r.url().includes('json.php') && r.request().method() === 'POST'),
      addBtn.click(),
    ]);
  }

  async readAddonPrice(addonId: number): Promise<string> {
    const item = this.page.locator(
      `.product-category-item:has(.quantity-picker.addon[data-addon-id="${addonId}"])`,
    );
    return (await item.locator('.product-category-item-price').first().textContent())?.trim() ?? '';
  }
  
  async isAddonSoldOutByName(addonName: string): Promise<boolean> {
    const item = this.page.locator('.product-category-item').filter({
      has: this.page.locator('.product-category-item-title-text', { hasText: addonName }),
    }).first();
    if ((await item.count()) === 0) return false;
    return await item.evaluate((el) => el.classList.contains('isSoldout'));
  }

  // ── Cross-theme primitives (structural contract with default) ─────────

  async hasAddon(addonId: number, _addonName: string): Promise<boolean> {
    return (await this.page.locator(`.product-card[data-product-id="${addonId}"]`).count()) > 0;
  }

  async isAddonSoldOut(addonId: number, _addonName: string): Promise<boolean> {
    const card = this.page.locator(`.product-card[data-product-id="${addonId}"]`).first();
    if ((await card.count()) === 0) return false;
    // Capetown emits a badge inside the card when the addon is sold out.
    const badge = card.locator('.sold-out, .badge-sold-out, [class*="soldout" i]');
    return (await badge.count()) > 0;
  }

  async readAddonPickerAttr(addonId: number, categoryId: number, attr: string): Promise<string | null> {
    await this.page.locator(`.product-card[data-product-id="${addonId}"]`).click();
    const picker = this.page.locator(
      `.modal-quantity-picker.addon[data-addon-id="${addonId}"][id="${categoryId}"]`,
    );
    await picker.waitFor({ state: 'attached', timeout: 5_000 });
    const value = await picker.getAttribute(attr);
    await this.page.keyboard.press('Escape');
    return value;
  }

  // ── Modal interaction primitives (for min/max/multiple_of behavior tests)

  async openAddonModal(addonId: number): Promise<void> {
    const card = this.page.locator(`.product-card[data-product-id="${addonId}"]`).first();
    if ((await card.count()) === 0) return;
    await card.click();
    await this.page.locator(
      `.modal-quantity-picker.addon[data-addon-id="${addonId}"]`,
    ).first().waitFor({ state: 'visible', timeout: 5_000 });
    // products.js binds the picker's .inc click handler in fancybox's
    // afterShow callback — waitFor('visible') can resolve slightly earlier,
    // leaving the button responsive but unhandled.
    await this.page.waitForFunction((id) => {
      const picker = document.querySelector(
        `.modal-quantity-picker.addon[data-addon-id="${id}"]`,
      );
      if (!picker) return false;
      const inc = picker.querySelector('.inc');
      if (!inc) return false;
      // @ts-ignore
      const events = window.jQuery?._data(inc, 'events');
      return !!events?.click?.some((e: any) => e.namespace === 'modal');
    }, addonId, { timeout: 5_000 });
  }

  async closeAddonModal(): Promise<void> {
    await this.page.evaluate(() => (window as any).jQuery?.fancybox?.close?.());
    await this.page.locator('.fancybox-overlay').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => { /* already gone */ });
  }

  async getAddonQty(addonId: number, categoryId: number): Promise<number> {
    const input = this.page.locator(
      `.modal-quantity-picker.addon[data-addon-id="${addonId}"][id="${categoryId}"] input[name="fakeplaces"]`,
    ).first();
    const val = await input.inputValue();
    return parseInt(val, 10) || 0;
  }

  async incAddon(addonId: number, categoryId: number, times = 1): Promise<void> {
    const inc = this.page.locator(
      `.modal-quantity-picker.addon[data-addon-id="${addonId}"][id="${categoryId}"] .inc`,
    ).first();
    for (let i = 0; i < times; i++) await inc.click();
  }

  async addAddonViaModal(
    addonId:    number,
    categoryId: number,
    qty:        number,
    opts:       { promoCode?: string } = {},
  ): Promise<void> {
    if (qty <= 0) return;
    await this.openAddonModal(addonId);

    if (opts.promoCode) {
      const promoInput = this.page.locator(`input[name="promo_value_${categoryId}"]`).first();
      await promoInput.waitFor({ state: 'visible', timeout: 5_000 });
      await promoInput.fill(opts.promoCode);
    }

    await this.incAddon(addonId, categoryId, qty);

    const addBtn = this.page.locator('#product-modal .btn-add-addon').first();
    for (let i = 0; i < 20 && !(await addBtn.isEnabled()); i++) {
      await this.page.waitForTimeout(100);
    }
    await Promise.all([
      this.page.waitForResponse(r =>
        r.url().includes('json.php') &&
        r.request().method() === 'POST' &&
        (r.request().postData() ?? '').includes('action=_addtocart')
      ),
      addBtn.click(),
    ]);
  }

  // ── Card-level discount surfaces (product_card_modal.tpl) ─────────────

  async hasAddonAutoDiscount(addonId: number): Promise<boolean> {
    const card = this.page.locator(`.product-card[data-product-id="${addonId}"]`).first();
    return (await card.getAttribute('data-has-auto-discount')) === 'true';
  }

  async hasAddonPromoTag(addonId: number): Promise<boolean> {
    const card = this.page.locator(`.product-card[data-product-id="${addonId}"]`).first();
    return (await card.getAttribute('data-has-non-promo-discounts')) === 'true';
  }

  async hasAddonAnyDiscount(addonId: number): Promise<boolean> {
    const card = this.page.locator(`.product-card[data-product-id="${addonId}"]`).first();
    return (await card.getAttribute('data-has-discounts')) === 'true';
  }

  async readAddonAutoDiscountId(addonId: number): Promise<number | null> {
    const card = this.page.locator(`.product-card[data-product-id="${addonId}"]`).first();
    const raw  = await card.getAttribute('data-auto-discount-id');
    if (!raw) return null;
    return Number(raw);
  }

  async readAddonCardPrice(addonId: number): Promise<{ current: string; original: string | null }> {
    const card = this.page.locator(`.product-card[data-product-id="${addonId}"]`).first();
    const current  = (await card.locator('.price-new').first().textContent())?.trim() ?? '';
    const oldNode  = card.locator('.price-old');
    const original = (await oldNode.count()) > 0
      ? (await oldNode.first().textContent())?.trim() ?? null
      : null;
    return { current, original };
  }

  async readAddonCategoryData(addonId: number): Promise<AddonCategoryEntry[]> {
    const card = this.page.locator(`.product-card[data-product-id="${addonId}"]`).first();
    const raw  = await card.getAttribute('data-categories');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as any[];
    return parsed.map(c => ({
      ...c,
      id:               Number(c.id),
      price:            Number(c.price),
      auto_discount_id: c.auto_discount_id != null ? Number(c.auto_discount_id) : null,
      discount:         c.discount ? { ...c.discount, id: Number(c.discount.id) } : undefined,
    })) as AddonCategoryEntry[];
  }
}

export interface AddonCategoryEntry {
  id:                number;
  name:              string;
  price:             number;
  has_discounts:     boolean;
  has_auto_discount: boolean;
  auto_discount_id:  number | null;
  discount?:         { id: number; name: string; new_price: number };
}
