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

// Add event category type
type EventCategory = "Pull Requests" | "Issues" | "Commits" | "Repository" | "Other"

// Add view mode type
type ViewMode = "grouped" | "timeline" | "report"

// Add event type constants
const EVENT_TYPES: Record<EventCategory, string[]> = {
  "Pull Requests": [
    "PullRequestEvent",
    "PullRequestReviewEvent",
    "PullRequestReviewCommentEvent"
  ],
  "Issues": [
    "IssuesEvent",
    "IssueCommentEvent"
  ],
  "Commits": [
    "PushEvent"
  ],
  "Repository": [
    "CreateEvent",
    "DeleteEvent",
    "ForkEvent",
    "WatchEvent",
    "ReleaseEvent",
    "PublicEvent",
    "MemberEvent",
    "GollumEvent"
  ],
  "Other": [
    "CommitCommentEvent",
    "SecurityAdvisoryEvent"
  ]
}

// Update the UserPreferences interface to include selectedEvents, expandedEvents, and viewMode
interface UserPreferences {
  usernames: string[]
  startDate: string
  endDate: string
  expandedEvents: string[]
  lastTheme: string
  viewMode: ViewMode
  selectedRepos: string[]
  selectedEventTypes: string[]
  selectedLabels: string[]
  showFilters: boolean
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
    return "Pull Requests"
  } else if (issueEvents.includes(event.type)) {
    return "Issues"
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
    "Pull Requests": {},
    "Issues": {},
    "Commits": {},
    "Repository": {},
    "Other": {}
  }

  // Group PR events by PR number
  categoryGroups["Pull Requests"]?.forEach(event => {
    const prNumber = event.payload.pull_request?.number
    if (prNumber) {
      const key = `PR #${prNumber}`
      if (!result["Pull Requests"][key]) {
        result["Pull Requests"][key] = {
          events: [],
          title: event.payload.pull_request?.title || "",
          url: event.payload.pull_request?.html_url || `https://github.com/${event.repo.name}/pull/${prNumber}`
        }
      }
      result["Pull Requests"][key].events.push(event)
    } else {
      if (!result["Pull Requests"]['other']) {
        result["Pull Requests"]['other'] = { events: [], title: "", url: "" }
      }
      result["Pull Requests"]['other'].events.push(event)
    }
  })

  // Group Issue events by issue number
  categoryGroups["Issues"]?.forEach(event => {
    const issueNumber = event.payload.issue?.number
    if (issueNumber) {
      const key = `Issue #${issueNumber}`
      if (!result["Issues"][key]) {
        result["Issues"][key] = {
          events: [],
          title: event.payload.issue?.title || "",
          url: event.payload.issue?.html_url || `https://github.com/${event.repo.name}/issues/${issueNumber}`
        }
      }
      result["Issues"][key].events.push(event)
    } else {
      if (!result["Issues"]['other']) {
        result["Issues"]['other'] = { events: [], title: "", url: "" }
      }
      result["Issues"]['other'].events.push(event)
    }
  })

  // Keep Other events as is
  result["Other"] = { 'other': { events: categoryGroups["Other"] || [], title: "", url: "" } }

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
  const prGroups = Object.entries(groups["Pull Requests"])
    .filter(([key]) => key !== 'other')
    .map(([key, group]) => {
      const activities = group.events.map(event => {
        const eventInfo = getEventSummary(event)
        // For single person, remove the actor name from the summary
        const allSameActor = group.events.every(e => e.actor.login === event.actor.login)
        return allSameActor 
          ? eventInfo.summary.replace(`${event.actor.login} `, '')
          : eventInfo.summary
      }).join(', ')
      return { key, group, activities }
    })

  if (prGroups.length > 0) {
    report.push('Pull Requests')

    // Opened PRs
    const openedPRs = prGroups.filter(({ activities }) => 
      activities.includes('opened pull request') || 
      activities.includes('created pull request')
    )
    if (openedPRs.length > 0) {
      report.push('  Opened')
      report.push(...openedPRs.map(({ key, group }) => 
        `    [${group.title}](${group.url}) (${key})`
      ))
    }

    // Reviewed PRs
    const reviewedPRs = prGroups.filter(({ activities }) => 
      activities.includes('reviewed') || 
      activities.includes('commented on pull request')
    )
    if (reviewedPRs.length > 0) {
      report.push('  Reviewed')
      report.push(...reviewedPRs.map(({ key, group }) => 
        `    [${group.title}](${group.url}) (${key})`
      ))
    }

    // Closed PRs
    const closedPRs = prGroups.filter(({ activities }) => 
      activities.includes('closed pull request') || 
      activities.includes('merged pull request')
    )
    if (closedPRs.length > 0) {
      report.push('  Closed')
      report.push(...closedPRs.map(({ key, group }) => 
        `    [${group.title}](${group.url}) (${key})`
      ))
    }
  }

  // Issues section
  const issueGroups = Object.entries(groups["Issues"])
    .filter(([key]) => key !== 'other')
    .map(([key, group]) => {
      const activities = group.events.map(event => {
        const eventInfo = getEventSummary(event)
        // For single person, remove the actor name from the summary
        const allSameActor = group.events.every(e => e.actor.login === event.actor.login)
        return allSameActor 
          ? eventInfo.summary.replace(`${event.actor.login} `, '')
          : eventInfo.summary
      }).join(', ')
      return { key, group, activities }
    })

  if (issueGroups.length > 0) {
    report.push('Issues')

    // Opened Issues
    const openedIssues = issueGroups.filter(({ activities }) => 
      activities.includes('opened issue') || 
      activities.includes('created issue')
    )
    if (openedIssues.length > 0) {
      report.push('  Opened')
      report.push(...openedIssues.map(({ key, group }) => 
        `    [${group.title}](${group.url}) (${key})`
      ))
    }

    // Commented Issues
    const commentedIssues = issueGroups.filter(({ activities }) => 
      activities.includes('commented on issue')
    )
    if (commentedIssues.length > 0) {
      report.push('  Commented')
      report.push(...commentedIssues.map(({ key, group }) => 
        `    [${group.title}](${group.url}) (${key})`
      ))
    }

    // Closed Issues
    const closedIssues = issueGroups.filter(({ activities }) => 
      activities.includes('closed issue')
    )
    if (closedIssues.length > 0) {
      report.push('  Closed')
      report.push(...closedIssues.map(({ key, group }) => 
        `    [${group.title}](${group.url}) (${key})`
      ))
    }
  }

  // Other section
  const otherEvents = groups["Other"].other.events.map(event => {
    const eventInfo = getEventSummary(event)
    // For single person, remove the actor name from the summary
    const allSameActor = groups["Other"].other.events.every(e => e.actor.login === event.actor.login)
    return allSameActor 
      ? eventInfo.summary.replace(`${event.actor.login} `, '')
      : eventInfo.summary
  })

  if (otherEvents.length > 0) {
    report.push('Other Activity')
    report.push(...otherEvents.map(event => `  ${event}`))
  }

  return report.join('\n')
}

