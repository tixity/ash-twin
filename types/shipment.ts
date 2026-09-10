import type { Page } from '@playwright/test';

export interface ShipmentContext {
  opts?: Record<string, unknown>;
}

export interface ShipmentStrategy {
  shipmentKey:  string;    // matches handling_shipment / the `shipment=` attr on the handling radio
  requiresForm: boolean;   // true when checkout needs extra input (address, pickup point, custom fields)

  /**
   * Fill whatever the shipment plugin injects into the checkout page.
   * No-op for shipments that render nothing extra (email, delayed, none).
   * Called by the actor after the handling radio is picked, before submit.
   */
  fillForm(page: Page, ctx: ShipmentContext): Promise<void>;
}
