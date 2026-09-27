/**
 * The window chrome the app draws itself.
 *
 * Windows and Linux draw their caption buttons into an overlay whose height we choose, and they
 * stretch to fill it. It is deliberately shorter than the app bar: matching the bar made the
 * buttons twice the size they are in every other window on the machine.
 */

/** Height of the caption button overlay on Windows and Linux, in pixels. */
export const TITLE_BAR_OVERLAY_HEIGHT = 40;
