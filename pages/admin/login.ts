import type { Page, Locator } from '@playwright/test';

export class AdminLoginPage {
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorStatus: Locator;

  constructor(private page: Page) {
    this.usernameInput = page.locator('input[name="username"], input[name="user"], input[name="email"]').first();
    this.passwordInput = page.locator('input[name="password"]').first();
    this.submitButton  = page.getByRole('button', { name: /sign in|log in|login/i }).first();
    this.errorStatus   = page.locator('#loginStatus.login-status.error, .login-status.error').first();
  }

  async open() {
    await this.page.goto('/admin/');
  }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async errorText(): Promise<string | null> {
    if (await this.errorStatus.count() === 0) return null;
    return (await this.errorStatus.textContent())?.trim() ?? null;
  }
}
