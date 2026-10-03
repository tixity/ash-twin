import type { Frame, Page } from '@playwright/test';
import { WAIT } from '../../pages/web/base';
import type {
  SeatFilter,
  SeatMapDriver,
  SeatQuery,
  SeatSummary,
  SectionFilter,
  SectionSummary,
  SelectionStrategy,
} from '../../types/seat';

export class LegacyDriver implements SeatMapDriver {
  // Inline (#seatmapframe) for pm_load=1/2, modal (.fancybox-iframe) for pm_load=0.
  private readonly iframeSelector = '#seatmapframe, .fancybox-iframe';

  constructor(private readonly page: Page) {}

  async waitReady(): Promise<void> {
    const f = await this.frame();
    await f.waitForFunction(
      () => {
        const w = window as any;
        return !!w.app?.seatmap?.seatsAndTableSeats?.length && !!w.appConfig;
      },
      undefined,
      { timeout: WAIT.LONG },
    );
  }

  async list(filter?: SeatFilter): Promise<SeatSummary[]> {
    const f = await this.frame();
    return f.evaluate((flt) => {
      const w = window as any;
      const seats: any[] = w.app?.seatmap?.seatsAndTableSeats ?? [];
      const sidOf = (s: any) => s?.sid ?? s?.section?.uuid ?? null;
      return seats
        .filter(s => !flt?.categoryId  || String(s.attributes?.categoryId) === String(flt.categoryId))
        .filter(s => !flt?.sectionUuid || sidOf(s) === flt.sectionUuid)
        .filter(s => !flt?.freeOnly    || s.attributes?.status === 0)
        .map(s => ({
          uuid:        s.uuid,
          label:       s.attributes?.label ?? '',
          rowLabel:    (s.type === 'table_seat' ? s.table?.attributes?.label : s.row?.attributes?.label) ?? '',
          categoryId:  s.attributes?.categoryId ?? '',
          sectionUuid: sidOf(s),
          status:      s.attributes?.status ?? 0,
          type:        s.type,
        }));
    }, filter) as Promise<SeatSummary[]>;
  }

  async listSections(filter?: SectionFilter): Promise<SectionSummary[]> {
    const f = await this.frame();
    return f.evaluate((flt) => {
      const w = window as any;
      const raw: any[] = w.app?.seatmap?.sections ?? w.app?.seatmap?.getSections?.() ?? [];
      return raw
        .filter(s => !flt?.categoryId || String(s.attributes?.categoryId ?? s.category?.id) === String(flt.categoryId))
        .map(s => ({
          uuid:          s.uuid,
          categoryId:    s.attributes?.categoryId ?? s.category?.id ?? '',
          ga:            !!s.attributes?.ga,
          bestAvailable: !!s.category?.bestAvailable,
        }));
    }, filter) as Promise<SectionSummary[]>;
  }

  async find(query: SeatQuery): Promise<SeatSummary> {
    const all = await this.list();
    const match = all.find(s =>
      (!query.uuid     || s.uuid     === query.uuid) &&
      (!query.rowLabel || s.rowLabel === query.rowLabel) &&
      (!query.label    || s.label    === query.label),
    );
    if (!match) throw new Error(`seatmap: no seat matches ${JSON.stringify(query)}`);
    return match;
  }

  async pick(uuids: string[]): Promise<void> {
    if (uuids.length === 0) return;
    const f = await this.frame();

    const sids = await f.evaluate((ids) => {
      const w = window as any;
      const seats = (w.app?.seatmap?.seatsAndTableSeats ?? []) as any[];
      return ids.map(id => {
        const seat = seats.find(s => s.uuid === id);
        return seat?.sid ?? seat?.section?.uuid ?? null;
      });
    }, uuids);
    for (const sid of new Set(sids.filter((s): s is string => !!s))) {
      await this.enterSection(sid);
    }

    const notFound: string[] = [];
    for (const uuid of uuids) {
      const handle = await f.evaluateHandle((id) => {
        const w = window as any;
        const seat = w.app?.seatmap?.seatsAndTableSeats?.find((s: any) => s.uuid === id);
        const node = seat?.shape?.node;
        return node instanceof Element ? node : null;
      }, uuid);
      const el = handle.asElement();
      if (!el) { await handle.dispose(); notFound.push(uuid); continue; }
      // Seats sit under transparent overlay layers, bypass actionability.
      await el.click({ force: true });
      await handle.dispose();
    }

    const selected = await f.evaluate(() => {
      const w = window as any;
      return ((w.app?.seatmap?.selection?.items ?? []) as any[]).map(s => s.uuid);
    });
    const notSelected = uuids.filter(u => !notFound.includes(u) && !selected.includes(u));
    if (notFound.length > 0)    throw new Error(`seatmap.pick: seats not on map: ${notFound.join(', ')}`);
    if (notSelected.length > 0) throw new Error(`seatmap.pick: renderer refused selection: ${notSelected.join(', ')}`);
  }

