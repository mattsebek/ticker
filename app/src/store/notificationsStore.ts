import { create } from "zustand";
import { Platform } from "react-native";
import { api } from "../api/client";
import { requestPushPermissionAndGetToken } from "../notifications/push";

interface NotificationsState {
  enabled: boolean;
  busy: boolean;
  /** A token requested before the user is authed (e.g. from the onboarding carousel) — flushed to the server once auth completes. */
  pendingToken: string | null;
  hydrate: () => Promise<void>;
  /** Device-level only — no server call. Safe to call before the user is registered/logged in. Returns whether permission was actually granted. */
  requestPermissionOnly: () => Promise<boolean>;
  /** Registers the stashed pendingToken (if any) and turns notifications on server-side. Call once authed. */
  flushPendingTokenIfAny: () => Promise<void>;
  /** Full authed flow used by the Profile toggle: request permission, register the token, enable. */
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

const platform: "ios" | "android" = Platform.OS === "android" ? "android" : "ios";

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  enabled: false,
  busy: false,
  pendingToken: null,

  hydrate: async () => {
    try {
      const { enabled } = await api.notifications.status();
      set({ enabled });
    } catch {
      // not authed yet, or a transient failure — leave the default
    }
  },

  requestPermissionOnly: async () => {
    const token = await requestPushPermissionAndGetToken();
    if (token) set({ pendingToken: token });
    return !!token;
  },

  flushPendingTokenIfAny: async () => {
    const token = get().pendingToken;
    if (!token) return;
    try {
      await api.notifications.registerToken(token, platform);
      await api.notifications.setEnabled(true);
      set({ pendingToken: null, enabled: true });
    } catch {
      // will retry next time flushPendingTokenIfAny runs (pendingToken stays set)
    }
  },

  enable: async () => {
    set({ busy: true });
    try {
      const token = await requestPushPermissionAndGetToken();
      if (token) await api.notifications.registerToken(token, platform);
      await api.notifications.setEnabled(true);
      set({ enabled: true, busy: false });
    } catch {
      set({ busy: false });
    }
  },

  disable: async () => {
    set({ busy: true });
    try {
      await api.notifications.setEnabled(false);
      set({ enabled: false, busy: false });
    } catch {
      set({ busy: false });
    }
  },
}));
