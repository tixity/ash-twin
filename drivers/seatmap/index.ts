import type { Page } from '@playwright/test';
import { LegacyDriver } from './legacy';
import type { SeatMapDriver } from '../../types/seat';

export function seatMapFor(page: Page): SeatMapDriver {
  return new LegacyDriver(page);
}
