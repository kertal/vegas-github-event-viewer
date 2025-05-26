import { ReactNode } from "react"

interface ToastOptions {
  title: string
  description: string | ReactNode
  variant?: "default" | "destructive"
}

export function useToast() {
  const toast = (options: ToastOptions) => {
    // For now, just log to console
    console.log(`[${options.variant || "default"}] ${options.title}: ${options.description}`)
  }

  return { toast }
} 