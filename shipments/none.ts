import type { ShipmentStrategy } from '../types/shipment';

export const none: ShipmentStrategy = {
  shipmentKey:  'none',
  requiresForm: false,
  async fillForm() { /* no shipment — nothing to fill */ },
};