export default function GitHubEventViewer() {
  // State
  const [events, setEvents] = useState<GitHubEvent[]>([])
  const [usernames, setUsernames] = useState<string[]>([])
  const [usernameInput, setUsernameInput] = useState("")
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 4))
  const [endDate, setEndDate] = useState<Date>(new Date())
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>("grouped")
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set())
  const [showReport, setShowReport] = useState(false)
  const [showReportPreview, setShowReportPreview] = useState(false)
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(true)
  const [showQuickDateOptions, setShowQuickDateOptions] = useState(false)
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set())
  const [lastRequestKey, setLastRequestKey] = useState<string>("")

  const { theme, setTheme } = useTheme()
  const { toast } = useToast()

  // Load user preferences from localStorage on mount
  useEffect(() => {
    const savedPrefs = localStorage.getItem("github-event-viewer-prefs")
    if (savedPrefs) {
      try {
        const prefs: UserPreferences = JSON.parse(savedPrefs)
        setUsernames(prefs.usernames || [])
        setUsernameInput(prefs.usernames?.join(", ") || "")
        setStartDate(prefs.startDate ? new Date(prefs.startDate) : subDays(new Date(), 4))
        setEndDate(prefs.endDate ? new Date(prefs.endDate) : new Date())
        setViewMode(prefs.viewMode || "grouped")
        setSelectedRepos(new Set(prefs.selectedRepos || []))
        setSelectedEventTypes(new Set(prefs.selectedEventTypes || []))
        setSelectedLabels(new Set(prefs.selectedLabels || []))
        setShowFilters(prefs.showFilters !== undefined ? prefs.showFilters : true)

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
      usernames,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      expandedEvents: Array.from(expandedEvents),
      lastTheme: theme || "system",
      viewMode,
      selectedRepos: Array.from(selectedRepos),
      selectedEventTypes: Array.from(selectedEventTypes),
      selectedLabels: Array.from(selectedLabels),
      showFilters,
    }
    localStorage.setItem("github-event-viewer-prefs", JSON.stringify(prefs))
  }, [usernames, startDate, endDate, expandedEvents, theme, viewMode, selectedRepos, selectedEventTypes, selectedLabels, showFilters])

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

  // Get filtered events
  const getFilteredEvents = (events: GitHubEvent[]): GitHubEvent[] => {
    let filtered = events

    // Filter by repository - show all repositories if none selected
    if (selectedRepos.size > 0) {
      filtered = filtered.filter(event => selectedRepos.has(event.repo.name))
    }

    // Filter by event type - show all event types if none selected
    if (selectedEventTypes.size > 0) {
      filtered = filtered.filter(event => {
        return Array.from(selectedEventTypes).some(category => 
          EVENT_TYPES[category as EventCategory].includes(event.type)
        )
      })
    }

    // Filter by labels - show all events if no labels selected
    if (selectedLabels.size > 0) {
      filtered = filtered.filter(event => {
        if (event.type === "PullRequestEvent" && event.payload.pull_request?.labels) {
          return event.payload.pull_request.labels.some((label: { name: string }) => 
            selectedLabels.has(label.name)
          )
        }
        if (event.type === "IssuesEvent" && event.payload.issue?.labels) {
          return event.payload.issue.labels.some((label: { name: string }) => 
            selectedLabels.has(label.name)
          )
        }
        return false
      })
    }

    return filtered
  }

  // Clear all filters
  const clearAllFilters = () => {
    setSelectedRepos(new Set())
    setSelectedEventTypes(new Set())
    setSelectedLabels(new Set())
  }

  // Get count of active filters
  const getActiveFilterCount = () => {
    return selectedRepos.size + selectedEventTypes.size + selectedLabels.size
  }

  // Get filter description
  const getFilterDescription = () => {
    if (getActiveFilterCount() === 0) return "No filters"
    
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
    return parts.join(', ')
  }

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Parse usernames from input
    const newUsernames = usernameInput
      .split(",")
      .map(name => name.trim())
      .filter(name => name.length > 0)
    setUsernames(newUsernames)
    fetchEvents()
  }

  // Set date range presets
  const setDateRange = (preset: "today" | "week" | "month" | "threeDays") => {
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
      case "threeDays":
        start = subDays(new Date(), 3)
        break
      default:
        start = subDays(new Date(), 4)
    }

    setStartDate(start)
    setEndDate(end)
    // Automatically submit the form after setting the date range
    if (usernames.length > 0) {
      fetchEvents()
    }
  }

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

  // Toggle event type selection
  const toggleEventTypeSelection = (category: EventCategory) => {
    const newSelected = new Set(selectedEventTypes)
    if (newSelected.has(category)) {
      newSelected.delete(category)
    } else {
      newSelected.add(category)
    }
    setSelectedEventTypes(newSelected)
  }

  // Fetch events from GitHub API
  const fetchEvents = async () => {
    if (usernames.length === 0) return

    // Create a unique key for this request
    const requestKey = `${usernames.join(',')}-${startDate.toISOString()}-${endDate.toISOString()}`
    
    // Skip if this is a duplicate request
    if (requestKey === lastRequestKey && isSyncing) {
      return
    }

    setIsSyncing(true)
    setLastRequestKey(requestKey)

    try {
      const allEvents: GitHubEvent[] = []
      const errors: string[] = []

      // Fetch events for each username
      for (const username of usernames) {
        try {
          const response = await fetch(`https://api.github.com/users/${username}/events?per_page=100`)

          if (!response.ok) {
            const errorData = await response.json().catch(() => null)
            const errorMessage = errorData?.message || `HTTP error ${response.status}`
            throw new Error(errorMessage)
          }

          const data: GitHubEvent[] = await response.json()
          allEvents.push(...data)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Failed to fetch events"
          errors.push(`${username}: ${errorMessage}`)
          console.error(`Error fetching events for ${username}:`, error)
        }
      }

      // If all fetches failed, keep existing data
      if (allEvents.length === 0) {
        toast({
          title: "Fetch failed",
          description: errors.join("\n"),
          variant: "destructive",
        })
        return
      }

      // Filter events by date range
      const filteredEvents = allEvents.filter((event) => {
        const eventDate = new Date(event.created_at)
        return eventDate >= startDate && eventDate <= endDate
      })

      // Sort events newest to oldest
      filteredEvents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      // Only update state and storage if we have events
      if (filteredEvents.length > 0) {
        setEvents(filteredEvents)
        // Cache events in localStorage
        localStorage.setItem("github-event-cache", JSON.stringify(filteredEvents))
        const now = new Date().toISOString()
        setLastSynced(now)
        localStorage.setItem("github-event-last-synced", now)
      }

      // Show success/error messages
      if (errors.length > 0) {
        toast({
          title: "Partial sync completed",
          description: (
            <div className="space-y-2">
              <p>Fetched {filteredEvents.length} events</p>
              <p className="font-medium">Errors:</p>
              <ul className="list-disc pl-4">
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          ),
          variant: "destructive",
        })
      } else {
        toast({
          title: "Events synced",
          description: `Fetched ${filteredEvents.length} events for ${usernames.join(", ")}`,
        })
      }
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

  // Get unique labels from events
  const getUniqueLabels = (events: GitHubEvent[]): string[] => {
    const labels = new Set<string>()
    events.forEach(event => {
      if (event.type === "PullRequestEvent" && event.payload.pull_request?.labels) {
        event.payload.pull_request.labels.forEach((label: { name: string }) => {
          labels.add(label.name)
        })
      } else if (event.type === "IssuesEvent" && event.payload.issue?.labels) {
        event.payload.issue.labels.forEach((label: { name: string }) => {
          labels.add(label.name)
        })
      }
    })
    return Array.from(labels).sort()
  }

  // Toggle label selection
  const toggleLabelSelection = (label: string) => {
    const newSelected = new Set(selectedLabels)
    if (newSelected.has(label)) {
      newSelected.delete(label)
    } else {
      newSelected.add(label)
    }
    setSelectedLabels(newSelected)
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
                  GitHub Usernames
                </label>
                <Input
                  id="username"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="Enter GitHub usernames (comma-separated)"
                  className="w-full"
                />
              </div>

              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Date Range</label>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="justify-start text-left font-normal flex-1">
                          {format(startDate, "EEE, MMM d, yyyy")}
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
                          {format(endDate, "EEE, MMM d, yyyy")}
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowQuickDateOptions(!showQuickDateOptions)}
                      className="px-2"
                    >
                      {showQuickDateOptions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                  {showQuickDateOptions && (
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setDateRange("today")}>
                        Today
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setDateRange("threeDays")}>
                        3 Days
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setDateRange("week")}>
                        This Week
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setDateRange("month")}>
                        This Month
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-end">
                <Button type="submit" disabled={!usernameInput || isSyncing} className="h-10">
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
            </div>

            {events.length > 0 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Filters</label>
                  <div className="flex items-center justify-between mb-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowFilters(!showFilters)}
                      className="flex items-center gap-2 w-full justify-between text-muted-foreground"
                    >
                      <div className="flex items-center gap-2">
                        <span>{getFilterDescription()}</span>
                        {getActiveFilterCount() > 0 && !showFilters && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              clearAllFilters()
                            }}
                            className="text-xs text-blue-500 hover:text-blue-600 hover:underline"
                          >
                            Clear all
                          </button>
                        )}
                      </div>
                      {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                  {showFilters && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Repositories</label>
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
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">Event Types</label>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(EVENT_TYPES).map(([category, types]) => (
                            <Button
                              key={category}
                              type="button"
                              variant={selectedEventTypes.has(category) ? "default" : "outline"}
                              size="sm"
                              onClick={() => toggleEventTypeSelection(category as EventCategory)}
                            >
                              {category} ({events.filter(e => types.includes(e.type)).length})
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">Labels</label>
                        <div className="flex flex-wrap gap-2">
                          {getUniqueLabels(events).map(label => (
                            <Button
                              key={label}
                              type="button"
                              variant={selectedLabels.has(label) ? "default" : "outline"}
                              size="sm"
                              onClick={() => toggleLabelSelection(label)}
                            >
                              {label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {events.length > 0 && (
        <>
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center">
              <div className="inline-flex rounded-md border border-input bg-background">
                <Button
                  variant={viewMode === "grouped" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("grouped")}
                  className="rounded-r-none border-r"
                >
                  Grouped
                </Button>
                <Button
                  variant={viewMode === "timeline" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("timeline")}
                  className="rounded-none border-r"
                >
                  Timeline
                </Button>
                <Button
                  variant={viewMode === "report" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("report")}
                  className="rounded-l-none"
                >
                  Report
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {viewMode === "grouped" ? (
              // Grouped view
              Object.entries(groupEventsByCategoryAndNumber(getFilteredEvents(events)))
                .filter(([_, numberGroups]) => Object.values(numberGroups).some(group => group.events.length > 0))
                .map(([category, numberGroups]) => (
                  <div key={category} className="space-y-3">
                    <h2 className="text-sm font-semibold text-muted-foreground">
                      {category === "Pull Requests" ? "Pull Request Activity" : 
                       category === "Issues" ? "Issue Activity" : 
                       "Other Activity"} ({Object.values(numberGroups).reduce((sum, group) => sum + group.events.length, 0)})
                    </h2>
                    {Object.entries(numberGroups)
                      .filter(([_, group]) => group.events.length > 0)
                      .map(([number, group]) => (
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
                                  relatedEvents?.pr && relatedEvents?.issue && "border-l-4 border-l-primary"
                                )}
                              >
                                <CardContent className="p-0">
                                  <div
                                    className="flex items-start py-2 px-3 cursor-pointer gap-2"
                                    onClick={() => toggleEventExpansion(event.id)}
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
            ) : viewMode === "timeline" ? (
              // Timeline view
              groupRelatedEventsForTimeline(getFilteredEvents(events)).map((event) => {
                const relatedEvents = findRelatedEvents(events).get(`${event.repo.name}#${event.payload.pull_request?.number || event.payload.issue?.number}`)
                const eventInfo = getEventSummary(event, relatedEvents)
                return (
                  <Card
                    key={event.id}
                    className={cn(
                      "overflow-hidden transition-all",
                      relatedEvents?.pr && relatedEvents?.issue && "border-l-4 border-l-primary"
                    )}
                  >
                    <CardContent className="p-0">
                      <div
                        className="flex items-start py-2 px-3 cursor-pointer gap-2"
                        onClick={() => toggleEventExpansion(event.id)}
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
            ) : (
              // Report view
              <div className="prose dark:prose-invert max-w-none">
                {(() => {
                  const eventsToExport = getFilteredEvents(events)
                  
                  // Get unique actors and their avatars
                  const actors = new Map<string, string>()
                  eventsToExport.forEach(event => {
                    if (!actors.has(event.actor.login)) {
                      actors.set(event.actor.login, event.actor.avatar_url)
                    }
                  })

                  return (
                    <>
                      <div className="text-sm text-muted-foreground mb-4">
                        Time Range: {format(startDate, "MMM d, yyyy HH:mm")} - {format(endDate, "MMM d, yyyy HH:mm")}
                      </div>
                      {actors.size > 1 && (
                        <>
                          <h2 className="text-sm font-semibold text-muted-foreground mt-6 mb-2">Involved People</h2>
                          <div className="flex gap-2 items-center mb-4">
                            {Array.from(actors.entries()).map(([login, avatarUrl]) => (
                              <img
                                key={login}
                                src={avatarUrl}
                                alt={login}
                                className="w-6 h-6 rounded-full"
                                title={login}
                                onClick={() => window.open(`https://github.com/${login}`, '_blank')}
                                style={{ cursor: 'pointer' }}
                              />
                            ))}
                          </div>
                        </>
                      )}
                      <div className="prose dark:prose-invert max-w-none">
                        {(() => {
                          const report = generateReport(eventsToExport)
                          const lines = report.split('\n')
                          
                          const renderReport = () => {
                            const result: JSX.Element[] = []
                            let currentList: JSX.Element[] = []
                            let currentLevel = 0
                            
                            lines.forEach((line, index) => {
                              const indentMatch = line.match(/^\s*/)
                              const indent = indentMatch ? indentMatch[0].length / 2 : 0
                              const content = line.trim()
                              
                              // Match markdown links [text](url)
                              const linkMatch = content.match(/\[(.*?)\]\((.*?)\)/)
                              const contentElement = linkMatch ? (
                                <>
                                  {content.split(/\[.*?\]\(.*?\)/)[0]}
                                  <a 
                                    href={linkMatch[2]} 
                                    className="text-sm font-medium hover:underline" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                  >
                                    {linkMatch[1]}
                                  </a>
                                  {content.split(/\[.*?\]\(.*?\)/)[1]}
                                </>
                              ) : content

                              if (indent === 0) {
                                // New top-level item
                                if (currentList.length > 0) {
                                  result.push(<ul key={`list-${index}`} className="pl-4 text-sm">{currentList}</ul>)
                                  currentList = []
                                }
                                result.push(
                                  <li key={index} className="font-semibold my-2">
                                    {contentElement}
                                  </li>
                                )
                                currentLevel = 0
                              } else if (indent === 1) {
                                // Subsection
                                if (currentList.length > 0) {
                                  result.push(<ul key={`list-${index}`} className="pl-4 text-sm">{currentList}</ul>)
                                  currentList = []
                                }
                                result.push(
                                  <li key={index} className="font-medium my-1">
                                    {contentElement}
                                    <ul className="pl-4 text-sm">
                                      {currentList}
                                    </ul>
                                  </li>
                                )
                                currentList = []
                                currentLevel = 1
                              } else {
                                // Item
                                currentList.push(
                                  <li key={index} className="my-1">
                                    {contentElement}
                                  </li>
                                )
                              }
                            })

                            // Add any remaining items
                            if (currentList.length > 0) {
                              result.push(<ul key="final-list" className="pl-4 text-sm">{currentList}</ul>)
                            }

                            return <ul className="pl-0">{result}</ul>
                          }

                          return (
                            <div className="space-y-1">
                              {renderReport()}
                            </div>
                          )
                        })()}
                      </div>
                      <div className="mt-6 flex justify-center">
                        <Button
                          variant="default"
                          size="lg"
                          onClick={() => {
                            const report = generateReport(eventsToExport)
                            navigator.clipboard.writeText(report)
                            toast({
                              title: "Report copied",
                              description: "The report has been copied to your clipboard",
                            })
                          }}
                        >
                          <ClipboardCopy className="mr-2 h-4 w-4" />
                          Copy Report
                        </Button>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        </>
      )}

      {events.length === 0 && usernames.length > 0 && !isSyncing && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No events found for these usernames and date range.</p>
        </div>
      )}

      {!usernames.length && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Enter GitHub usernames to view events.</p>
        </div>
      )}
    </div>
  )
}