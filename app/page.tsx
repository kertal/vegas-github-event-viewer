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
import ReactMarkdown from "react-markdown"

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

// Add event category type
type EventCategory = "PR" | "Issue" | "Other"

// Add view mode type
type ViewMode = "grouped" | "timeline"

// Update the UserPreferences interface to include selectedEvents, expandedEvents, and viewMode
interface UserPreferences {
  username: string
  startDate: string
  endDate: string
  selectedEvents: string[]
  expandedEvents: string[]
  lastTheme: string
  viewMode: ViewMode
  selectedRepos: string[]
}

// Add interface for related events
interface RelatedEvents {
  issue?: GitHubEvent
  pr?: GitHubEvent
  comments: GitHubEvent[]
}

// Add interface for commit
interface Commit {
  message: string
  sha: string
  url: string
}

// Add function to categorize events
const getEventCategory = (event: GitHubEvent): EventCategory => {
  const prEvents = [
    "PullRequestEvent",
    "PullRequestReviewEvent",
    "PullRequestReviewCommentEvent",
    "PushEvent"
  ]
  
  const issueEvents = [
    "IssuesEvent",
    "IssueCommentEvent"
  ]

  if (prEvents.includes(event.type)) {
    return "PR"
  } else if (issueEvents.includes(event.type)) {
    return "Issue"
  }
  return "Other"
}

// Add function to group events by category
const groupEventsByCategory = (events: GitHubEvent[]) => {
  return events.reduce((acc, event) => {
    const category = getEventCategory(event)
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(event)
    return acc
  }, {} as Record<EventCategory, GitHubEvent[]>)
}

// Add function to group events by category and number
const groupEventsByCategoryAndNumber = (events: GitHubEvent[]) => {
  const categoryGroups = groupEventsByCategory(events)
  const result: Record<EventCategory, Record<string, { events: GitHubEvent[], title: string, url: string }>> = {
    PR: {},
    Issue: {},
    Other: {}
  }

  // Group PR events by PR number
  categoryGroups.PR?.forEach(event => {
    const prNumber = event.payload.pull_request?.number
    if (prNumber) {
      const key = `PR #${prNumber}`
      if (!result.PR[key]) {
        result.PR[key] = {
          events: [],
          title: event.payload.pull_request?.title || "",
          url: event.payload.pull_request?.html_url || `https://github.com/${event.repo.name}/pull/${prNumber}`
        }
      }
      result.PR[key].events.push(event)
    } else {
      if (!result.PR['other']) {
        result.PR['other'] = { events: [], title: "", url: "" }
      }
      result.PR['other'].events.push(event)
    }
  })

  // Group Issue events by issue number
  categoryGroups.Issue?.forEach(event => {
    const issueNumber = event.payload.issue?.number
    if (issueNumber) {
      const key = `Issue #${issueNumber}`
      if (!result.Issue[key]) {
        result.Issue[key] = {
          events: [],
          title: event.payload.issue?.title || "",
          url: event.payload.issue?.html_url || `https://github.com/${event.repo.name}/issues/${issueNumber}`
        }
      }
      result.Issue[key].events.push(event)
    } else {
      if (!result.Issue['other']) {
        result.Issue['other'] = { events: [], title: "", url: "" }
      }
      result.Issue['other'].events.push(event)
    }
  })

  // Keep Other events as is
  result.Other = { 'other': { events: categoryGroups.Other || [], title: "", url: "" } }

  return result
}

