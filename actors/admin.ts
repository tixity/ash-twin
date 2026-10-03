import type { Page } from '@playwright/test';
import type { TenantConfig } from '../types/tenant';
import type { DbClient } from '../helpers/db_client';
import type { Event } from '../types/event';
import { AdminEventsPage } from '../pages/admin/events';
import { AdminEventDetails } from '../pages/admin/event/details';
import { AdminOrderDetailsPage } from '../pages/admin/order_details';

export class Admin {
  constructor(
    private page: Page,
    private tenant: TenantConfig,
    private db: DbClient,
  ) {}

  async refundOrder(orderId: number, opts?: { seats?: number | 'all' }): Promise<void> {
    const page = new AdminOrderDetailsPage(this.page);
    await page.open(orderId);
    await page.refund(opts?.seats ?? 'all');
  }

  async clearCache(): Promise<void> {
    const request = this.page.context().request;
    const cacheUrl = `${this.tenant.baseUrl}/admin/index.php?p=cache&tab=8`;

    await request.get(`${cacheUrl}&action=clearcache`);       // filesystem cache
    await request.get(`${cacheUrl}&action=flush_cache_db`);   // Redis / phpfastcache
  }

  async createEvent(payload: Partial<Event> = {}): Promise<Event> {
    const title = payload.title ?? `e2e-event-${Date.now()}`;

    const list = new AdminEventsPage(this.page);
    await list.open();
    await list.clickAdd();

    const details = new AdminEventDetails(this.page);
    await details.fill({ name: title });
    await details.save();

    const err = await details.errorSummary();
    if (err) {
      throw new Error(`createEvent failed: ${err}`);
    }

    const row = await this.db.one<{ id: number; title: string } & import('mysql2').RowDataPacket>(
      'SELECT id, event_name AS title FROM events WHERE event_name = ? ORDER BY id DESC LIMIT 1',
      [title],
    );
    if (!row) throw new Error(`Event "${title}" was submitted but not found in DB after save`);

    return { id: row.id, title: row.title };
  }
}
