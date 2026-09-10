import type { ShipmentStrategy } from '../types/shipment';

export const delayed: ShipmentStrategy = {
  shipmentKey:  'delayed',
  requiresForm: false,
  async fillForm() { /* handled later by tenant ops — nothing at checkout */ },
};
