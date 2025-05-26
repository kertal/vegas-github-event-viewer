import { ChevronDown, ChevronUp, ClipboardCopy } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { ViewMode } from "../../types/github"

interface ViewModeSelectorProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onExpandAll?: () => void
  isAllExpanded?: boolean
  onCopyToClipboard?: () => void
}

export function ViewModeSelector({
  viewMode,
  onViewModeChange,
  onExpandAll,
  isAllExpanded,
  onCopyToClipboard
}: ViewModeSelectorProps) {
  return (
    <div className="flex justify-between items-center mb-2">
      <div className="inline-flex rounded-md border border-input bg-background">
        <Button
          variant={viewMode === "timeline" ? "default" : "ghost"}
          size="sm"
          onClick={() => onViewModeChange("timeline")}
          className="rounded-r-none border-r"
        >
          Timeline
        </Button>
        <Button
          variant={viewMode === "grouped" ? "default" : "ghost"}
          size="sm"
          onClick={() => onViewModeChange("grouped")}
          className="rounded-none border-r"
        >
          Grouped
        </Button>
        <Button
          variant={viewMode === "report" ? "default" : "ghost"}
          size="sm"
          onClick={() => onViewModeChange("report")}
          className="rounded-l-none"
        >
          Summary
        </Button>
      </div>
      {viewMode === "grouped" && onExpandAll && (
        <Button
          variant="outline"
          size="sm"
          onClick={onExpandAll}
          className="flex items-center gap-1"
        >
          {isAllExpanded ? (
            <>
              Collapse All
              <ChevronUp className="h-3 w-3" />
            </>
          ) : (
            <>
              Expand All
              <ChevronDown className="h-3 w-3" />
            </>
          )}
        </Button>
      )}
      {viewMode === "report" && onCopyToClipboard && (
        <Button
          variant="outline"
          size="sm"
          onClick={onCopyToClipboard}
          className="flex items-center gap-1"
        >
          <ClipboardCopy className="h-4 w-4" />
          Copy to clipboard
        </Button>
      )}
    </div>
  )
} 