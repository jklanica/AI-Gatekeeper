import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Tailwind Class Merger Utility
 * 
 * Combines conditional class names (via clsx) and resolves Tailwind CSS conflicts (via tailwind-merge).
 * 
 * @param {...ClassValue[]} inputs - An array or object of class names to merge.
 * @returns {string} The final compiled class string.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
