import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Noms d'atleta: sempre en majúscules (per coherència a llistes, diplomes i PDFs).
export const nomEnMajuscules = (nom) => String(nom ?? "").trim().replace(/\s+/g, " ").toLocaleUpperCase("ca")
