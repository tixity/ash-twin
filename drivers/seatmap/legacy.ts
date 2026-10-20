import type { Frame, Page } from '@playwright/test';
import { WAIT } from '../../pages/web/base';
import type {
  PickResult,
  SeatFilter,
  SeatMapDriver,
  SeatQuery,
  SeatSummary,
  SectionFilter,
  SectionSummary,
} from '../../types/seat';

const seatNumber = (s: SeatSummary): number => parseInt(String(s.label ?? ''), 10) || 0;
const seatIsFree = (s: SeatSummary | undefined): boolean => s?.status === 0;

// Based on squaremaze's Seat::_findConsecutiveSeats + _getSeatsFromSection
// (model.seat.php:1023+). Group seats by (section, row), split each row on
// seat-number jumps > 1 (aisles / missing seats), scan each block for a run
// of N free seats, reject any run that would orphan a single free seat
// (wall or occupied neighbour on either side).
//
// Unlike the SUT which falls back to allowing orphans when no clean group
// exists, this returns null — tests should fail loudly rather than silently
// book an orphan-creating selection. The caller iterates to the next section
// or throws if no section yields a clean pick.
export function sectionBestAvailable(seats: readonly SeatSummary[], n: number): Array<string | number> | null {
  if (n <= 0) return [];
  const sorted = [...seats].sort((a, b) => (
    String(a.sectionUuid ?? '').localeCompare(String(b.sectionUuid ?? '')) ||
    a.rowLabel.length - b.rowLabel.length ||
    a.rowLabel.localeCompare(b.rowLabel) ||
    seatNumber(a) - seatNumber(b)
  ));
  const blocks: SeatSummary[][] = [];
  let current: SeatSummary[] = [];
  for (const s of sorted) {
    const last = current[current.length - 1];
    const sameBlock = last && last.sectionUuid === s.sectionUuid && last.rowLabel === s.rowLabel && seatNumber(s) - seatNumber(last) === 1;
    if (!sameBlock && current.length) { blocks.push(current); current = []; }
    current.push(s);
  }
  if (current.length) blocks.push(current);

  for (const block of blocks) {
    let run: SeatSummary[] = [];
    for (let i = 0; i < block.length; i++) {
      if (!seatIsFree(block[i])) { run = []; continue; }
      run.push(block[i]);
      if (run.length < n) continue;
      if (!orphansCreated(block, i, n)) return run.map(s => s.uuid);
      run = [];
    }
  }
  return null;
}

