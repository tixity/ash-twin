import type { ShipmentStrategy } from '../types/shipment';

export const email: ShipmentStrategy = {
  shipmentKey:  'email',
  requiresForm: false,
  async fillForm() { /* email delivery — nothing to fill */ },
};
