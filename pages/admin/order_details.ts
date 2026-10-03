import type { Locator, Page } from '@playwright/test';

export class AdminOrderDetailsPage {
  readonly path = '/admin/orders.php';
  readonly form:            Locator;
  readonly refundButton:    Locator;
  readonly refundDialog:    Locator;
  readonly seatCheckboxes:  Locator;

  constructor(private page: Page) {
    this.form           = page.locator('form#delete_tickets_form');
    this.refundButton   = page.locator('#refund_ticket');
    this.refundDialog   = page.locator('#refund-dialog');
    this.seatCheckboxes = page.locator('input[name="place[]"]');
  }

  buildPath(orderId: number): string {
    return `${this.path}?action=details&order_id=${orderId}`;
  }

  async open(orderId: number): Promise<void> {
    await this.page.goto(this.buildPath(orderId));
    await this.form.waitFor({ state: 'attached' });
  }

  // Refundable seat ids in row order — enabled checkboxes only.
  async refundableSeatIds(): Promise<number[]> {
    const values = await this.seatCheckboxes.evaluateAll(boxes =>
      boxes
        .filter(b => !(b as HTMLInputElement).disabled)
        .map(b => Number((b as HTMLInputElement).value)),
    );
    return values.filter(v => Number.isFinite(v) && v > 0);
  }

  async refund(count: number | 'all'): Promise<void> {
    const seatIds = await this.refundableSeatIds();
    if (seatIds.length === 0) throw new Error('No refundable seats on this order');

    const target = count === 'all' ? seatIds : seatIds.slice(0, count);
    if (target.length === 0) throw new Error(`Requested refund count ${count} yielded 0 seats`);

    for (const id of target) {
      await this.page.locator(`input[name="place[]"][value="${id}"]`).check();
    }

    await this.refundButton.waitFor({ state: 'visible' });
    await this.page.waitForFunction(
      () => {
        const btn = document.getElementById('refund_ticket') as HTMLButtonElement | null;
        return !!btn && !btn.disabled;
      },
      { timeout: 5_000 },
    );
    await this.refundButton.click();

    await this.refundDialog.waitFor({ state: 'visible' });

    const okButton = this.page.locator(
      '.ui-dialog:visible .ui-dialog-buttonpane button:has-text("Ok")',
    ).first();

    await Promise.all([
      this.page.waitForLoadState('networkidle'),
      okButton.click(),
    ]);
  }
}