  async pickFirstN(categoryId: string | number, count: number, sectionUuid?: string): Promise<void> {
    const free = await this.list({ categoryId, sectionUuid, freeOnly: true });
    if (free.length < count) {
      const scope = sectionUuid ? `section ${sectionUuid} of category ${categoryId}` : `category ${categoryId}`;
      throw new Error(`seatmap: only ${free.length} free seats in ${scope}, needed ${count}`);
    }
    await this.pick(free.slice(0, count).map(s => s.uuid));
  }

  async pickInSection(sectionUuid: string, count: number): Promise<void> {
    const free = await this.list({ sectionUuid, freeOnly: true });
    if (free.length < count) {
      throw new Error(`seatmap: only ${free.length} free seats in section ${sectionUuid}, needed ${count}`);
    }
    await this.pick(free.slice(0, count).map(s => s.uuid));
  }

  async enterSection(sectionUuid: string): Promise<void> {
    const f = await this.frame();
    const handle = await f.evaluateHandle((sid) => {
      const w = window as any;
      const section = w.app?.seatmap?.getSectionById?.(sid);
      const node = section?.shape?.node;
      return node instanceof Element ? node : null;
    }, sectionUuid);
    const el = handle.asElement();
    if (!el) { await handle.dispose(); throw new Error(`seatmap: no section shape for ${sectionUuid}`); }
    await el.click({ force: true });
    await handle.dispose();
    // Wait for zoom-reveal to draw seat shapes, then let the animation settle —
    // shapes get swapped during the transition and a click on a mid-animation
    // handle throws "Element is not attached to the DOM".
    await f.waitForFunction(
      (sid) => {
        const w = window as any;
        const seats = (w.app?.seatmap?.seatsAndTableSeats ?? []) as any[];
        return seats.some(s => s.sid === sid && s.shape?.node instanceof Element);
      },
      sectionUuid,
      { timeout: WAIT.MEDIUM },
    );
    await this.page.waitForTimeout(300);
  }

  async pickByStrategy(strategy: SelectionStrategy): Promise<void> {
    switch (strategy.kind) {
      case 'seats':          return this.pick(strategy.uuids);
      case 'first-n':        return this.pickFirstN(strategy.categoryId, strategy.count, strategy.sectionUuid);
      case 'section':        return this.pickInSection(strategy.sectionUuid, strategy.count);
      case 'best-available': return this.enterSection(strategy.sectionUuid);
    }
  }

  async selection(): Promise<SeatSummary[]> {
    const f = await this.frame();
    return f.evaluate(() => {
      const w = window as any;
      const items: any[] = w.app?.seatmap?.selection?.items ?? [];
      return items.map(s => ({
        uuid:        s.uuid,
        label:       s.attributes?.label ?? '',
        rowLabel:    (s.type === 'table_seat' ? s.table?.attributes?.label : s.row?.attributes?.label) ?? '',
        categoryId:  s.attributes?.categoryId ?? '',
        sectionUuid: s.sid ?? null,
        status:      s.attributes?.status ?? 0,
        type:        s.type,
      }));
    }) as Promise<SeatSummary[]>;
  }

  async clearSelection(): Promise<void> {
    const current = await this.selection();
    if (current.length === 0) return;
    const f = await this.frame();
    await f.evaluate((ids) => {
      const w = window as any;
      for (const id of ids) {
        const seat = w.app.seatmap.seatsAndTableSeats.find((s: any) => s.uuid === id);
        if (!seat) continue;
        w.app.seatmap.selection?.toggle?.(seat, false);
        w.appConfig?.rendererdata?.onSeatDeselect?.(seat);
      }
    }, current.map(s => s.uuid));
  }

  private async frame(): Promise<Frame> {
    const iframe = this.page.locator(this.iframeSelector).first();
    await iframe.waitFor({ state: 'attached', timeout: WAIT.MEDIUM });
    const handle = await iframe.elementHandle();
    const frame  = await handle?.contentFrame();
    if (!frame) throw new Error(`seatmap: iframe has no contentFrame`);
    return frame;
  }
}
