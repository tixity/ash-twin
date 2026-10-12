import { test, expect } from '../../../helpers/test';
import type { RegisterData } from '../../../types/user';
import { requireTestCustomer } from '../../../helpers/tenant';
import { events } from '../../../helpers/presets/event';


// Native auth vitality specs for default theme AND capetown theme

const validBase = (email?: string): RegisterData => ({
  firstName: 'Ash',
  lastName:  'Twin',
  email:     email ?? `ash.twin.${Date.now()}@example.com`,
  dob:       '1995-04-15',
  phone:     '+971501234567',
  country:   'AE',
  city:      'Dubai',
  address:   'Al Wasl Rd, Jumeirah',
  password:  'StrongPass1',
});

// ── Register form: per-field client-side validation ────────────────────────

test(1, "vitality", async ({ customer }) => {
  const auth = customer.pages.auth;
  await auth.open();
  await auth.fillRegister({ ...validBase(), firstName: '' });
  await auth.submitRegister();
  expect(await auth.hasFieldError('user_firstname')).toBe(true);
  expect(await auth.isOnActivationPage()).toBe(false);
});

test(2, "vitality", async ({ customer }) => {
  const auth = customer.pages.auth;
  await auth.open();
  await auth.fillRegister({ ...validBase(), lastName: '' });
  await auth.submitRegister();
  expect(await auth.hasFieldError('user_lastname')).toBe(true);
});

test(3, "vitality", async ({ customer }) => {
  const auth = customer.pages.auth;
  await auth.open();
  await auth.fillRegister({ ...validBase(), email: 'not-an-email' });
  await auth.submitRegister();
  expect(await auth.hasFieldError('user_email')).toBe(true);
});

test(5, "vitality", async ({ customer }) => {
  const auth = customer.pages.auth;
  await auth.open();
  await auth.fillRegister({ ...validBase(), phone: '' });
  await auth.submitRegister();
  expect(await auth.hasFieldError('user_phone')).toBe(true);
});

test(6, "vitality", async ({ customer }) => {
  // Rule: >=8 chars, at least 1 digit, 1 lowercase, 1 uppercase (`strongPassword`).
  const auth = customer.pages.auth;
  await auth.open();
  await auth.fillRegister({ ...validBase(), password: 'weakpass' });
  await auth.submitRegister();
  expect(await auth.hasFieldError('password1')).toBe(true);
});

test(7, "vitality", async ({ customer }) => {
  const auth = customer.pages.auth;
  await auth.open();
  await auth.fillRegister({
    ...validBase(),
    password:        'StrongPass1',
    passwordConfirm: 'DifferentPass1',
  });
  await auth.submitRegister();
  expect(await auth.hasFieldError('password2')).toBe(true);
});

test(8, "vitality", async ({ customer }) => {
  const auth = customer.pages.auth;
  await auth.open();
  await auth.fillRegister({ ...validBase(), acceptTerms: false });
  await auth.submitRegister();
  expect(await auth.hasFieldError('check_condition')).toBe(true);
});

test(9, "vitality", async ({ customer }) => {
  const auth = customer.pages.auth;
  await auth.open();
  await auth.submitRegister();
  expect(await auth.hasFieldError('user_firstname')).toBe(true);
  expect(await auth.hasFieldError('user_lastname')).toBe(true);
  expect(await auth.hasFieldError('user_email')).toBe(true);
});

test(10, "vitality", async ({ customer }) => {
  const auth = customer.pages.auth;
  await auth.open();
  await auth.fillRegister({ ...validBase(), country: '' });
  await auth.submitRegister();
  expect(await auth.hasFieldError('user_country')).toBe(true);
  expect(await auth.isOnActivationPage()).toBe(false);
});

// ── Signup end-to-end ──────────────────────────────────────────────────────

test(11, "vitality", async ({ customer, db, feedback }) => {
  const email = `ash.twin.${Date.now()}@example.com`;
  const auth  = customer.pages.auth;

  try {
    await auth.open();
    await auth.fillRegister(validBase(email));
    await auth.enableTestCaptchaBypass();
    await auth.submitRegisterProgrammatically();

    // Server persisted the user + auth row — activation hash now available.
    const activationPath = await db.activationUrlFor(email);
    expect(activationPath).toContain('/activation.php?uar=');

    // Follow the activation URL — server clears auth.active and signs the user in.
    await auth.activate(activationPath);

    expect(await db.isUserActive(email)).toBe(true);
    expect(await auth.isSignedIn()).toBe(true);

    feedback(`user ${email} signed up`);
  } finally {
    await db.deleteUserByEmail(email);
  }
});

// ── Login form: validation, rejection, and success ────────────────────────
//
// Login tests rely on `tenant.users.testCustomer` already existing (and being
// activated) in the tenant's DB. Set the creds in `sites/{name}.{env}.json`.

test(12, "vitality", async ({ customer, tenant }) => {
  const creds = tenant.users.testCustomer!;
  const auth  = customer.pages.auth;
  await auth.open();
  await auth.fillLogin({ username: '', password: creds.password });
  await auth.submitLogin();
  expect(await auth.hasLoginFieldError('username')).toBe(true);
  expect(await auth.isSignedIn()).toBe(false);
});

test(13, "vitality", async ({ customer, tenant }) => {
  const creds = tenant.users.testCustomer!;
  const auth  = customer.pages.auth;
  await auth.open();
  await auth.fillLogin({ username: creds.username, password: '' });
  await auth.submitLogin();
  expect(await auth.hasLoginFieldError('password')).toBe(true);
  expect(await auth.isSignedIn()).toBe(false);
});

test(14, "vitality", async ({ customer }) => {
  const auth = customer.pages.auth;
  await auth.open();
  await auth.fillLogin({
    username: 'not.a.real.user@ashtwin.com',
    password: 'DefinitelyWrong1',
  });
  await auth.submitLogin();
  // Client-side validation passes (email format + non-empty), form POSTs.
  // Server rejects → we stay on the auth page, unsigned.
  expect(await auth.isSignedIn()).toBe(false);
});

test(15, "vitality", async ({ customer, tenant, feedback }) => {
  const creds = tenant.users.testCustomer!;
  await customer.login(creds);
  expect(await customer.isSignedIn()).toBe(true);
  feedback(`user ${creds.username} logged in`);
});

test(25, "vitality", async ({ customer, tenant, feedback }) => {
  const creds = requireTestCustomer(tenant);

  await customer.login(creds);
  expect(await customer.isSignedIn()).toBe(true);

  await customer.logout();
  expect(await customer.isSignedIn()).toBe(false);                // DOM: header shows guest state

  await customer.openOrdersHistory();                             // server truth: authenticated route
  expect(await customer.isSignedIn()).toBe(false);                // responds as anonymous

  feedback(`user ${creds.username} logged out`);
});

test(26, "vitality", async ({ customer, resolver, tenant, feedback }) => {
  const creds    = requireTestCustomer(tenant);
  const event    = await resolver.event(events.normal);
  const category = await resolver.category({
    eventId:      event.id,
    numbering:    'none',
    webPublished: true,
    soldout:      false,
  });

  await customer.login(creds);

  await customer.addToCart(event, category, 1);
  expect(await customer.cartItemCount()).toBeGreaterThan(0);

  await customer.logout();
  expect(await customer.cartItemCount()).toBe(0);

  feedback(`user ${creds.username} logged out with cart cleared`);
});
