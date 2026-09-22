import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import { create } from 'zustand';

interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

interface ToastState {
  current: Toast | null;
  show(message: string, action?: Toast['action']): void;
  hide(): void;
}

/** One short message at the bottom of the window, with at most one action (Material snackbar). */
export const useToast = create<ToastState>((set) => ({
  current: null,
  show: (message, action) => set({ current: { id: Date.now(), message, ...(action ? { action } : {}) } }),
  hide: () => set({ current: null }),
}));

export const toast = (message: string, action?: Toast['action']) => useToast.getState().show(message, action);

export function ToastHost() {
  const { current, hide } = useToast();
  return (
    <Snackbar
      key={current?.id}
      open={!!current}
      autoHideDuration={current?.action ? 8000 : 4000}
      onClose={(_, reason) => reason !== 'clickaway' && hide()}
      message={current?.message}
      // Bottom-left, clear of the rail and of the selection bar in the middle.
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      sx={{ left: { sm: 112 } }}
      action={
        current?.action && (
          <Button
            size="small"
            sx={{ color: 'var(--md-inverse-primary)' }}
            onClick={() => {
              current.action!.run();
              hide();
            }}
          >
            {current.action.label}
          </Button>
        )
      }
    />
  );
}
