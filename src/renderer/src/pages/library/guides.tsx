import { create } from 'zustand';
import { RestoreGuide } from '../setup/RestoreGuide';
import { ReceiveGuide } from '../sync/ReceiveGuide';

type Guide = 'receive' | 'restore';

/** Getting a library from another computer or from a backup: from the welcome screen or the switcher. */
export const useGuides = create<{ open: Guide | null; show: (g: Guide) => void; close: () => void }>((set) => ({
  open: null,
  show: (open) => set({ open }),
  close: () => set({ open: null }),
}));

/** Mounted once, for the whole app. */
export function Guides() {
  const open = useGuides((s) => s.open);
  const close = useGuides((s) => s.close);
  return (
    <>
      <ReceiveGuide open={open === 'receive'} onClose={close} />
      <RestoreGuide open={open === 'restore'} onClose={close} />
    </>
  );
}
