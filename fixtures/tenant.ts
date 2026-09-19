import { test as base } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { TenantConfig } from '../types/tenant';

const thisDir  = path.dirname(fileURLToPath(import.meta.url));
const SITES_DIR = path.join(thisDir, '..', 'sites');

async function loadTenant(name: string, env: string): Promise<TenantConfig> {
  const file = path.join(SITES_DIR, `${name}.${env}.ts`);
  const url  = pathToFileURL(file).href;
  const mod  = await import(url).catch(() => {
    throw new Error(`Site config not found: ${file}`);
  });
  return mod.default as TenantConfig;
}

export const tenantFixture = base.extend<{ tenant: TenantConfig }>({
  tenant: async ({}, use, testInfo) => {
    const meta = testInfo.project.metadata as { tenant?: string; env?: string } | undefined;
    const name = meta?.tenant ?? process.env.TENANT;
    const env  = meta?.env    ?? process.env.ENV;
    if (!name) throw new Error('tenant name not resolved — set project metadata { tenant } in playwright.config.ts or TENANT env var');
    if (!env)  throw new Error('tenant env not resolved — set project metadata { env } in playwright.config.ts or ENV env var');
    await use(await loadTenant(name, env));
  },
});
