/**
 * Contract for a single (tenant × env) configuration.
 * Loaded from sites/{name}.{env}.json by fixtures/tenant.ts.
 */
export interface TenantConfig {
  name: string;
  env: 'local' | 'staging' | 'prod';
  theme: 'default' | 'capetown' | 'next';

  baseUrl: string;

  webUrl: string;

  users: TenantUsers;
  db: TenantDb;
}

export interface TenantUsers {
  superadmin:    UserCreds;
  cashier?:      UserCreds;
  scanner?:      UserCreds;
  organizer?:    UserCreds;
  testCustomer?: UserCreds;
}

export interface UserCreds {
  username: string;
  password: string;
}

export interface TenantDb {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Derived touchpoint URLs — computed from baseUrl + known paths.
 * Framework code should use these instead of hand-concatenating paths.
 */
export function touchpointUrls(tenant: TenantConfig) {
  return {
    admin:     `${tenant.baseUrl}/admin/`,
    pos:       `${tenant.baseUrl}/pos`,
    dashboard: `${tenant.baseUrl}/dashboard`,
    scanner:   `${tenant.baseUrl}/scan`,
    web:       tenant.webUrl,
  };
}
