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

// Driver for the legacy seatmap renderer (window.app inside #seatmapframe).

export class LegacyDriver implements SeatMapDriver {

  private readonly iframeSelector = '#seatmapframe';

  constructor(private readonly page: Page) {}

  // Waits until the seatmap iframe is fully booted and safe to interact with.
  async waitReady(): Promise<void> {
    const f = await this.frame();
    await f.waitForFunction(
      () => {
        const w = window as unknown as { app?: { seatmap?: { seatsAndTableSeats?: unknown[] } }; appConfig?: unknown };
        return !!w.app?.seatmap?.seatsAndTableSeats?.length && !!w.appConfig;
      },
      undefined,
      { timeout: WAIT.LONG },
    );
  }

  // Reads every seat from the loaded map, optionally filtered, returns a flat array.
  async list(filter?: SeatFilter): Promise<SeatSummary[]> {
    const f = await this.frame();
    return f.evaluate((flt) => {
      const w = window as any;
      const seats: any[] = w.app?.seatmap?.seatsAndTableSeats ?? [];
      const toSummary = (s: any): SeatSummary => ({
        uuid:        s.uuid,
        label:       s.attributes?.label ?? '',
        rowLabel:    (s.type === 'table_seat' ? s.table?.attributes?.label : s.row?.attributes?.label) ?? '',
        categoryId:  s.attributes?.categoryId ?? '',
        sectionUuid: s.sid ?? null,
        status:      s.attributes?.status ?? 0,
        type:        s.type,
      });
      return seats
        .filter(s => !flt?.categoryId  || String(s.attributes?.categoryId) === String(flt.categoryId))
        .filter(s => !flt?.sectionUuid || s.sid === flt.sectionUuid)
        .filter(s => !flt?.freeOnly    || s.attributes?.status === 0)
        .map(toSummary);
    }, filter) as Promise<SeatSummary[]>;
  }

  // Reads every section from the map, optionally filtered by category. Covers GA + best-available cases.
  async listSections(filter?: SectionFilter): Promise<SectionSummary[]> {
    const f = await this.frame();
    return f.evaluate((flt) => {
      const w = window as any;
      const raw: any[] = w.app?.seatmap?.sections ?? w.app?.seatmap?.getSections?.() ?? [];
      const toSummary = (s: any): SectionSummary => ({
        uuid:          s.uuid,
        categoryId:    s.attributes?.categoryId ?? s.category?.id ?? '',
        ga:            !!s.attributes?.ga,
        bestAvailable: !!s.category?.bestAvailable,
      });
      return raw
        .filter(s => !flt?.categoryId || String(s.attributes?.categoryId ?? s.category?.id) === String(flt.categoryId))
        .map(toSummary);
    }, filter) as Promise<SectionSummary[]>;
  }

  // Returns exactly one seat matching the query, throws if none match.
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

  //Programmatically selects seats by uuid, mimicking user clicks. Verifies each landed; throws with specifics if any didn't.
  async pick(uuids: string[]): Promise<void> {
    if (uuids.length === 0) return;
    const f = await this.frame();
    const result = await f.evaluate((ids) => {
      const w = window as any;
      const notFound: string[] = [];
      const notSelected: string[] = [];
      for (const id of ids) {
        const seat = w.app.seatmap.seatsAndTableSeats.find((s: any) => s.uuid === id);
        if (!seat) { notFound.push(id); continue; }
        w.app.seatmap.selection?.toggle?.(seat, true);
        w.appConfig?.rendererdata?.onSeatSelect?.(seat);
        const items: any[] = w.app.seatmap.selection?.items ?? [];
        if (!items.some((s: any) => s.uuid === id)) notSelected.push(id);
      }
      return { notFound, notSelected };
    }, uuids);
    if (result.notFound.length > 0) {
      throw new Error(`seatmap.pick: seats not on map: ${result.notFound.join(', ')}`);
    }
    if (result.notSelected.length > 0) {
      throw new Error(`seatmap.pick: renderer refused selection: ${result.notSelected.join(', ')}`);
    }
  }

  // First-N free seats in a category, optionally scoped to one section. No adjacency guarantee.
  async pickFirstN(categoryId: string | number, count: number, sectionUuid?: string): Promise<void> {
    const free = await this.list({ categoryId, sectionUuid, freeOnly: true });
    if (free.length < count) {
      const scope = sectionUuid ? `section ${sectionUuid} of category ${categoryId}` : `category ${categoryId}`;
      throw new Error(`seatmap: only ${free.length} free seats in ${scope}, needed ${count}`);
    }
    await this.pick(free.slice(0, count).map(s => s.uuid));
  }

  // First-N free seats in a specific section, any category.
  async pickInSection(sectionUuid: string, count: number): Promise<void> {
    const free = await this.list({ sectionUuid, freeOnly: true });
    if (free.length < count) {
      throw new Error(`seatmap: only ${free.length} free seats in section ${sectionUuid}, needed ${count}`);
    }
    await this.pick(free.slice(0, count).map(s => s.uuid));
  }

  // Enters a section to trigger SquareMaze's best-available flow (caller then sets quantity + adds to cart).
  async enterSection(sectionUuid: string): Promise<void> {
    const f = await this.frame();
    await f.evaluate((sid) => {
      const w = window as any;
      const section = w.app?.seatmap?.getSectionById?.(sid);
      if (!section) throw new Error(`seatmap: no section ${sid}`);
      if (typeof w.app.seatmap.selectSection === 'function') {
        w.app.seatmap.selectSection(section);
        return;
      }
      const isBestAvailable = section.category?.bestAvailable ?? false;
      w.appConfig?.rendererdata?.onSectionClick?.(section, isBestAvailable);
      w.appConfig?.rendererdata?.onSectionSwitch?.(section, true);
    }, sectionUuid);
  }

  // Dispatches to the right pick method based on strategy.kind.
  async pickByStrategy(strategy: SelectionStrategy): Promise<void> {
    switch (strategy.kind) {
      case 'seats':           return this.pick(strategy.uuids);
      case 'first-n':         return this.pickFirstN(strategy.categoryId, strategy.count, strategy.sectionUuid);
      case 'section':         return this.pickInSection(strategy.sectionUuid, strategy.count);
      case 'best-available':  return this.enterSection(strategy.sectionUuid);
    }
  }

  // Returns the seats currently in the map's selection set.
  async selection(): Promise<SeatSummary[]> {
    const f = await this.frame();
    return f.evaluate(() => {
      const w = window as any;
      const items: any[] = w.app?.seatmap?.selection?.items ?? [];
      return items.map((s: any): SeatSummary => ({
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

  // Deselects every seat currently selected.
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

  // Resolves the iframe and hands back its Frame (the inside), for running JS in the map's context.
  private async frame(): Promise<Frame> {
    const el = this.page.locator(this.iframeSelector);
    await el.waitFor({ state: 'attached', timeout: WAIT.MEDIUM });
    const handle = await el.elementHandle();
    const frame  = await handle?.contentFrame();
    if (!frame) throw new Error(`seatmap: ${this.iframeSelector} has no contentFrame`);
    return frame;
  }
}
