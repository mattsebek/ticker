import { create } from "zustand";
import { api, ApiError } from "../api/client";
import { getToken, loadStoredToken, storeToken } from "../api/session";
import { useDataStore } from "./dataStore";
import type { User } from "../api/types";

interface AuthState {
  hydrated: boolean;
  user: User | null;
  error: string | null;
  busy: boolean;
  /** Email a code was just sent to — set by requestRegisterCode/requestLoginCode, consumed by verifyCode. */
  pendingEmail: string | null;
  hydrate: () => Promise<void>;
  requestRegisterCode: (name: string, email: string, birthday: string) => Promise<boolean>;
  requestLoginCode: (email: string) => Promise<boolean>;
  verifyCode: (code: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  hydrated: false,
  user: null,
  error: null,
  busy: false,
  pendingEmail: null,

  hydrate: async () => {
    const token = await loadStoredToken();
    if (!token) return set({ hydrated: true });
    try {
      const { user } = await api.auth.me();
      set({ user, hydrated: true });
    } catch {
      await storeToken(null);
      set({ hydrated: true });
    }
  },

  requestRegisterCode: async (name, email, birthday) => {
    set({ busy: true, error: null });
    try {
      const { email: confirmedEmail } = await api.auth.register(name, email, birthday);
      set({ busy: false, pendingEmail: confirmedEmail });
      return true;
    } catch (e) {
      set({ busy: false, error: e instanceof ApiError ? e.message : "Something went wrong. Try again." });
      return false;
    }
  },

  requestLoginCode: async (email) => {
    set({ busy: true, error: null });
    try {
      const { email: confirmedEmail } = await api.auth.login(email);
      set({ busy: false, pendingEmail: confirmedEmail });
      return true;
    } catch (e) {
      set({ busy: false, error: e instanceof ApiError ? e.message : "Something went wrong. Try again." });
      return false;
    }
  },

  verifyCode: async (code) => {
    const email = get().pendingEmail;
    if (!email) {
      set({ error: "Request a new code and try again." });
      return false;
    }
    set({ busy: true, error: null });
    try {
      const { token, user } = await api.auth.verifyCode(email, code);
      await storeToken(token);
      set({ user, busy: false, pendingEmail: null });
      return true;
    } catch (e) {
      set({ busy: false, error: e instanceof ApiError ? e.message : "Something went wrong. Try again." });
      return false;
    }
  },

  logout: async () => {
    // Await the token removal (and clear any in-flight-stale portfolio/clubs
    // data) before flipping `user` to null, so a fast logout->login sequence
    // can't race a stale AsyncStorage write against the next login's token.
    try {
      await storeToken(null);
    } catch {
      // even if the storage write fails, the user still needs to be logged
      // out of the UI — the in-memory token is already cleared by storeToken.
    }
    useDataStore.getState().reset();
    set({ user: null });
  },

  refreshUser: async () => {
    if (!getToken()) return;
    try {
      const { user } = await api.auth.me();
      set({ user });
    } catch {
      // ignore transient refresh failures
    }
  },

  setUser: (user) => set({ user }),
  clearError: () => set({ error: null }),
}));
