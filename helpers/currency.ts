/**
 * Parses a rendered price string (e.g. "AED 100.00", "$ 45.50", "﷼ 100")
 * into its numeric value. Strips every non-digit / non-decimal char and
 * collapses thousands separators. Tenant-agnostic — do not assume a locale.
 */
export function currencyToNumber(text: string): number {
  const stripped = text.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  return parseFloat(stripped);
}
