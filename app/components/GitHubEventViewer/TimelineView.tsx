import { ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Card, CardContent } from "../../../components/ui/card"
import { GitHubEvent } from "../../types/github"
import { format } from "date-fns"
import { cn } from "../../lib/utils"
import { getEventEmoji, getEventSummary, getEventUrl } from "../../utils/event-helpers"

interface TimelineViewProps {
  events: GitHubEvent[]
  expandedEvents: Set<string>
  onEventExpand: (eventId: string) => void
}

export function TimelineView({ events, expandedEvents, onEventExpand }: TimelineViewProps) {
  return (
    <>
      {events.map((event) => (
        <Card
          key={event.id}
          className="overflow-hidden transition-all"
        >
          <CardContent className="p-0">
            <div
              className="flex items-start py-2 px-3 cursor-pointer gap-2"
              onClick={() => onEventExpand(event.id)}
            >
              <div className="text-lg mt-1" aria-hidden="true">
                {getEventEmoji(event.type)}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 mt-1">
                {format(new Date(event.created_at), "EEE, MMM d, HH:mm")}
              </span>
              <img
                src={event.actor.avatar_url}
                alt={`${event.actor.login}'s avatar`}
                className="w-5 h-5 rounded-full mt-1"
                onClick={(e) => {
                  e.stopPropagation()
                  window.open(`https://github.com/${event.actor.login}`, '_blank')
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <a
                    href={getEventUrl(event)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium hover:underline truncate"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {getEventSummary(event).summary}
                  </a>
                </div>
                {getEventSummary(event).title && (
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {getEventSummary(event).title}
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation()
                  onEventExpand(event.id)
                }}
              >
                {expandedEvents.has(event.id) ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </Button>
            </div>

            {expandedEvents.has(event.id) && (
              <div className="px-3 pb-2 pt-0">
                <div className="bg-muted p-2 rounded-md overflow-auto max-h-96">
                  <pre className="text-xs">{JSON.stringify(event, null, 2)}</pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </>
  )
} 