// Add function to find related events
const findRelatedEvents = (events: GitHubEvent[]): Map<string, RelatedEvents> => {
  const relatedEvents = new Map<string, RelatedEvents>()
  
  // First pass: collect all PRs and issues
  events.forEach(event => {
    if (event.type === "PullRequestEvent" && event.payload.pull_request?.number) {
      const prNumber = event.payload.pull_request.number
      const key = `${event.repo.name}#${prNumber}`
      if (!relatedEvents.has(key)) {
        relatedEvents.set(key, { pr: event, comments: [] })
      }
    } else if (event.type === "IssuesEvent" && event.payload.issue?.number) {
      const issueNumber = event.payload.issue.number
      const key = `${event.repo.name}#${issueNumber}`
      if (!relatedEvents.has(key)) {
        relatedEvents.set(key, { issue: event, comments: [] })
      }
    } else if (event.type === "IssueCommentEvent" || event.type === "PullRequestReviewCommentEvent") {
      const number = event.payload.issue?.number || event.payload.pull_request?.number
      if (number) {
        const key = `${event.repo.name}#${number}`
        const existing = relatedEvents.get(key) || { comments: [] }
        existing.comments.push(event)
        relatedEvents.set(key, existing)
      }
    }
  })

  // Second pass: link PRs to issues they close
  events.forEach(event => {
    if (event.type === "PullRequestEvent" && event.payload.pull_request?.number) {
      const pr = event.payload.pull_request
      if (pr.body) {
        // Look for "Fixes #123" or "Closes #123" in PR body
        const closingMatches = pr.body.match(/(?:fixes|closes|resolves)\s+#(\d+)/gi)
        if (closingMatches) {
          closingMatches.forEach((match: string) => {
            const issueNumber = match.match(/\d+/)?.[0]
            if (issueNumber) {
              const issueKey = `${event.repo.name}#${issueNumber}`
              const prKey = `${event.repo.name}#${pr.number}`
              const issueData = relatedEvents.get(issueKey)
              const prData = relatedEvents.get(prKey)
              
              if (issueData && prData) {
                // Merge the data
                relatedEvents.set(issueKey, {
                  ...issueData,
                  pr: prData.pr,
                  comments: [...issueData.comments, ...prData.comments]
                })
                relatedEvents.delete(prKey)
              }
            }
          })
        }
      }
    }
  })

  return relatedEvents
}

// Add function to group events for timeline view
const groupRelatedEventsForTimeline = (events: GitHubEvent[]): GitHubEvent[] => {
  const relatedEvents = findRelatedEvents(events)
  const processedEvents = new Set<string>()
  const timelineEvents: GitHubEvent[] = []

  events.forEach(event => {
    if (processedEvents.has(event.id)) return

    const key = `${event.repo.name}#${event.payload.pull_request?.number || event.payload.issue?.number}`
    const related = relatedEvents.get(key)

    if (related?.pr && related?.issue) {
      // Add both related events together
      timelineEvents.push(related.issue, related.pr)
      processedEvents.add(related.issue.id)
      processedEvents.add(related.pr.id)
    } else {
      // Add single event
      timelineEvents.push(event)
      processedEvents.add(event.id)
    }
  })

  // Sort by date
  return timelineEvents.sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

// Add function to find PR references in commit messages
const findPRReferences = (commitMessage: string, repo: string): { number: number; url: string } | null => {
  // Look for patterns like "PR #123" or "fixes #123" or "closes #123"
  const prMatch = commitMessage.match(/(?:PR|fixes|closes|resolves)\s+#(\d+)/i)
  if (prMatch) {
    const prNumber = parseInt(prMatch[1], 10)
    return {
      number: prNumber,
      url: `https://github.com/${repo}/pull/${prNumber}`
    }
  }
  return null
}

// Get human-friendly summary for event
const getEventSummary = (event: GitHubEvent, relatedEvents?: RelatedEvents) => {
  const actor = event.actor.login
  const repo = event.repo.name

  switch (event.type) {
    case "CreateEvent":
      return {
        summary: `${actor} created ${event.payload.ref_type} ${event.payload.ref || ""} in ${repo}`,
        title: event.payload.ref || ""
      }
    case "PushEvent": {
      const commits = (event.payload.commits || []) as Commit[]
      const prRefs = commits
        .map(commit => findPRReferences(commit.message, repo))
        .filter((ref): ref is { number: number; url: string } => ref !== null)
      
      const prInfo = prRefs.length > 0 
        ? `PR #${prRefs.map(ref => ref.number).join(", #")}`
        : event.payload.head || ""

      return {
        summary: `${actor} pushed ${event.payload.size} commit(s) to ${repo}`,
        title: prInfo
      }
    }
    case "IssuesEvent":
      const issueNumber = event.payload.issue?.number
      const issueTitle = event.payload.issue?.title || ""
      const closedByPR = relatedEvents?.pr
      return {
        summary: `${actor} ${event.payload.action} issue in ${repo}`,
        title: `#${issueNumber} ${issueTitle}${closedByPR ? ` (closed by PR #${closedByPR.payload.pull_request.number})` : ""}`
      }
    case "PullRequestEvent":
      const prNumber = event.payload.pull_request?.number
      const prTitle = event.payload.pull_request?.title || ""
      const closesIssue = relatedEvents?.issue
      return {
        summary: `${actor} ${event.payload.action} pull request in ${repo}`,
        title: `#${prNumber} ${prTitle}${closesIssue ? ` (closes issue #${closesIssue.payload.issue.number})` : ""}`
      }
    case "PullRequestReviewEvent":
      const reviewPrNumber = event.payload.pull_request?.number
      const reviewPrTitle = event.payload.pull_request?.title || ""
      return {
        summary: `${actor} ${event.payload.action} review on pull request in ${repo}`,
        title: `#${reviewPrNumber} ${reviewPrTitle}`
      }
    case "IssueCommentEvent":
      return {
        summary: `${actor} commented on issue in ${repo}`,
        title: `#${event.payload.issue?.number} ${event.payload.issue?.title || ""}`
      }
    case "WatchEvent":
      return {
        summary: `${actor} starred ${repo}`,
        title: ""
      }
    case "ForkEvent":
      return {
        summary: `${actor} forked ${repo}`,
        title: ""
      }
    case "DeleteEvent":
      return {
        summary: `${actor} deleted ${event.payload.ref_type} ${event.payload.ref} in ${repo}`,
        title: event.payload.ref || ""
      }
    case "ReleaseEvent":
      return {
        summary: `${actor} released ${event.payload.release?.name || "a new version"} in ${repo}`,
        title: event.payload.release?.name || ""
      }
    default:
      return {
        summary: `${actor} performed ${event.type.replace("Event", "")} on ${repo}`,
        title: ""
      }
  }
}

// Add function to generate report
const generateReport = (events: GitHubEvent[]) => {
  const groups = groupEventsByCategoryAndNumber(events)
  const report: string[] = []

  // PRs section
  const prGroups = Object.entries(groups.PR)
    .filter(([key]) => key !== 'other')
    .map(([key, group]) => {
      const activities = group.events.map(event => {
        const eventInfo = getEventSummary(event)
        // Remove actor name if it's the same for all events
        const allSameActor = group.events.every(e => e.actor.login === event.actor.login)
        return allSameActor 
          ? eventInfo.summary.replace(`${event.actor.login} `, '')
          : eventInfo.summary
      }).join(', ')
      return { key, group, activities }
    })

  if (prGroups.length > 0) {
    report.push('## Pull Requests\n')

    // Opened PRs
    const openedPRs = prGroups.filter(({ activities }) => 
      activities.includes('opened pull request') || 
      activities.includes('created pull request')
    )
    if (openedPRs.length > 0) {
      report.push('### Opened\n')
      report.push(...openedPRs.map(({ key, group }) => 
        `* [${group.title}](${group.url}) (${key})`
      ))
      report.push('')
    }

    // Reviewed PRs
    const reviewedPRs = prGroups.filter(({ activities }) => 
      activities.includes('reviewed') || 
      activities.includes('commented on pull request')
    )
    if (reviewedPRs.length > 0) {
      report.push('### Reviewed\n')
      report.push(...reviewedPRs.map(({ key, group }) => 
        `* [${group.title}](${group.url}) (${key})`
      ))
      report.push('')
    }

    // Closed PRs
    const closedPRs = prGroups.filter(({ activities }) => 
      activities.includes('closed pull request') || 
      activities.includes('merged pull request')
    )
    if (closedPRs.length > 0) {
      report.push('### Closed\n')
      report.push(...closedPRs.map(({ key, group }) => 
        `* [${group.title}](${group.url}) (${key})`
      ))
      report.push('')
    }
  }

  // Issues section
  const issueGroups = Object.entries(groups.Issue)
    .filter(([key]) => key !== 'other')
    .map(([key, group]) => {
      const activities = group.events.map(event => {
        const eventInfo = getEventSummary(event)
        // Remove actor name if it's the same for all events
        const allSameActor = group.events.every(e => e.actor.login === event.actor.login)
        return allSameActor 
          ? eventInfo.summary.replace(`${event.actor.login} `, '')
          : eventInfo.summary
      }).join(', ')
      return { key, group, activities }
    })

  if (issueGroups.length > 0) {
    report.push('## Issues\n')

    // Opened Issues
    const openedIssues = issueGroups.filter(({ activities }) => 
      activities.includes('opened issue') || 
      activities.includes('created issue')
    )
    if (openedIssues.length > 0) {
      report.push('### Opened\n')
      report.push(...openedIssues.map(({ key, group }) => 
        `* [${group.title}](${group.url}) (${key})`
      ))
      report.push('')
    }

    // Commented Issues
    const commentedIssues = issueGroups.filter(({ activities }) => 
      activities.includes('commented on issue')
    )
    if (commentedIssues.length > 0) {
      report.push('### Commented\n')
      report.push(...commentedIssues.map(({ key, group }) => 
        `* [${group.title}](${group.url}) (${key})`
      ))
      report.push('')
    }

    // Closed Issues
    const closedIssues = issueGroups.filter(({ activities }) => 
      activities.includes('closed issue')
    )
    if (closedIssues.length > 0) {
      report.push('### Closed\n')
      report.push(...closedIssues.map(({ key, group }) => 
        `* [${group.title}](${group.url}) (${key})`
      ))
      report.push('')
    }
  }

  // Other section
  const otherEvents = groups.Other.other.events.map(event => {
    const eventInfo = getEventSummary(event)
    // Remove actor name if it's the same for all events
    const allSameActor = groups.Other.other.events.every(e => e.actor.login === event.actor.login)
    return allSameActor 
      ? eventInfo.summary.replace(`${event.actor.login} `, '')
      : eventInfo.summary
  })

  if (otherEvents.length > 0) {
    report.push('## Other Activity\n')
    report.push(...otherEvents.map(event => `* ${event}`))
  }

  return report.join('\n')
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
  const [viewMode, setViewMode] = useState<ViewMode>("grouped")
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set())
  const [showReport, setShowReport] = useState(false)
  const [showReportPreview, setShowReportPreview] = useState(false)

  const { theme, setTheme } = useTheme()
  const { toast } = useToast()

  // Load user preferences from localStorage on mount
  useEffect(() => {
    const savedPrefs = localStorage.getItem("github-event-viewer-prefs")
    if (savedPrefs) {
      try {
        const prefs: UserPreferences = JSON.parse(savedPrefs)
        setUsername(prefs.username || "")
        setStartDate(prefs.startDate ? new Date(prefs.startDate) : subDays(new Date(), 4))
        setEndDate(prefs.endDate ? new Date(prefs.endDate) : new Date())
        setViewMode(prefs.viewMode || "grouped")
        setSelectedRepos(new Set(prefs.selectedRepos || []))

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
  useEffect(() => {
    const prefs: UserPreferences = {
      username,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      selectedEvents: Array.from(selectedEvents),
      expandedEvents: Array.from(expandedEvents),
      lastTheme: theme || "system",
      viewMode,
      selectedRepos: Array.from(selectedRepos),
    }
    localStorage.setItem("github-event-viewer-prefs", JSON.stringify(prefs))
  }, [username, startDate, endDate, selectedEvents, expandedEvents, theme, viewMode, selectedRepos])

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

  // Get unique repositories from events
  const getUniqueRepos = (events: GitHubEvent[]): string[] => {
    const repos = new Set(events.map(event => event.repo.name))
    return Array.from(repos).sort()
  }

  // Toggle repository selection
  const toggleRepoSelection = (repo: string) => {
    const newSelected = new Set(selectedRepos)
    if (newSelected.has(repo)) {
      newSelected.delete(repo)
    } else {
      newSelected.add(repo)
    }
    setSelectedRepos(newSelected)
  }

  // Filter events by selected repositories
  const getFilteredEvents = (events: GitHubEvent[]): GitHubEvent[] => {
    if (selectedRepos.size === 0) return events
    return events.filter(event => selectedRepos.has(event.repo.name))
  }

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
            variant="outline"
            size="sm"
            onClick={() => setShowReportPreview(true)}
          >
            Preview Report
          </Button>
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

            {events.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {getUniqueRepos(events).map(repo => (
                  <Button
                    key={repo}
                    type="button"
                    variant={selectedRepos.has(repo) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleRepoSelection(repo)}
                  >
                    {repo}
                  </Button>
                ))}
              </div>
            )}

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
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={selectAllEvents}>
                {selectedEvents.size === events.length ? "Deselect All" : "Select All"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode(viewMode === "grouped" ? "timeline" : "grouped")}
              >
                {viewMode === "grouped" ? "Show Timeline" : "Show Grouped"}
              </Button>
            </div>
            <Button onClick={exportEvents} size="sm" className="flex items-center gap-2">
              <ClipboardCopy className="h-4 w-4" />
              Export {selectedEvents.size > 0 ? `(${selectedEvents.size})` : "All"}
            </Button>
          </div>

          <div className="space-y-3">
            {viewMode === "grouped" ? (
              // Grouped view
              Object.entries(groupEventsByCategoryAndNumber(getFilteredEvents(events))).map(([category, numberGroups]) => (
                <div key={category} className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground">
                    {category === "PR" ? "Pull Request Activity" : 
                     category === "Issue" ? "Issue Activity" : 
                     "Other Activity"} ({Object.values(numberGroups).reduce((sum, group) => sum + group.events.length, 0)})
                  </h2>
                  {Object.entries(numberGroups).map(([number, group]) => (
                    <div key={number} className="space-y-1">
                      {number !== 'other' && (
                        <div className="pl-2">
                          <a
                            href={group.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-muted-foreground hover:underline"
                          >
                            {number}: {group.title}
                          </a>
                        </div>
                      )}
                      {group.events.map((event) => {
                        const relatedEvents = findRelatedEvents(events).get(`${event.repo.name}#${event.payload.pull_request?.number || event.payload.issue?.number}`)
                        const eventInfo = getEventSummary(event, relatedEvents)
                        return (
                          <Card
                            key={event.id}
                            className={cn(
                              "overflow-hidden transition-all",
                              selectedEvents.has(event.id) && "border-primary",
                              relatedEvents?.pr && relatedEvents?.issue && "border-l-4 border-l-primary"
                            )}
                          >
                            <CardContent className="p-0">
                              <div
                                className="flex items-start py-2 px-3 cursor-pointer gap-2"
                                onClick={() => toggleEventSelection(event.id)}
                              >
                                <div className="text-lg mt-1" aria-hidden="true">
                                  {getEventEmoji(event.type)}
                                </div>
                                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 mt-1">
                                  {format(new Date(event.created_at), "MMM d, HH:mm")}
                                </span>
                                <img
                                  src={event.actor.avatar_url}
                                  alt={`${event.actor.login}'s avatar`}
                                  className="w-5 h-5 rounded-full mt-1"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    window.open(event.actor.url, '_blank')
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
                                      {eventInfo.summary}
                                    </a>
                                  </div>
                                  {eventInfo.title && number === 'other' && (
                                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                                      {eventInfo.title}
                                    </div>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="ml-auto h-6 w-6 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleEventExpansion(event.id)
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
                        )
                      })}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              // Timeline view
              groupRelatedEventsForTimeline(getFilteredEvents(events)).map((event) => {
                const relatedEvents = findRelatedEvents(events).get(`${event.repo.name}#${event.payload.pull_request?.number || event.payload.issue?.number}`)
                const eventInfo = getEventSummary(event, relatedEvents)
                return (
                  <Card
                    key={event.id}
                    className={cn(
                      "overflow-hidden transition-all",
                      selectedEvents.has(event.id) && "border-primary",
                      relatedEvents?.pr && relatedEvents?.issue && "border-l-4 border-l-primary"
                    )}
                  >
                    <CardContent className="p-0">
                      <div
                        className="flex items-start py-2 px-3 cursor-pointer gap-2"
                        onClick={() => toggleEventSelection(event.id)}
                      >
                        <div className="text-lg mt-1" aria-hidden="true">
                          {getEventEmoji(event.type)}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 mt-1">
                          {format(new Date(event.created_at), "MMM d, HH:mm")}
                        </span>
                        <img
                          src={event.actor.avatar_url}
                          alt={`${event.actor.login}'s avatar`}
                          className="w-5 h-5 rounded-full mt-1"
                          onClick={(e) => {
                            e.stopPropagation()
                            window.open(event.actor.url, '_blank')
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
                              {eventInfo.summary}
                            </a>
                          </div>
                          {eventInfo.title && (
                            <div className="text-xs text-muted-foreground truncate mt-0.5">
                              {eventInfo.title}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleEventExpansion(event.id)
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
                )
              })
            )}
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

      {/* Report Preview Modal */}
      {showReportPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold">Report Preview</h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const report = generateReport(getFilteredEvents(events))
                    navigator.clipboard.writeText(report)
                    toast({
                      title: "Report copied",
                      description: "The report has been copied to your clipboard",
                    })
                  }}
                >
                  Copy
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowReportPreview(false)}
                >
                  Close
                </Button>
              </div>
            </div>
            <div className="p-4 overflow-auto">
              <div className="prose dark:prose-invert max-w-none">
                <ReactMarkdown
                  components={{
                    ul: ({ children }) => <ul className="list-disc pl-4">{children}</ul>,
                    li: ({ children }) => <li className="my-1">{children}</li>,
                    h2: ({ children }) => <h2 className="text-xl font-bold mt-4 mb-2">{children}</h2>,
                    a: ({ href, children }) => (
                      <a href={href} className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {generateReport(getFilteredEvents(events))}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
