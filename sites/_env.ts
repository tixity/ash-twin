export function req(key: string): string {
  const v = process.env[key];
  if (v === undefined || v === '') {
    throw new Error(`Missing env var ${key} referenced in tenant config`);
  }
  return v;
}
