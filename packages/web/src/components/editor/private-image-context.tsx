"use client";
import { createContext, useContext } from "react";
export const PrivateImageContext = createContext<
  ((src: string) => Promise<string>) | null
>(null);
export function usePrivateImageResolver() {
  return useContext(PrivateImageContext);
}
