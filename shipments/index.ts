import type { ShipmentStrategy } from '../types/shipment';
import { email } from './email';
import { delayed } from './delayed';
import { none } from './none';

/**
 * Strategy registry — keyed by `handling_shipment`. Add a shipment we can
 * drive by creating `shipments/{key}.ts` and appending here.
 *
 * The resolver uses this list two ways:
 *   - `hasHandling` predicate ANDs `handling_shipment IN (registered)` so it
 *     never picks a handling whose shipment we can't script through checkout.
 *   - `shipmentIn` criterion (defaults to all registered) lets tests filter
 *     events whose `event_shipments` overlap a specific set — e.g. `events.
 *     normal` uses `shipmentIn: registeredShipmentKeys()` so addon / discount
 *     tests never resolve to events whose shipments would skip the addons
 *     interstitial (plugin.addons.php:530 — physical-address events do that).
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
