import { argbFromHex, Hct, hexFromArgb, MaterialDynamicColors, SchemeTonalSpot } from '@material/material-color-utilities';

/** The Material 3 colour roles the app uses. */
export const ROLES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant', 'surfaceDim', 'surfaceBright',
  'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest',
  'inverseSurface', 'inverseOnSurface', 'inversePrimary',
  'outline', 'outlineVariant', 'scrim', 'shadow',
] as const;

export type Role = (typeof ROLES)[number];
export type Scheme = Record<Role, string>;

/** A full light or dark scheme generated from one seed colour (the "tonal spot" variant Android uses). */
export function schemeFromSeed(seedHex: string, dark: boolean): Scheme {
  const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seedHex)), dark, 0);
  const colors = MaterialDynamicColors as unknown as Record<Role, { getArgb(s: SchemeTonalSpot): number }>;
  const out = {} as Scheme;
  for (const role of ROLES) out[role] = hexFromArgb(colors[role].getArgb(scheme));
  return out;
}

/** CSS custom property name for a role: `surfaceContainerHigh` → `--md-surface-container-high`. */
export const cssVar = (role: Role) => `--md-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/** `var(--md-…)` reference for use in styles. */
export const md = (role: Role) => `var(${cssVar(role)})`;

/** `rgb(from var(--md-…) r g b / a)` — a role at a given opacity, for M3 state layers and tints. */
export const mdAlpha = (role: Role, alpha: number) => `rgb(from ${md(role)} r g b / ${alpha})`;

/** Material 3 state-layer opacities. */
export const STATE = { hover: 0.08, focus: 0.1, pressed: 0.1, dragged: 0.16, disabledContent: 0.38, disabledContainer: 0.12 } as const;
