import { md } from '../theme';

/** Tessera's mark: four tiles of a mosaic, one set in the accent colour. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="3" y="3" width="12" height="12" rx="3" fill={md('primary')} />
      <rect x="17" y="3" width="12" height="12" rx="3" fill={md('secondaryContainer')} />
      <rect x="3" y="17" width="12" height="12" rx="3" fill={md('secondaryContainer')} />
      <rect x="17" y="17" width="12" height="12" rx="3" fill={md('tertiary')} />
    </svg>
  );
}