function orphansCreated(block: readonly SeatSummary[], iEnd: number, n: number): boolean {
  const iStart = iEnd - n + 1;
  const r1 = block[iEnd + 1], r2 = block[iEnd + 2];
  if (seatIsFree(r1) && r2 === undefined)   return true;
  if (seatIsFree(r1) && r2 && !seatIsFree(r2))  return true;
  const l1 = block[iStart - 1], l2 = block[iStart - 2];
  if (seatIsFree(l1) && l2 && !seatIsFree(l2))  return true;
  if (seatIsFree(l1) && iStart - 1 >= 0 && l2 === undefined) return true;
  return false;
}

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
          name:          String(s.attributes?.label?.text ?? s.attributes?.label ?? ''),
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

  async pick(uuids: Array<string | number>): Promise<void> {
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
    for (const sid of new Set(sids.filter((s: unknown): s is string | number => s != null))) {
      await this.enterSection(sid);
    }

    const isSelected = (uuid: string | number) => f.evaluate((id) => {
      const w = window as any;
      return ((w.app?.seatmap?.selection?.items ?? []) as any[]).some(s => s.uuid === id);
    }, uuid);

    const notFound: Array<string | number> = [];
    const notSelected: Array<string | number> = [];
    for (const uuid of uuids) {
      let clicked = false;
      for (let attempt = 0; attempt < 3 && !clicked; attempt++) {
        const target = await this.seatViewportPoint(uuid);
        if (!target) break;
        await this.page.mouse.move(target.x, target.y);
        await this.page.mouse.click(target.x, target.y);
        if (await isSelected(uuid)) { clicked = true; break; }
        await this.page.waitForTimeout(200);
      }
      if (!clicked) {
        const target = await this.seatViewportPoint(uuid);
        if (!target) notFound.push(uuid); else notSelected.push(uuid);
      }
    }

    if (notFound.length > 0)    throw new Error(`seatmap.pick: seats not on map: ${notFound.join(', ')}`);
    if (notSelected.length > 0) throw new Error(`seatmap.pick: renderer refused selection: ${notSelected.join(', ')}`);
  }

  private async seatViewportPoint(uuid: string | number): Promise<{ x: number; y: number } | null> {
    const iframeBox = await this.page.locator(this.iframeSelector).first().boundingBox();
    if (!iframeBox) return null;
    const f = await this.frame();
    const inner = await f.evaluate((id) => {
      const w = window as any;
      const seat = w.app?.seatmap?.seatsAndTableSeats?.find((s: any) => s.uuid === id);
      const node = seat?.shape?.node;
      if (!(node instanceof Element) || !node.isConnected) return null;
      const r = (node as Element).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, uuid);
    if (!inner) return null;
    return { x: iframeBox.x + inner.x, y: iframeBox.y + inner.y };
  }

  // Single entry point. Reads the map, routes to the right pick strategy based
  // on what the renderer actually loaded, then returns a PickResult the caller
  // uses to drive the correct host-page finalisation (confirm vs. qty + addToCart).
  async pickSeats(categoryId: string | number, count: number): Promise<PickResult> {
    const sections = await this.listSections({ categoryId });

    if (sections.length === 0) {
      const pool = await this.list({ categoryId });
      const free = pool.filter(seatIsFree).length;
      if (free < count) {
        throw new Error(`seatmap.pickSeats: only ${free} free seats in category ${categoryId}, needed ${count}`);
      }
      const uuids = sectionBestAvailable(pool, count);
      if (!uuids) throw new Error(`seatmap.pickSeats: no run of ${count} seats found in category ${categoryId} (algo exhausted both passes)`);
      await this.pick(uuids);
      return { kind: 'seats', uuids, sectionUuid: null };
    }

    const specialSection = sections.find(s => s.ga || s.bestAvailable);
    const regularSections = sections.filter(s => !s.ga && !s.bestAvailable);

    if (regularSections.length === 0 && specialSection) {
      throw new Error(`seatmap.pickSeats: category ${categoryId} is GA / best-available — not yet implemented`);
    }

    const pool = await this.list({ categoryId });
    const bySection = new Map<string | number, SeatSummary[]>();
    for (const seat of pool) {
      const key = seat.sectionUuid;
      if (key == null) continue;
      const bucket = bySection.get(key) ?? [];
      bucket.push(seat);
      bySection.set(key, bucket);
    }

    // Match squaremaze's section-name ordering so test picks are deterministic
    // and align with what the SUT would hand a real best-available buyer.
    const ordered = [...regularSections].sort((a, b) => a.name.localeCompare(b.name));

    for (const section of ordered) {
      const sectionPool = bySection.get(section.uuid) ?? [];
      if (sectionPool.filter(seatIsFree).length < count) continue;
      const uuids = sectionBestAvailable(sectionPool, count);
      if (!uuids) continue;
      await this.enterSection(section.uuid);
      await this.pick(uuids);
      return { kind: 'seats', uuids, sectionUuid: section.uuid };
    }

    throw new Error(`seatmap.pickSeats: no section carries ${count} suitable seats for category ${categoryId}`);
  }

  async enterSection(sectionUuid: string | number): Promise<void> {
    const target = await this.sectionViewportPoint(sectionUuid);
    if (!target) throw new Error(`seatmap: no section for ${sectionUuid}`);
    // Cursor goes to the section (visible), then click dispatches on the shape
    // node. SVG `on('click', ...)` handlers fire on the dispatched event; the
    // renderer's section-click body calls `zoomAndCenterBox` and reveals seats.
    await this.page.mouse.move(target.x, target.y);
    const f = await this.frame();
    await f.evaluate((sid) => {
      const w = window as any;
      const node = w.app?.seatmap?.getSectionById?.(sid)?.shape?.node;
      if (node instanceof Element) {
        node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    }, sectionUuid);
    await f.waitForFunction(
      (sid) => {
        const w = window as any;
        const seats = (w.app?.seatmap?.seatsAndTableSeats ?? []) as any[];
        return seats.some(
          s => s.sid === sid && s.shape?.node instanceof Element && s.shape.node.isConnected,
        );
      },
      sectionUuid,
      { timeout: WAIT.MEDIUM },
    );
  }

  private async sectionViewportPoint(uuid: string | number): Promise<{ x: number; y: number } | null> {
    const iframeBox = await this.page.locator(this.iframeSelector).first().boundingBox();
    if (!iframeBox) return null;
    const f = await this.frame();
    const inner = await f.evaluate((sid) => {
      const w = window as any;
      const section = w.app?.seatmap?.getSectionById?.(sid);
      const node = section?.shape?.node;
      if (!(node instanceof Element) || !node.isConnected) return null;
      const r = (node as Element).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, uuid);
    if (!inner) return null;
    return { x: iframeBox.x + inner.x, y: iframeBox.y + inner.y };
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
