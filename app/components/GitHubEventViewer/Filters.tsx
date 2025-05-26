import { ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Card, CardContent } from "../../../components/ui/card"
import { GitHubEvent, EventCategory } from "../../types/github"

interface FiltersProps {
  events: GitHubEvent[]
  showFilters: boolean
  onShowFiltersChange: (show: boolean) => void
  selectedRepos: Set<string>
  onRepoToggle: (repo: string) => void
  selectedEventTypes: Set<string>
  onEventTypeToggle: (category: EventCategory) => void
  selectedLabels: Set<string>
  onLabelToggle: (label: string) => void
  selectedUsername: string | null
  onUsernameSelect: (username: string | null) => void
  usernames: string[]
  getUniqueRepos: (events: GitHubEvent[]) => string[]
  getUniqueLabels: (events: GitHubEvent[]) => string[]
  EVENT_TYPES: Record<EventCategory, string[]>
  clearAllFilters: () => void
}

export function Filters({
  events,
  showFilters,
  onShowFiltersChange,
  selectedRepos,
  onRepoToggle,
  selectedEventTypes,
  onEventTypeToggle,
  selectedLabels,
  onLabelToggle,
  selectedUsername,
  onUsernameSelect,
  usernames,
  getUniqueRepos,
  getUniqueLabels,
  EVENT_TYPES,
  clearAllFilters
}: FiltersProps) {
  const getFilterDescription = () => {
    const parts = []
    if (selectedRepos.size > 0) {
      parts.push(`${selectedRepos.size} repository${selectedRepos.size > 1 ? 'ies' : ''}`)
    }
    if (selectedEventTypes.size > 0) {
      parts.push(`${selectedEventTypes.size} event type${selectedEventTypes.size > 1 ? 's' : ''}`)
    }
    if (selectedLabels.size > 0) {
      parts.push(`${selectedLabels.size} label${selectedLabels.size > 1 ? 's' : ''}`)
    }
    return parts.length > 0 ? parts.join(', ') : "No filters"
  }

  const getActiveFilterCount = () => {
    return selectedRepos.size + selectedEventTypes.size + selectedLabels.size
  }

  return (
    <Card className="mb-6">
      <CardContent className="pt-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Filters</label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onShowFiltersChange(!showFilters)}
              className="flex items-center gap-2 text-muted-foreground"
            >
              <span className="text-xs">
                {selectedUsername ? `@${selectedUsername}, ` : ""}{getFilterDescription()}
              </span>
              {(getActiveFilterCount() > 0 || selectedUsername) && !showFilters && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    clearAllFilters()
                  }}
                  className="text-xs text-blue-500 hover:text-blue-600 hover:underline ml-2"
                >
                  Clear all
                </button>
              )}
              {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </div>
          {showFilters && (
            <div className="space-y-2 pt-1">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Repositories</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {getUniqueRepos(events).map(repo => (
                    <Button
                      key={repo}
                      type="button"
                      variant={selectedRepos.has(repo) ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => onRepoToggle(repo)}
                    >
                      {repo}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Event Types</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {Object.entries(EVENT_TYPES).map(([category, types]) => (
                    <Button
                      key={category}
                      type="button"
                      variant={selectedEventTypes.has(category) ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => onEventTypeToggle(category as EventCategory)}
                    >
                      {category} ({events.filter(e => types.includes(e.type)).length})
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Labels</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {getUniqueLabels(events).map(label => (
                    <Button
                      key={label}
                      type="button"
                      variant={selectedLabels.has(label) ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => onLabelToggle(label)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {usernames.length > 1 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">GitHub Users</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {usernames.map(username => (
                      <Button
                        key={username}
                        type="button"
                        variant={selectedUsername === username ? "default" : "outline"}
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => onUsernameSelect(selectedUsername === username ? null : username)}
                      >
                        @{username}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
} 