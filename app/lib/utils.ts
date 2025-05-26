import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function truncateMiddle(str: string, maxLength: number = 120): string {
  if (str.length <= maxLength) return str
  const halfLength = Math.floor((maxLength - 3) / 2)
  return `${str.slice(0, halfLength)}...${str.slice(-halfLength)}`
} 