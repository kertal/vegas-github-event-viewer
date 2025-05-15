"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Moon, Sun, RefreshCw, ClipboardCopy, ChevronDown, ChevronUp } from "lucide-react"
import { format, subDays } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { useToast } from "@/hooks/use-toast"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

// Types
interface GitHubEvent {
  id: string
  type: string
  created_at: string
  actor: {
    login: string
    avatar_url: string
    url: string
  }
  repo: {
    name: string
    url: string
  }
  payload: any
}

// Update the UserPreferences interface to include selectedEvents and expandedEvents
interface UserPreferences {
  username: string
  startDate: string
  endDate: string
  viewMode: "compact" | "expanded"
  selectedEvents: string[]
  expandedEvents: string[]
  lastTheme: string
}

export default function GitHubEventViewer() {
  // State
  const [events, setEvents] = useState<GitHubEvent[]>([])
  const [username, setUsername] = useState("")
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 4))
  const [endDate, setEndDate] = useState<Date>(new Date())
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<"compact" | "expanded">("compact")

  const { theme, setTheme } = useTheme()
  const { toast } = useToast()

  // Load user preferences from localStorage on mount
  // Update the useEffect that loads preferences to include all values
  useEffect(() => {
    const savedPrefs = localStorage.getItem("github-event-viewer-prefs")
    if (savedPrefs) {
      try {
        const prefs: UserPreferences = JSON.parse(savedPrefs)
        setUsername(prefs.username || "")
        setStartDate(prefs.startDate ? new Date(prefs.startDate) : subDays(new Date(), 4))
        setEndDate(prefs.endDate ? new Date(prefs.endDate) : new Date())
        setViewMode(prefs.viewMode || "compact")

        // Restore selected and expanded events
        if (prefs.selectedEvents) {
          setSelectedEvents(new Set(prefs.selectedEvents))
        }

        if (prefs.expandedEvents) {
          setExpandedEvents(new Set(prefs.expandedEvents))
        }
      } catch (error) {
        console.error("Error parsing saved preferences:", error)
      }
    }

    // Load cached events
    const cachedEvents = localStorage.getItem("github-event-cache")
    if (cachedEvents) {
      try {
        setEvents(JSON.parse(cachedEvents))
      } catch (error) {
        console.error("Error parsing cached events:", error)
      }
    }

    const lastSync = localStorage.getItem("github-event-last-synced")
    if (lastSync) {
      setLastSynced(lastSync)
    }
  }, [])

  // Save preferences to localStorage when they change
  // Update the useEffect that saves preferences to include all values
  useEffect(() => {
    const prefs: UserPreferences = {
      username,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      viewMode,
      selectedEvents: Array.from(selectedEvents),
      expandedEvents: Array.from(expandedEvents),
      lastTheme: theme || "system",
    }
    localStorage.setItem("github-event-viewer-prefs", JSON.stringify(prefs))
  }, [username, startDate, endDate, viewMode, selectedEvents, expandedEvents, theme])

  // Fetch events from GitHub API
  const fetchEvents = async () => {
    if (!username) return

    setIsSyncing(true)
    try {
      const response = await fetch(`https://api.github.com/users/${username}/events?per_page=100`)

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`)
      }

      const data: GitHubEvent[] = await response.json()

      // Filter events by date range
      const filteredEvents = data.filter((event) => {
        const eventDate = new Date(event.created_at)
        return eventDate >= startDate && eventDate <= endDate
      })

      // Sort events newest to oldest
      filteredEvents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      setEvents(filteredEvents)

      // Cache events in localStorage
      localStorage.setItem("github-event-cache", JSON.stringify(filteredEvents))

      const now = new Date().toISOString()
      setLastSynced(now)
      localStorage.setItem("github-event-last-synced", now)

      toast({
        title: "Events synced",
        description: `Fetched ${filteredEvents.length} events for ${username}`,
      })
    } catch (error) {
      console.error("Error fetching GitHub events:", error)
      toast({
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Failed to fetch events",
        variant: "destructive",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchEvents()
  }

  // Set date range presets
  const setDateRange = (preset: "today" | "week" | "month") => {
    const end = new Date()
    let start: Date

    switch (preset) {
      case "today":
        start = new Date()
        start.setHours(0, 0, 0, 0)
        break
      case "week":
        start = subDays(new Date(), 7)
        break
      case "month":
        start = subDays(new Date(), 30)
        break
      default:
        start = subDays(new Date(), 4)
    }

    setStartDate(start)
    setEndDate(end)
  }

  // Toggle raw JSON view for an event
  const toggleEventExpansion = (eventId: string) => {
    const newExpanded = new Set(expandedEvents)
    if (newExpanded.has(eventId)) {
      newExpanded.delete(eventId)
    } else {
      newExpanded.add(eventId)
    }
    setExpandedEvents(newExpanded)
  }

  // Toggle event selection for export
  const toggleEventSelection = (eventId: string) => {
    const newSelected = new Set(selectedEvents)
    if (newSelected.has(eventId)) {
      newSelected.delete(eventId)
    } else {
      newSelected.add(eventId)
    }
    setSelectedEvents(newSelected)
  }

  // Select all events
  const selectAllEvents = () => {
    if (selectedEvents.size === events.length) {
      setSelectedEvents(new Set())
    } else {
      setSelectedEvents(new Set(events.map((event) => event.id)))
    }
  }

  // Export selected events
  const exportEvents = () => {
    const eventsToExport = events.filter((event) => selectedEvents.size === 0 || selectedEvents.has(event.id))

    // Group events by type
    const groupedEvents: Record<string, GitHubEvent[]> = {}
    eventsToExport.forEach((event) => {
      if (!groupedEvents[event.type]) {
        groupedEvents[event.type] = []
      }
      groupedEvents[event.type].push(event)
    })

    // Format for clipboard
    const exportText = Object.entries(groupedEvents)
      .map(([type, events]) => {
        return `## ${type} (${events.length})\n\n${events
          .map(
            (e) =>
              `- ${format(new Date(e.created_at), "yyyy-MM-dd HH:mm")} - ${e.repo.name}\n  ${JSON.stringify(e.payload, null, 2)}`,
          )
          .join("\n\n")}`
      })
      .join("\n\n")

    navigator.clipboard.writeText(exportText)
    toast({
      title: "Events exported",
      description: `${eventsToExport.length} events copied to clipboard`,
    })
  }

  // Get emoji for event type
  const getEventEmoji = (type: string) => {
    switch (type) {
      case "CreateEvent":
        return "🎉"
      case "PushEvent":
        return "🔄"
      case "IssuesEvent":
        return "❓"
      case "PullRequestEvent":
        return "🔀"
      case "IssueCommentEvent":
        return "💬"
      case "WatchEvent":
        return "⭐"
      case "ForkEvent":
        return "🍴"
      case "DeleteEvent":
        return "🗑️"
      case "ReleaseEvent":
        return "📦"
      case "CommitCommentEvent":
        return "💬"
      case "PublicEvent":
        return "📢"
      case "MemberEvent":
        return "👥"
      case "GollumEvent":
        return "📝"
      case "PullRequestReviewEvent":
        return "👀"
      case "PullRequestReviewCommentEvent":
        return "💬"
      case "SecurityAdvisoryEvent":
        return "⚠️"
      default:
        return "📋"
    }
  }

  // Get human-friendly summary for event
  const getEventSummary = (event: GitHubEvent) => {
    const actor = event.actor.login
    const repo = event.repo.name

    switch (event.type) {
      case "CreateEvent":
        return `${actor} created ${event.payload.ref_type} ${event.payload.ref || ""} in ${repo}`
      case "PushEvent":
        return `${actor} pushed ${event.payload.size} commit(s) to ${repo}`
      case "IssuesEvent":
        return `${actor} ${event.payload.action} issue in ${repo}`
      case "PullRequestEvent":
        return `${actor} ${event.payload.action} pull request in ${repo}`
      case "IssueCommentEvent":
        return `${actor} commented on issue in ${repo}`
      case "WatchEvent":
        return `${actor} starred ${repo}`
      case "ForkEvent":
        return `${actor} forked ${repo}`
      case "DeleteEvent":
        return `${actor} deleted ${event.payload.ref_type} ${event.payload.ref} in ${repo}`
      case "ReleaseEvent":
        return `${actor} released ${event.payload.release?.name || "a new version"} in ${repo}`
      default:
        return `${actor} performed ${event.type.replace("Event", "")} on ${repo}`
    }
  }

  // Get URL for event
  const getEventUrl = (event: GitHubEvent) => {
    const repoUrl = `https://github.com/${event.repo.name}`

    switch (event.type) {
      case "PushEvent":
        return `${repoUrl}/commit/${event.payload.head}`
      case "IssuesEvent":
        return event.payload.issue?.html_url || repoUrl
      case "PullRequestEvent":
        return event.payload.pull_request?.html_url || repoUrl
      case "IssueCommentEvent":
        return event.payload.comment?.html_url || repoUrl
      case "ReleaseEvent":
        return event.payload.release?.html_url || repoUrl
      default:
        return repoUrl
    }
  }

  // Background sync every 5 minutes
  useEffect(() => {
    if (!username) return

    const syncInterval = setInterval(
      () => {
        fetchEvents()
      },
      5 * 60 * 1000,
    )

    return () => clearInterval(syncInterval)
  }, [username, startDate, endDate])

  // Update the theme toggle button to use the saved theme
  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">GitHub Event Viewer</h1>
        <div className="flex items-center gap-4">
          {lastSynced && (
            <span className="text-sm text-muted-foreground">
              Last synced: {format(new Date(lastSynced), "HH:mm:ss")}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              // Simply toggle between light and dark
              const newTheme = theme === "dark" ? "light" : "dark"
              setTheme(newTheme)
            }}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label htmlFor="username" className="block text-sm font-medium mb-1">
                  GitHub Username
                </label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter GitHub username"
                  className="w-full"
                />
              </div>

              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Date Range</label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-start text-left font-normal flex-1">
                        {format(startDate, "MMM d, yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={(date) => date && setStartDate(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="flex items-center">to</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-start text-left font-normal flex-1">
                        {format(endDate, "MMM d, yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={(date) => date && setEndDate(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setDateRange("today")}>
                Today
              </Button>
              <Button type="button" variant="outline" onClick={() => setDateRange("week")}>
                This Week
              </Button>
              <Button type="button" variant="outline" onClick={() => setDateRange("month")}>
                This Month
              </Button>
              <div className="flex-1"></div>
              <Button type="submit" className="ml-auto" disabled={!username || isSyncing}>
                {isSyncing ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  "Fetch Events"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {events.length > 0 && (
        <>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={selectAllEvents}>
                {selectedEvents.size === events.length ? "Deselect All" : "Select All"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode(viewMode === "compact" ? "expanded" : "compact")}
              >
                {viewMode === "compact" ? "Expanded View" : "Compact View"}
              </Button>
            </div>
            <Button onClick={exportEvents} size="sm" className="flex items-center gap-2">
              <ClipboardCopy className="h-4 w-4" />
              Export {selectedEvents.size > 0 ? `(${selectedEvents.size})` : "All"}
            </Button>
          </div>

          <div className="space-y-3">
            {events.map((event) => (
              <Card
                key={event.id}
                className={cn("overflow-hidden transition-all", selectedEvents.has(event.id) && "border-primary")}
              >
                <CardContent className="p-0">
                  <div
                    className={cn("flex items-start p-4 cursor-pointer", viewMode === "compact" ? "gap-2" : "gap-4")}
                    onClick={() => toggleEventSelection(event.id)}
                  >
                    <div className="text-2xl" aria-hidden="true">
                      {getEventEmoji(event.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <a
                          href={getEventUrl(event)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {getEventSummary(event)}
                        </a>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(event.created_at), "MMM d, HH:mm")}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground truncate">{event.type}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleEventExpansion(event.id)
                      }}
                    >
                      {expandedEvents.has(event.id) ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {expandedEvents.has(event.id) && (
                    <div className="px-4 pb-4 pt-0">
                      <div className="bg-muted p-3 rounded-md overflow-auto max-h-96">
                        <pre className="text-xs">{JSON.stringify(event, null, 2)}</pre>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {events.length === 0 && username && !isSyncing && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No events found for this user and date range.</p>
        </div>
      )}

      {!username && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Enter a GitHub username to view events.</p>
        </div>
      )}
    </div>
  )
}
