import { test as base, type Page } from '@playwright/test';
import type { TenantConfig } from '../types/tenant';
import { DbClient } from '../helpers/db_client';
import { Resolver } from '../helpers/resolver';
import { Admin } from '../actors/admin';
import { WebCustomer } from '../actors/web_customer';

export const actorsFixtures = base.extend<{
  db:       DbClient;
  resolver: Resolver;
  admin:    Admin;
  customer: WebCustomer;
}, {
  tenant:       TenantConfig;
  adminPage:    Page;
  customerPage: Page;
}>({
  db: async ({ tenant }, use) => {
    const client = new DbClient(tenant.db);
    await use(client);
    await client.close();
  },

  resolver: async ({ db }, use) => {
    await use(new Resolver(db));
  },

  admin: async ({ adminPage, tenant, db }, use) => {
    await use(new Admin(adminPage, tenant, db));
  },

  customer: async ({ customerPage, tenant, resolver }, use) => {
    await use(new WebCustomer(customerPage, tenant, resolver));
  },
});
