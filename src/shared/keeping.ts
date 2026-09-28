/**
 * Which way of keeping files to put forward, and when to stop and ask.
 *
 * Copy is right for a download and wrong for somebody's whole art drive, and the only thing that
 * tells the two apart before anybody has typed a word is how much there is. So the recommendation
 * follows the size, and the sizes are here, in one place, rather than spread through the page
 * that shows them.
 *
 * Nothing here decides anything. It recommends, and it says when an answer is surprising enough
 * to be worth a second look. The person's choice always wins.
 */

/** A download, a kit, a bundle. Copying this is not a decision worth interrupting. */
export const SMALL = 2 * 1024 * 1024 * 1024;

/**
 * Enough that a second copy is a real cost rather than a rounding error. Above this, indexing
 * where they are is put forward instead, when the files are in a shape that allows it.
 */
export const LARGE = 20 * 1024 * 1024 * 1024;

/** Big enough that copying it is worth stopping for, whatever was chosen. */
export const HUGE = 50 * 1024 * 1024 * 1024;

export type Keeping = 'copy' | 'move' | 'keep';

/**
 * What to put forward for this much, in this shape.
 *
 * Copy unless the size says otherwise, because most of what people add is a download and the
 * default should serve the common case. Past LARGE, and only when every item is a folder (the
 * one shape that can be read where it lies), indexing in place is the better answer and is
 * recommended instead.
 */
export function recommend(bytes: number, canKeep: boolean): Keeping {
  if (canKeep && bytes >= LARGE) return 'keep';
  return 'copy';
}

/** Why that was recommended, in the words the person would use. */
export function whyRecommended(bytes: number, canKeep: boolean): string | null {
  if (recommend(bytes, canKeep) === 'keep') return 'There is a lot here, so reading it where it is saves a second copy of all of it.';
  return null;
}

export interface SecondThought {
  title: string;
  body: string;
  /** What the button that goes ahead anyway should say. */
  goOn: string;
  /** The answer being suggested instead, for the button that takes it. */
  instead: Keeping;
  insteadLabel: string;
}

/**
 * Whether this choice is surprising enough to stop for, and what to offer instead.
 *
 * Only for the mistakes somebody would be cross to discover afterwards: filling a disk with a
 * copy they did not need, or leaving a small download out of their backups for no reason. An
 * ordinary answer never raises one of these, because a dialog that always appears is a dialog
 * nobody reads.
 */
export function secondThought(mode: Keeping, bytes: number, canKeep: boolean, gb = (n: number) => `${Math.round(n / 1024 / 1024 / 1024)} GB`): SecondThought | null {
  if (mode === 'copy' && canKeep && bytes >= HUGE) {
    return {
      title: `That is ${gb(bytes)} to copy`,
      body: `The library will hold its own copy of all of it, so this will take a while and use ${gb(bytes)} more disk. These are folders, so Tessera can read them where they are instead: the record comes into the library and the files stay put. They would not be backed up or synced that way, which is the trade.`,
      goOn: 'Copy it anyway',
      instead: 'keep',
      insteadLabel: 'Read them where they are',
    };
  }
  if (mode === 'keep' && bytes > 0 && bytes < SMALL) {
    return {
      title: 'This is small enough to keep properly',
      body: `It is only ${gb(bytes) === '0 GB' ? 'a few hundred megabytes' : gb(bytes)}. Copying it in costs almost nothing and means it is backed up and synced with everything else, and safe from the folder being moved or tidied away. Reading it where it is makes sense for a lot of files, less so for this.`,
      goOn: 'Read it where it is anyway',
      instead: 'copy',
      insteadLabel: 'Copy it in',
    };
  }
  if (mode === 'move' && bytes >= HUGE) {
    return {
      title: `That is ${gb(bytes)} to move`,
      body: 'Every file is copied in and read back before the original is removed, so this needs room for both at once and will take a while. Nothing is ever removed until its copy is safely in.',
      goOn: 'Move it anyway',
      instead: 'copy',
      insteadLabel: 'Copy instead, and keep the originals',
    };
  }
  return null;
}
