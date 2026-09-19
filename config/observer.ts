export interface ObserverConfig {
  console: {
    failOn: RegExp[];
    ignore: RegExp[];
  };
  network: {
    banned:             RegExp[];
    failOnScript4xx5xx: boolean;
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
    ignore: [
      /googletagmanager/,
      /google-analytics/,
      /googleapis\.com/,
      /gstatic\.com/,
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
