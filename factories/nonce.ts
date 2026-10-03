export function nonce(): string {

  // Number used once generator. To generate unique identifiers.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand  = Math.random().toString(16).slice(2, 6);
  return `${stamp}-${rand}`;
}
