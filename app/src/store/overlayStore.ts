import { create } from "zustand";

interface OverlayState {
  clubId: string | null;
  open: (clubId: string) => void;
  close: () => void;
}

/** Global "tap any club, anywhere" bottom-sheet overlay, mirroring the prototype's single overlayClubId state. */
export const useClubOverlayStore = create<OverlayState>((set) => ({
  clubId: null,
  open: (clubId) => set({ clubId }),
  close: () => set({ clubId: null }),
}));
