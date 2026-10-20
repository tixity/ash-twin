import type { PaymentStrategy, TestCard } from '../types/payment';
import type { Locator, Page } from '@playwright/test';

/**
 * Peach Payments V2 Embedded Checkout (`eph_peach.php`).
 *
 * Plugin renders `#peach-payment-form` + an empty `#peach-checkout-container`
 * and loads `checkout.js` from `*.peachpayments.com`. `Checkout.initiate()`
 * mounts the widget as a nested-iframe tree inside the container:
 *
 *   #peach-checkout-container
 *     └── iframe (outer widget, Peach-owned)
 *           ├── Card Holder textbox        (same-origin inside the widget)
 *           ├── Expiry Date textbox
 *           ├── Billing Address inputs
 *           ├── "Pay now" button
 *           ├── iframe (PCI — card number tokenization)
 *           └── iframe (PCI — CVV tokenization)
 *
 * The method picker (Card / Mobicred) is one level up — rendered inside the
 * container but outside the widget iframe. Click it to enter the form.
 *
 * On success Peach auto-navigates to `shopperResultUrl`
 * (`checkout_accept.php?{sor}`), which finalises → `checkout_result.tpl` with
 * the `h1.success|pending|fail` heading. 3DS challenges render in a separate
 * cross-origin iframe (issuer/ACS, not Peach).
 */
export const peach: PaymentStrategy = {
  paymentKey: 'peach',

  async complete(page, { testCard, opts }) {
    const card            = testCard ?? cards.visaSuccess;
    const cancelChallenge = !!opts?.cancelChallenge;

    await page.waitForSelector('#peach-payment-form', { timeout: 20_000 });
    await page.waitForFunction(
      () => typeof (window as unknown as { Checkout?: unknown }).Checkout !== 'undefined',
      { timeout: 30_000 },
    );

    const container = page.locator('#peach-checkout-container');
    await container.waitFor({ state: 'visible', timeout: 20_000 });

    // Payment-method picker lives in the container's parent-frame content.
    // Accessible name is "Card Card Card" (text + two <img alt="Card"> brand
    // tiles concatenate) — match loosely.
    const cardMethod = container.getByRole('button', { name: /card/i }).first();
    await cardMethod.waitFor({ state: 'visible', timeout: 15_000 });
    await cardMethod.click();

    // Enter the Peach widget iframe. All form fields and the Pay button live
    // inside this frame; card number + CVV are additionally wrapped in
    // nested PCI iframes.
    const widget = page.frameLocator('#peach-checkout-container iframe').first();

    // Card number — first nested PCI iframe.
    await widget.frameLocator('iframe').nth(0)
      .getByRole('textbox', { name: /card number/i })
      .fill(card.number);

    // Card holder — same-origin textbox in the outer widget.
    await widget.getByRole('textbox', { name: /card holder/i })
      .fill(card.name ?? 'Test Customer');

    // CVV — second nested PCI iframe.
    await widget.frameLocator('iframe').nth(1)
      .getByRole('textbox', { name: /security code|cvv|cvc/i })
      .fill(card.cvc);

    // Expiry — same-origin textbox, placeholder "MM / YY". Peach accepts the
    // raw "MM/YY" value we store on TestCard.
    await widget.getByRole('textbox', { name: /expiry/i })
      .fill(card.expiry);

    // Billing address — all required by Peach's widget. Values are
    // placeholders; blublood sandbox doesn't validate them against real data.
    // Country combobox has no accessible name (label is a sibling div, not
    // associated via for=/aria-labelledby) — it's the only combobox in the
    // widget, so grab by role alone.
    await widget.getByRole('combobox').first()
      .selectOption({ label: 'South Africa' });
    await widget.getByRole('textbox', { name: /city/i }).fill('Johannesburg');
    await widget.getByRole('textbox', { name: /postal/i }).fill('2000');
    await widget.getByRole('textbox', { name: /street/i }).fill('1 Test Street');

    await widget.getByRole('button', { name: /pay now|^pay/i }).click();

    // Poll for the confirmation heading. 3DS may interleave in its own
    // cross-origin iframe (issuer/ACS, not Peach).
    const heading = page.locator('h1.success, h1.pending, h1.fail');
    const headingDeadline = Date.now() + 90_000;
    while (Date.now() < headingDeadline) {
      if ((await heading.count()) > 0 && (await heading.first().isVisible().catch(() => false))) return;
      await react3ds(page, cancelChallenge);
      await page.waitForTimeout(500);
    }
    throw new Error(`peach: no confirmation heading after 90s. Current URL: ${page.url()}\n${await describeFrames(page)}`);
  },
};

/**
 * React to a 3DS challenge iframe. Peach delegates 3DS to the issuer / ACS
 * provider; the challenge iframe origin varies by issuer. Match the common
 * patterns.
 */
async function react3ds(page: Page, cancel: boolean): Promise<void> {
  for (const frame of page.frames()) {
    const url = frame.url();
    if (!/3dsecure|cardinal|centinel|acs|threeds/i.test(url)) continue;
    try {
      if (cancel) {
        const btn = frame.getByRole('button', { name: /cancel/i }).first();
        if (!(await isVisible(btn))) continue;
        await btn.click();
        return;
      }
      const field = frame.getByRole('textbox').first();
      if (!(await isVisible(field))) continue;
      if ((await field.inputValue()) !== '') continue;
      await field.fill('1234');
      await frame.getByRole('button', { name: /submit|verify|continue|confirm/i }).first().click();
      return;
    } catch {
      /* detached mid-check — outer poll retries */
    }
  }
}

async function isVisible(loc: Locator): Promise<boolean> {
  return (await loc.count()) > 0 && (await loc.first().isVisible());
}

async function describeFrames(page: Page): Promise<string> {
  const lines: string[] = ['frames at timeout:'];
  for (const frame of page.frames()) {
    try {
      const buttons   = await frame.getByRole('button').all();
      const textboxes = await frame.getByRole('textbox').all();
      const btnNames  = (await Promise.all(buttons.slice(0, 10).map(b => b.getAttribute('aria-label').then(a => a ?? b.textContent()).catch(() => null))))
        .map(s => s?.trim()).filter(Boolean).join(' | ');
      const tbNames   = (await Promise.all(textboxes.slice(0, 10).map(t => t.getAttribute('aria-label').then(a => a ?? t.getAttribute('name')).catch(() => null))))
        .map(s => s?.trim()).filter(Boolean).join(' | ');
      lines.push(`  ${frame.url() || '(main)'}\n    buttons:   [${btnNames}]\n    textboxes: [${tbNames}]`);
    } catch {
      lines.push(`  ${frame.url() || '(main)'}  (unreadable)`);
    }
  }
  return lines.join('\n');
}

/**
 * Peach sandbox test cards (standard set published by Peach).
 */
export const cards: Record<string, TestCard> = {
  visaSuccess: { number: '4111111111111111', expiry: '12/30', cvc: '100' },
  visaFail:    { number: '4000000000000002', expiry: '12/30', cvc: '100' },
  visa3ds:     { number: '4000000000000010', expiry: '12/30', cvc: '100' },
};
