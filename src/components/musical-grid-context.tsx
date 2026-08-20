"use client";
import { createContext, useContext } from "react";
import type { MusicalGrid } from "@/lib/musical-grid";
const MusicalGridContext = createContext<MusicalGrid | null>(null);
export const MusicalGridProvider = MusicalGridContext.Provider;
export function useMusicalGrid() { return useContext(MusicalGridContext); }
