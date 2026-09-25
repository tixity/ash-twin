import type { Page } from '@playwright/test';
import type { TenantConfig } from '../types/tenant';
import type { DbClient } from '../helpers/db_client';
import type { Event } from '../types/event';
import { AdminEventsPage } from '../pages/admin/admin_events_page';
import { AdminEventFormPage } from '../pages/admin/admin_event_form_page';
import { AdminOrderDetailsPage } from '../pages/admin/admin_order_details';

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

    const form = new AdminEventFormPage(this.page);
    await form.fillTitle(title);
    if (payload.capacity !== undefined && payload.capacity !== null) {
      await form.fillCapacity(payload.capacity);
    }
    await form.save();

    if (await form.hasError()) {
      throw new Error(`createEvent failed: ${await form.errorSummary()}`);
    }

    const row = await this.db.one<{ id: number; title: string } & import('mysql2').RowDataPacket>(
      'SELECT id, event_name AS title FROM events WHERE event_name = ? ORDER BY id DESC LIMIT 1',
      [title],
    );
    if (!row) throw new Error(`Event "${title}" was submitted but not found in DB after save`);

    return { id: row.id, title: row.title };
  }
}
