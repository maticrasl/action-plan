/** Reporting a problem or an idea: the details line sent with it (nothing from the plans) and the GitHub links. */

export type SyncWord = 'on' | 'paused' | 'off' | 'not set up';
export interface FeedbackEnv {
  version: string;
  ua: string;
  width: number;
  height: number;
  lang: string;
  installed: boolean;
  sync: SyncWord;
}

// Browser name and major version, and the system, from a user agent. Order matters: Edge and Opera
// also say Chrome, Chrome also says Safari.
export function browserOf(ua: string): string {
  const m =
    ['Edg', 'OPR', 'Firefox', 'FxiOS', 'CriOS', 'Chrome']
      .map(name => new RegExp(`(${name})/(\\d+)`).exec(ua))
      .find(Boolean) ||
    (/Safari\//.test(ua) && /(Version)\/(\d+)/.exec(ua));
  const names: Record<string, string> = {
    Edg: 'Edge',
    OPR: 'Opera',
    FxiOS: 'Firefox',
    CriOS: 'Chrome',
    Version: 'Safari',
  };
  const browser = m ? `${names[m[1]] || m[1]} ${m[2]}` : 'unknown browser';
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /CrOS/.test(ua)
          ? 'ChromeOS'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'unknown system';
  return `${browser} on ${os}`;
}

// Everything but the version, in English: it is read by the app's makers on GitHub.
export const envLine = (e: FeedbackEnv): string =>
  [
    browserOf(e.ua),
    `${e.width}×${e.height}`,
    e.lang,
    `installed: ${e.installed ? 'yes' : 'no'}`,
    `sync: ${e.sync}`,
  ].join(' · ');
export const feedbackDetails = (e: FeedbackEnv): string => `Version ${e.version} · ${envLine(e)}`;

// The issue forms in .github/ISSUE_TEMPLATE fill a field from the query parameter named after its id.
export const feedbackUrl = (repo: string, kind: 'bug' | 'idea', version: string, environment?: string): string =>
  `https://github.com/${repo}/issues/new?template=${kind === 'bug' ? 'bug' : 'feature'}.yml&version=${encodeURIComponent(version)}` +
  (environment === undefined ? '' : `&environment=${encodeURIComponent(environment)}`);
