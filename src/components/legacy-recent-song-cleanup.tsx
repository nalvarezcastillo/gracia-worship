"use client";

import { useEffect } from "react";

const LEGACY_RECENT_SONG_STORAGE_KEY = "gracia-worship:recent-song";

export function LegacyRecentSongCleanup() {
  useEffect(() => {
    try {
      window.localStorage.removeItem(LEGACY_RECENT_SONG_STORAGE_KEY);
    } catch {
      // The application remains usable when browser storage is unavailable.
    }
  }, []);

  return null;
}
