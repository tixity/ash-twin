import type { Page } from '@playwright/test';

export interface ShipmentContext {
  opts?: Record<string, unknown>;
}

export interface ShipmentStrategy {
  shipmentKey:  string;
  requiresForm: boolean;

  fillForm(page: Page, ctx: ShipmentContext): Promise<void>;
}
