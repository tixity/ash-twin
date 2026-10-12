import { test as base } from '@playwright/test';

export type FeedbackRow =
  | { label: string; value: string | number | boolean | null | undefined }
  | string;

export interface FeedbackReport {
  /** One-line summary — becomes the heading. */
  summary: string;
  /** Pass / fail bullet. Defaults to ✓ when `ok` true, ✗ otherwise. */
  ok?: boolean;
  /** Structured rows rendered as aligned `label: value` pairs. Strings pass through. */
  rows?: FeedbackRow[];
}

/**
 * Feedback — the ash-twin channel for per-test narrative. Appears in the HTML
 * report under annotations and is grouped with Observer's own feedback entries.
 *
 * - `feedback(msg)` — a single line, legacy shape.
 * - `feedback.report({...})` — structured block (bullet + heading + rows).
 */
export interface Feedback {
  (message: string): void;
  report(r: FeedbackReport): void;
}

export const feedbackFixtures = base.extend<{ feedback: Feedback }>({
  feedback: async ({}, use, testInfo) => {
    const emit = (message: string) => {
      testInfo.annotations.push({ type: 'feedback', description: message });
    };
    const fb = emit as Feedback;
    fb.report = (r: FeedbackReport) => emit(formatReport(r));
    await use(fb);
  },
});

function formatReport(r: FeedbackReport): string {
  const bullet = r.ok === false ? '✗' : r.ok === true ? '✓' : '•';
  const lines = [`${bullet} ${r.summary}`];
  if (r.rows && r.rows.length > 0) {
    const pairs = r.rows.filter((row): row is Exclude<FeedbackRow, string> => typeof row !== 'string');
    const width = pairs.reduce((max, row) => Math.max(max, row.label.length), 0);
    for (const row of r.rows) {
      if (typeof row === 'string') {
        lines.push(`    ${row}`);
      } else {
        lines.push(`    ${row.label.padEnd(width)}  ${formatValue(row.value)}`);
      }
    }
  }
  return lines.join('\n');
}

function formatValue(v: string | number | boolean | null | undefined): string {
  if (v === null)      return 'null';
  if (v === undefined) return '<unset>';
  return String(v);
}
