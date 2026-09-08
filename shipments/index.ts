import type { ShipmentStrategy } from '../types/shipment';
import { email } from './email';
import { delayed } from './delayed';
import { none } from './none';

/**
 * Strategy registry — keyed by `handling_shipment`. Add new shipment
 * mechanics by creating `shipments/{key}.ts` and appending here.
 */
const strategies: ShipmentStrategy[] = [
  email,
  delayed,
  none,
];

const registry: Record<string, ShipmentStrategy> = Object.fromEntries(
  strategies.map(s => [s.shipmentKey, s]),
);

export function getShipmentStrategy(key: string): ShipmentStrategy {
  const s = registry[key];
  if (!s) {
    throw new Error(
      `No ShipmentStrategy for '${key}'. Add shipments/${key}.ts and register it in shipments/index.ts.`,
    );
  }
  return s;
}

export function registeredShipmentKeys(): string[] {
  return Object.keys(registry);
}

export type { ShipmentStrategy, ShipmentContext } from '../types/shipment';
