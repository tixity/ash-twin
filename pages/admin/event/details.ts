import type { Page, Locator } from '@playwright/test';

export type AdminEventFields = {
  name?:                string;
  type?:                string;
  date?:                string;    // YYYY-MM-DD
  time?:                string;    // HH:MM:SS or HH:MM
  endDate?:             string;
  endTime?:             string;
  openTime?:            string;
  viewBegin?:           string;    // YYYY-MM-DD HH:MM:SS
  viewEnd?:             string;
  orderLimit?:          number;
  userLimit?:           number;
  externalUrl?:         string;
  presentedBy?:         string;
  webshop?:             boolean;
  soldout?:             boolean;
  hideAfterStart?:      boolean;
  requiresLogin?:       boolean;
  isPrivate?:           boolean;
  requiresNationalId?:  boolean;
  presales?:            boolean;
  guestCheckout?:       boolean;
  autoSelectDiscounts?: boolean;
  multidaySpan?:        boolean;
  rep?:                 'unique' | 'main' | 'sub';
};

export class AdminEventDetails {
  readonly path = '/admin/events.php';
  readonly tab:                       Locator;
  readonly nameInput:                 Locator;
  readonly typeSelect:                Locator;
  readonly dateInput:                 Locator;
  readonly timeInput:                 Locator;
  readonly endDateInput:              Locator;
  readonly endTimeInput:              Locator;
  readonly openTimeInput:             Locator;
  readonly viewBeginInput:            Locator;
  readonly viewEndInput:              Locator;
  readonly orderLimitInput:           Locator;
  readonly userLimitInput:            Locator;
  readonly externalUrlInput:          Locator;
  readonly presentedByInput:          Locator;
  readonly webshopCheckbox:           Locator;
  readonly soldoutCheckbox:           Locator;
  readonly hideAfterStartCheckbox:    Locator;
  readonly requiresLoginCheckbox:     Locator;
  readonly isPrivateCheckbox:         Locator;
  readonly requiresNationalIdCheckbox: Locator;
  readonly presalesCheckbox:          Locator;
  readonly guestCheckoutCheckbox:     Locator;
  readonly autoSelectDiscountsCheckbox: Locator;
  readonly multidaySpanCheckbox:      Locator;
  readonly repSelect:                 Locator;
  readonly saveButton:                Locator;
  readonly fieldError:                Locator;
  readonly globalNotice:              Locator;
  readonly globalError:               Locator;

  constructor(private page: Page) {
    this.tab                        = page.locator('a[href="#event_details"]');
    this.nameInput                  = page.locator('input[name="event_name"]');
    this.typeSelect                 = page.locator('select[name="event_type"]');
    this.dateInput                  = page.locator('input[name="event_date"]');
    this.timeInput                  = page.locator('input[name="event_time"]');
    this.endDateInput               = page.locator('input[name="event_end_date"]');
    this.endTimeInput               = page.locator('input[name="event_end"]');
    this.openTimeInput              = page.locator('input[name="event_open"]');
    this.viewBeginInput             = page.locator('input[name="event_view_begin"]');
    this.viewEndInput               = page.locator('input[name="event_view_end"]');
    this.orderLimitInput            = page.locator('input[name="event_order_limit"]');
    this.userLimitInput             = page.locator('input[name="event_user_limit"]');
    this.externalUrlInput           = page.locator('input[name="event_external_url"]');
    this.presentedByInput           = page.locator('input[name="event_presented_by"]');
    this.webshopCheckbox            = page.locator('input[type="checkbox"][name="event_webshop"]');
    this.soldoutCheckbox            = page.locator('input[type="checkbox"][name="event_soldout"]');
    this.hideAfterStartCheckbox     = page.locator('input[type="checkbox"][name="event_hide_after_starttime"]');
    this.requiresLoginCheckbox      = page.locator('input[type="checkbox"][name="event_requires_login"]');
    this.isPrivateCheckbox          = page.locator('input[type="checkbox"][name="event_is_private"]');
    this.requiresNationalIdCheckbox = page.locator('input[type="checkbox"][name="event_nationalid"]');
    this.presalesCheckbox           = page.locator('input[type="checkbox"][name="event_presales"]');
    this.guestCheckoutCheckbox      = page.locator('input[type="checkbox"][name="event_guest_checkout"]');
    this.autoSelectDiscountsCheckbox = page.locator('input[type="checkbox"][name="event_auto_select_discounts"]');
    this.multidaySpanCheckbox       = page.locator('input[type="checkbox"][name="event_multiday_span"]');
    this.repSelect                  = page.locator('select[name="event_rep"]');
    this.saveButton                 = page.locator('#event_details form button[type="submit"], #event_details form input[type="submit"]').first();
    this.fieldError                 = page.locator('#event_details span.err.error');
    this.globalNotice               = page.locator('h4.success').first();
    this.globalError                = page.locator('h4.error').first();
  }

