export function req(key: string): string {
  const v = process.env[key];
  if (v === undefined || v === '') {
    throw new Error(`Missing env var ${key} referenced in tenant config`);
  }
  return v;
}

export function optCreds(userKey: string, passwordKey: string): { username: string; password: string } | undefined {
  const u = process.env[userKey];
  const p = process.env[passwordKey];
  if (!u || !p) return undefined;
  return { username: u, password: p };
}
