import { ChevronDown, ChevronRight } from "lucide-react"
import { format } from "date-fns"
import { GitHubEvent } from "../../types/github"
import { prepareReportData } from "../../utils/report-helpers"
import { getEventUrl } from "../../utils/event-helpers"

interface SummaryViewProps {
  events: GitHubEvent[]
  startDate: Date
  endDate: Date
  collapsedSections: Set<string>
  onSectionToggle: (sectionKey: string) => void
}

export function SummaryView({
  events,
  startDate,
  endDate,
  collapsedSections,
  onSectionToggle
}: SummaryViewProps) {
  // Helper function to get actors for a specific item
  const getItemActors = (url: string) => {
    return new Map(
      events
        .filter(e => {
          const eventUrl = e.payload.pull_request?.html_url || 
                         e.payload.issue?.html_url || 
                         e.payload.comment?.html_url
          return eventUrl === url
        })
        .map(e => [e.actor.login, e.actor.avatar_url])
    )
  }

  const reportData = prepareReportData(events)
  
  if (reportData.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        No activity to report in this time range.
      </div>
    )
  }

  // Get unique actors and their avatars
  const actors = new Map<string, string>()
  events.forEach(event => {
    if (!actors.has(event.actor.login)) {
      actors.set(event.actor.login, event.actor.avatar_url)
    }
  })
  
  return (
    <div className="prose dark:prose-invert max-w-none">
      {actors.size > 1 && (
        <>
          <h2 className="text-sm font-semibold text-muted-foreground mt-6 mb-2">Involved People</h2>
          <div className="flex gap-2 items-center mb-4">
            {Array.from(actors.entries()).map(([login, avatarUrl]) => (
              <div
                key={login}
                className="flex items-center gap-1 p-1 rounded-full transition-colors cursor-pointer hover:bg-muted"
                onClick={() => window.open(`https://github.com/${login}`, '_blank')}
                title={`@${login}`}
              >
                <img
                  src={avatarUrl}
                  alt={login}
                  className="w-6 h-6 rounded-full"
                />
                <span className="text-xs text-muted-foreground">@{login}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="space-y-1">
        {reportData.map((item, index) => (
          <div key={index}>
            <div className="font-semibold text-lg mb-2">{item.title}</div>
            <div className="pl-4 space-y-2">
              {item.sections.map((section, sectionIndex) => {
                const sectionKey = `${item.title}-${section.title}`
                const isCollapsed = collapsedSections.has(sectionKey)
                
                return (
                  <div key={sectionIndex} className="mb-2">
                    <div 
                      className="font-medium text-base mb-1 flex items-center gap-2 cursor-pointer hover:text-primary"
                      onClick={() => onSectionToggle(sectionKey)}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      <span>{section.title} ({section.items.length})</span>
                    </div>
                    {!isCollapsed && (
                      <div className="pl-4 space-y-1">
                        {section.items.map((listItem, listIndex) => {
                          const actors = getItemActors(listItem.url)
                          return (
                            <div key={listIndex} className="text-sm flex items-center gap-2">
                              <a href={listItem.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                {listItem.title}
                              </a>
                              <div className="flex -space-x-1">
                                {Array.from(actors.entries()).map(([login, avatarUrl]) => (
                                  <img
                                    key={login}
                                    src={avatarUrl}
                                    alt={login}
                                    title={login}
                                    className="w-5 h-5 rounded-full border-2 border-background"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      window.open(`https://github.com/${login}`, '_blank')
                                    }}
                                    style={{ cursor: 'pointer' }}
                                  />
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
} 