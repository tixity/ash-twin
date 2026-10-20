import type { PaymentStrategy } from '../types/payment';
import { cybersource_unified } from './cybersource_unified';
import { free } from './free';
import { peach } from './peach';
import { tabby } from './tabby';

/**
 * Strategy registry — keyed by `handling_payment`. Add new gateways by
 * creating `payments/{key}.ts` and appending the export to this list.
 */
const strategies: PaymentStrategy[] = [
  cybersource_unified,
  free,
  peach,
  tabby,
];

const registry: Record<string, PaymentStrategy> = Object.fromEntries(
  strategies.map(s => [s.paymentKey, s]),
);

/**
 * Look up the strategy for a payment key. Throws loudly if unregistered so
 * that a tenant enabling a new gateway we haven't scripted fails with an
 * actionable message instead of silently misbehaving.
 */
export function getPaymentStrategy(key: string): PaymentStrategy {
  const s = registry[key];
  if (!s) {
    throw new Error(
      `No PaymentStrategy for '${key}'. Add payments/${key}.ts and register it in payments/index.ts.`,
    );
  }
  return s;
}

/** Payment keys the registry knows about — useful for coverage checks. */
export function registeredPaymentKeys(): string[] {
  return Object.keys(registry);
}

export type { PaymentStrategy, PaymentContext, TestCard } from '../types/payment';
