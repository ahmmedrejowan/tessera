import { createTheme, type Theme } from '@mui/material/styles';
import type { CSSProperties } from 'react';
import { cssVar, md, mdAlpha, schemeFromSeed, STATE, type Role, type Scheme } from './m3';

/** The Material 3 type scale, as MUI typography variants. */
const TYPE_SCALE = {
  displaySmall: { fontSize: 36, lineHeight: '44px', fontWeight: 400, letterSpacing: 0 },
  headlineLarge: { fontSize: 32, lineHeight: '40px', fontWeight: 400, letterSpacing: 0 },
  headlineMedium: { fontSize: 28, lineHeight: '36px', fontWeight: 400, letterSpacing: 0 },
  headlineSmall: { fontSize: 24, lineHeight: '32px', fontWeight: 400, letterSpacing: 0 },
  titleLarge: { fontSize: 22, lineHeight: '28px', fontWeight: 400, letterSpacing: 0 },
  titleMedium: { fontSize: 16, lineHeight: '24px', fontWeight: 500, letterSpacing: '0.15px' },
  titleSmall: { fontSize: 14, lineHeight: '20px', fontWeight: 500, letterSpacing: '0.1px' },
  labelLarge: { fontSize: 14, lineHeight: '20px', fontWeight: 500, letterSpacing: '0.1px' },
  labelMedium: { fontSize: 12, lineHeight: '16px', fontWeight: 500, letterSpacing: '0.5px' },
  labelSmall: { fontSize: 11, lineHeight: '16px', fontWeight: 500, letterSpacing: '0.5px' },
  bodyLarge: { fontSize: 16, lineHeight: '24px', fontWeight: 400, letterSpacing: '0.5px' },
  bodyMedium: { fontSize: 14, lineHeight: '20px', fontWeight: 400, letterSpacing: '0.25px' },
  bodySmall: { fontSize: 12, lineHeight: '16px', fontWeight: 400, letterSpacing: '0.4px' },
} satisfies Record<string, CSSProperties>;

type M3Variant = keyof typeof TYPE_SCALE;

declare module '@mui/material/styles' {
  interface TypographyVariants extends Record<M3Variant, CSSProperties> {}
  interface TypographyVariantsOptions extends Partial<Record<M3Variant, CSSProperties>> {}
}
declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides extends Record<M3Variant, true> {}
}

export const FONT = '"Roboto Flex Variable", "Roboto Flex", system-ui, -apple-system, "Segoe UI", sans-serif';

/** Material 3 corner radii. */
export const SHAPE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 28, full: 999 } as const;

/** The MUI theme for one scheme. Components read M3 roles through CSS variables set by `schemeCss`. */
export function createAppTheme(scheme: Scheme, dark: boolean): Theme {
  return createTheme({
    palette: {
      mode: dark ? 'dark' : 'light',
      primary: { main: scheme.primary, contrastText: scheme.onPrimary },
      secondary: { main: scheme.secondary, contrastText: scheme.onSecondary },
      error: { main: scheme.error, contrastText: scheme.onError },
      background: { default: scheme.surface, paper: scheme.surfaceContainerLow },
      text: { primary: scheme.onSurface, secondary: scheme.onSurfaceVariant },
      divider: scheme.outlineVariant,
    },
    shape: { borderRadius: SHAPE.md },
    typography: {
      fontFamily: FONT,
      fontSize: 14,
      button: { ...TYPE_SCALE.labelLarge, textTransform: 'none' },
      body1: TYPE_SCALE.bodyMedium,
      body2: TYPE_SCALE.bodySmall,
      ...TYPE_SCALE,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: md('surface'), color: md('onSurface'), overflow: 'hidden', userSelect: 'none' },
          '::selection': { backgroundColor: mdAlpha('primary', 0.3) },
          '*::-webkit-scrollbar': { width: 12, height: 12 },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: mdAlpha('onSurface', 0.2),
            borderRadius: 8,
            border: '3px solid transparent',
            backgroundClip: 'content-box',
          },
          '*::-webkit-scrollbar-thumb:hover': { backgroundColor: mdAlpha('onSurface', 0.35) },
          '*::-webkit-scrollbar-corner': { background: 'transparent' },
          // Hover state layer for grid tiles and list rows (selected ones keep their container colour).
          '.tile:hover:not([aria-selected="true"])': { backgroundColor: mdAlpha('onSurface', STATE.hover) },
        },
      },
      // The M3 variants render as block elements, like MUI's own body and heading variants.
      MuiTypography: {
        defaultProps: {
          variantMapping: {
            displaySmall: 'h1', headlineLarge: 'h1', headlineMedium: 'h2', headlineSmall: 'h2', titleLarge: 'h3', titleMedium: 'h4', titleSmall: 'h5',
            labelLarge: 'p', labelMedium: 'p', labelSmall: 'p', bodyLarge: 'p', bodyMedium: 'p', bodySmall: 'p',
          },
        },
      },
      MuiButtonBase: { defaultProps: { disableRipple: false } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: SHAPE.full, minHeight: 40, paddingInline: 24 },
          sizeSmall: { minHeight: 32, paddingInline: 16 },
          outlined: { borderColor: md('outline') },
        },
      },
      MuiIconButton: { styleOverrides: { root: { color: md('onSurfaceVariant') } } },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: SHAPE.sm, height: 32, ...TYPE_SCALE.labelLarge },
          outlined: { borderColor: md('outlineVariant') },
        },
      },
      MuiTooltip: {
        defaultProps: { enterDelay: 500, disableInteractive: true },
        styleOverrides: {
          tooltip: { backgroundColor: md('inverseSurface'), color: md('inverseOnSurface'), ...TYPE_SCALE.bodySmall, borderRadius: SHAPE.xs, padding: '4px 8px' },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiMenu: { styleOverrides: { paper: { backgroundColor: md('surfaceContainer'), borderRadius: SHAPE.xs } } },
      MuiMenuItem: { styleOverrides: { root: { minHeight: 44, ...TYPE_SCALE.labelLarge } } },
      MuiDialog: { styleOverrides: { paper: { backgroundColor: md('surfaceContainerHigh'), borderRadius: SHAPE.xl, padding: 8 } } },
      MuiDivider: { styleOverrides: { root: { borderColor: md('outlineVariant') } } },
      MuiListItemButton: {
        styleOverrides: {
          root: { borderRadius: SHAPE.full, '&.Mui-selected': { backgroundColor: md('secondaryContainer'), color: md('onSecondaryContainer') } },
        },
      },
      MuiSwitch: { defaultProps: { color: 'primary' } },
      MuiLinearProgress: { styleOverrides: { root: { borderRadius: SHAPE.full, backgroundColor: md('surfaceContainerHighest') } } },
      MuiSnackbarContent: {
        styleOverrides: { root: { backgroundColor: md('inverseSurface'), color: md('inverseOnSurface'), borderRadius: SHAPE.xs } },
      },
    },
  });
}

/** The scheme as `--md-*` CSS variables, for the whole document. */
export function schemeCss(scheme: Scheme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [role, value] of Object.entries(scheme)) out[cssVar(role as Role)] = value;
  return out;
}

export { md, mdAlpha, schemeFromSeed, STATE };
