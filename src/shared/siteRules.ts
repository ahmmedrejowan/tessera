/**
 * What the user has told Tessera about a site: "everything on this one is CC0". Packs from that
 * site then arrive with their licence and creator already filled in, whatever their files say.
 */

import type { SiteRule } from './types';

/** The host a link belongs to, without "www.": "https://polyhaven.com/a/x" → "polyhaven.com". */
export function hostOf(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '');
  // A bare word is a typo, not a site.
  return /\.[a-z]{2,}$/i.test(host) ? host : null;
}

const matches = (rule: SiteRule, host: string) => host === rule.host || host.endsWith(`.${rule.host}`);

/** The rule for a link, if the user set one. Subdomains count, and the most exact host wins. */
export function ruleFor(rules: SiteRule[], url: string | null | undefined): SiteRule | null {
  const host = url ? hostOf(url) : null;
  if (!host) return null;
  return rules.filter((r) => matches(r, host)).sort((a, b) => b.host.length - a.host.length)[0] ?? null;
}
