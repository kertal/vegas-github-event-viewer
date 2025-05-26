import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "../../../components/ui/button"

interface HeaderProps {
  lastSynced: string | null
}

export function Header({ lastSynced }: HeaderProps) {
  const { theme, setTheme } = useTheme()

  return (
    <header className="flex justify-between items-center mb-6">
      <h1 className="text-2xl font-bold">GitHub Event Viewer</h1>
      <div className="flex items-center gap-4">
        {lastSynced && (
          <span className="text-sm text-muted-foreground">
            Last synced: {new Date(lastSynced).toLocaleTimeString()}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            const newTheme = theme === "dark" ? "light" : "dark"
            setTheme(newTheme)
          }}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
      </div>
    </header>
  )
} 