  async openForAdd(): Promise<void> {
    await this.page.goto(`${this.path}?action=add`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async openForEdit(eventId: number): Promise<void> {
    await this.page.goto(`${this.path}?action=edit&event_id=${eventId}`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async openTab(): Promise<void> {
    await this.tab.click();
  }

  async fill(data: AdminEventFields): Promise<void> {
    if (data.name       !== undefined) await this.nameInput.fill(data.name);
    if (data.type       !== undefined) await this.typeSelect.selectOption(data.type);
    if (data.date       !== undefined) await this.setDate(this.dateInput,    data.date);
    if (data.time       !== undefined) await this.timeInput.fill(data.time);
    if (data.endDate    !== undefined) await this.setDate(this.endDateInput, data.endDate);
    if (data.endTime    !== undefined) await this.endTimeInput.fill(data.endTime);
    if (data.openTime   !== undefined) await this.openTimeInput.fill(data.openTime);
    if (data.viewBegin  !== undefined) await this.viewBeginInput.fill(data.viewBegin);
    if (data.viewEnd    !== undefined) await this.viewEndInput.fill(data.viewEnd);
    if (data.orderLimit !== undefined) await this.orderLimitInput.fill(String(data.orderLimit));
    if (data.userLimit  !== undefined) await this.userLimitInput.fill(String(data.userLimit));
    if (data.externalUrl!== undefined) await this.externalUrlInput.fill(data.externalUrl);
    if (data.presentedBy!== undefined) await this.presentedByInput.fill(data.presentedBy);

    if (data.webshop            !== undefined) await this.toggle(this.webshopCheckbox,            data.webshop);
    if (data.soldout            !== undefined) await this.toggle(this.soldoutCheckbox,            data.soldout);
    if (data.hideAfterStart     !== undefined) await this.toggle(this.hideAfterStartCheckbox,     data.hideAfterStart);
    if (data.requiresLogin      !== undefined) await this.toggle(this.requiresLoginCheckbox,      data.requiresLogin);
    if (data.isPrivate          !== undefined) await this.toggle(this.isPrivateCheckbox,          data.isPrivate);
    if (data.requiresNationalId !== undefined) await this.toggle(this.requiresNationalIdCheckbox, data.requiresNationalId);
    if (data.presales           !== undefined) await this.toggle(this.presalesCheckbox,           data.presales);
    if (data.guestCheckout      !== undefined) await this.toggle(this.guestCheckoutCheckbox,      data.guestCheckout);
    if (data.autoSelectDiscounts!== undefined) await this.toggle(this.autoSelectDiscountsCheckbox,data.autoSelectDiscounts);
    if (data.multidaySpan       !== undefined) await this.toggle(this.multidaySpanCheckbox,       data.multidaySpan);
    if (data.rep                !== undefined) await this.repSelect.selectOption(data.rep);
  }

  async save(): Promise<void> {
    await this.saveButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async noticeText(): Promise<string | null> {
    if ((await this.globalNotice.count()) === 0) return null;
    return (await this.globalNotice.textContent())?.trim() ?? null;
  }

  async errorSummary(): Promise<string> {
    const errs: string[] = [];
    const count = await this.fieldError.count();
    for (let i = 0; i < count; i++) {
      const txt = (await this.fieldError.nth(i).textContent())?.trim();
      if (txt) errs.push(txt);
    }
    if ((await this.globalError.count()) > 0) {
      const gtxt = (await this.globalError.textContent())?.trim();
      if (gtxt) errs.unshift(gtxt);
    }
    return errs.join(' | ');
  }

  async currentEventId(): Promise<number | null> {
    const hidden = this.page.locator('input[type="hidden"][name="event_id"]').first();
    if ((await hidden.count()) === 0) return null;
    const v = await hidden.getAttribute('value');
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  }

  private async toggle(checkbox: Locator, on: boolean): Promise<void> {
    await checkbox.evaluate((el, val) => {
      const input = el as HTMLInputElement;
      if (input.checked !== val) input.click();
    }, on);
  }

  private async setDate(input: Locator, iso: string): Promise<void> {
    await input.evaluate((el, v) => {
      const i = el as HTMLInputElement;
      i.removeAttribute('readonly');
      i.value = v;
      i.dispatchEvent(new Event('change', { bubbles: true }));
    }, iso);
  }
}
