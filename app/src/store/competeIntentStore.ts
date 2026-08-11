import { create } from "zustand";

interface CompeteIntentState {
  openCreateLeague: boolean;
  requestCreateLeague: () => void;
  consumeCreateLeague: () => void;
}

/**
 * Lets a component outside the Compete tab (e.g. a "create a private
 * league" card on Portfolio) trigger CompeteScreen's create-league modal
 * after switching tabs — CompeteScreen consumes the flag on focus. Mirrors
 * overlayStore's "set a flag, another screen reacts to it" pattern.
 */
export const useCompeteIntentStore = create<CompeteIntentState>((set) => ({
  openCreateLeague: false,
  requestCreateLeague: () => set({ openCreateLeague: true }),
  consumeCreateLeague: () => set({ openCreateLeague: false }),
}));
