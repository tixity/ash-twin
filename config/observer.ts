export interface HeaderRule {
  name:  RegExp;
  value: RegExp;
}

export interface ObserverConfig {
  console: {
    failOn: RegExp[];
    ignore: RegExp[];
  };
  network: {
    banned:             RegExp[];
    failOnScript4xx5xx: boolean;
    requiredHeaders:    HeaderRule[];
    ignore:             RegExp[];
  };
  cookies: {
    banned:         RegExp[];
    mustBeSecure:   RegExp[];
    mustBeHttpOnly: RegExp[];
    ignore:         RegExp[];
  };
}

export const observerConfig: ObserverConfig = {
  console: {
    failOn: [
      /Uncaught/,
      /is not defined/,
      /Content Security Policy/i, // catches CSP headers in console
    ],
    ignore: [
      /favicon/,
    ],
  },
  network: {
    banned: [
      /jquery1\.8\.3/i,
    ],
    failOnScript4xx5xx: true,
    requiredHeaders: [
      { name: /^strict-transport-security$/i, value: /max-age=\d+/ }, // HSTS on every document response.
      { name: /^content-security-policy$/i,   value: /./ },
    ],
    ignore: [
      /googletagmanager/,
      /google-analytics/,
      /googleapis\.com/,
      /gstatic\.com/,
      /google\.com\/recaptcha/,
      /doubleclick/,
      /facebook\.net/,
      /clarity\.ms/,
      /hotjar/,
    ],
  },
  cookies: {
    banned:         [],
    mustBeSecure:   [],
    mustBeHttpOnly: [],
    ignore: [
      /^_ga/,
      /^_gid/,
      /^_fbp/,
      /^_hjSession/,
      /^cookieconsent_status$/,
    ],
  },
};
