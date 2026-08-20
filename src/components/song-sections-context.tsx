"use client";
import { createContext, useContext } from "react";
import type { SongSection } from "@/lib/song-sections";
const SongSectionsContext = createContext<SongSection[]>([]);
export const SongSectionsProvider = SongSectionsContext.Provider;
export function useSongSections() { return useContext(SongSectionsContext); }
