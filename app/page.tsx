"use client"

import React, { useEffect, useState, Suspense } from "react"
import { Moon, Sun, RefreshCw, ClipboardCopy, ChevronDown, ChevronUp } from "lucide-react"
import { format, subDays } from "date-fns"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { useToast } from "@/hooks/use-toast"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { GitHubEvent, EventCategory, ViewMode, UserPreferences } from "./types/github"
import { getEventCategory, groupEventsByCategoryAndNumber, groupRelatedEventsForTimeline, getEventSummary } from "./utils/event-helpers"
import { prepareReportData, formatReportForSlack } from "./utils/report-helpers"



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

// Add interface for report data
interface ReportItem {
  title: string
  sections: {
    title: string
    items: {
      title: string
      url: string
    }[]
  }[]
}

// Add back the truncateMiddle function
const truncateMiddle = (str: string, maxLength: number = 150): string => {
  if (str.length <= maxLength) return str
  const halfLength = Math.floor((maxLength - 3) / 2)
  return `${str.slice(0, halfLength)}...${str.slice(-halfLength)}`
}

// Add function to categorize events

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

// Add function to safely parse usernames
const parseUsernames = (input: string): string[] => {
  // Split by comma and clean up each username
  return input
    .split(',')
    .map(name => name.trim())
    // Only allow valid GitHub usernames (alphanumeric and hyphens, 1-39 chars)
    .filter(name => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(name))
    // Remove duplicates
    .filter((name, index, self) => self.indexOf(name) === index)
    // Limit to reasonable number of usernames
    .slice(0, 10)
}

// Create a client component wrapper
function GitHubEventViewerClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // State
  const [events, setEvents] = useState<GitHubEvent[]>([])
  const [usernames, setUsernames] = useState<string[]>([])
  const [usernameInput, setUsernameInput] = useState("")
  const [startDate, setStartDate] = useState<Date>(() => {
    const date = subDays(new Date(), 4)
    date.setHours(0, 0, 0, 0)
    return date
  })
  const [endDate, setEndDate] = useState<Date>(() => {
    const date = new Date()
    date.setHours(23, 59, 59, 999)
    return date
  })
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>("grouped")
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set())
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(true)
  const [showQuickDateOptions, setShowQuickDateOptions] = useState(false)
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set())
  const [lastRequestKey, setLastRequestKey] = useState<string>("")
  const [quickSelectOpen, setQuickSelectOpen] = useState(false)

  const { theme, setTheme } = useTheme()
  const { toast } = useToast()


  // Load user preferences and handle URL parameters
  useEffect(() => {
    // Get usernames from URL first
    const urlUsernames = searchParams.get('usernames')
    const parsedUrlUsernames = urlUsernames ? parseUsernames(urlUsernames) : []
    
    // If URL has valid usernames, use them
    if (parsedUrlUsernames.length > 0) {
      setUsernames(parsedUrlUsernames)
      setUsernameInput(parsedUrlUsernames.join(', '))
    } else {
      // Otherwise, try to load from localStorage
      const savedPrefs = localStorage.getItem("github-event-viewer-prefs")
      if (savedPrefs) {
        try {
          const prefs: UserPreferences = JSON.parse(savedPrefs)
          if (prefs.usernames && prefs.usernames.length > 0) {
            setUsernames(prefs.usernames)
            setUsernameInput(prefs.usernames.join(', '))
          }
        } catch (error) {
          console.error("Error parsing saved preferences:", error)
        }
      }
    }

    // Load other preferences from localStorage
    const savedPrefs = localStorage.getItem("github-event-viewer-prefs")
    if (savedPrefs) {
      try {
        const prefs: UserPreferences = JSON.parse(savedPrefs)
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
  }, [searchParams]) // Add searchParams as dependency

  // Update URL when usernames change
  useEffect(() => {
    if (usernames.length > 0) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('usernames', usernames.join(','))
      router.push(`?${params.toString()}`)
    } else {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('usernames')
      router.push(`?${params.toString()}`)
    }
  }, [usernames, router, searchParams])

  // Add effect to trigger fetchEvents when usernames are loaded
  useEffect(() => {
    if (usernames.length > 0) {
      fetchEvents()
    }
  }, [usernames]) // Only trigger when usernames change

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
    const newUsernames = parseUsernames(usernameInput)
    setUsernames(newUsernames)
    fetchEvents()
  }

  // Set date range presets
  const setDateRange = (preset: "today" | "week" | "month" | "threeDays") => {
    let start: Date
    let end: Date

    switch (preset) {
      case "today":
        start = new Date()
        start.setHours(0, 0, 0, 0)
        end = new Date()
        end.setHours(23, 59, 59, 999)
        break
      case "week": {
        // Get current date
        const now = new Date()
        // Get the day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
        const currentDay = now.getDay()
        // Calculate days to subtract to get to Monday (if Sunday, subtract 6 days)
        const daysToMonday = currentDay === 0 ? 6 : currentDay - 1
        
        // Set start to Monday
        start = new Date()
        start.setDate(now.getDate() - daysToMonday)
        start.setHours(0, 0, 0, 0)
        
        // Set end to Sunday
        end = new Date(start)
        end.setDate(start.getDate() + 6)
        end.setHours(23, 59, 59, 999)
        break
      }
      case "month": {
        // Get current date
        const now = new Date()
        
        // Set start to first day of current month
        start = new Date(now.getFullYear(), now.getMonth(), 1)
        start.setHours(0, 0, 0, 0)
        
        // Set end to last day of current month
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        end.setHours(23, 59, 59, 999)
        break
      }
      case "threeDays":
        start = subDays(new Date(), 3)
        start.setHours(0, 0, 0, 0)
        end = new Date()
        end.setHours(23, 59, 59, 999)
        break
      default:
        start = subDays(new Date(), 4)
        start.setHours(0, 0, 0, 0)
        end = new Date()
        end.setHours(23, 59, 59, 999)
    }

    setStartDate(start)
    setEndDate(end)
    setQuickSelectOpen(false)
    // Automatically submit the form after setting the date range
    if (usernames.length > 0) {
      fetchEvents()
    }
  }

  // Helper function to validate and set dates
  const validateAndSetDates = (newStartDate: Date | null, newEndDate: Date | null) => {
    if (!newStartDate || !newEndDate) return

    // Ensure we're working with copies
    const start = new Date(newStartDate)
    const end = new Date(newEndDate)

    // If start date is after end date, adjust the other date
    if (start > end) {
      if (start === newStartDate) {
        // If setting start date, move end date forward
        end.setTime(start.getTime())
        end.setHours(23, 59, 59, 999)
        setEndDate(end)
      } else {
        // If setting end date, move start date backward
        start.setTime(end.getTime())
        start.setHours(0, 0, 0, 0)
        setStartDate(start)
      }
    }

    // Set the date that was actually changed
    if (start === newStartDate) {
      setStartDate(start)
    } else {
      setEndDate(end)
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

  // Update the copy report functionality to use rich text
  const copyReport = async () => {
    const eventsToExport = getFilteredEvents(events)
    const reportData = prepareReportData(eventsToExport)
    
    // Create HTML version of the report
    const htmlContent = `
      <div>
        <b>GitHub Activity Report</b>
        <p>${format(startDate, "MMM d, yyyy")} - ${format(endDate, "MMM d, yyyy")}</p>
        ${reportData.map(item => `
          <ul>
            <li>${item.title}</li>
            ${item.sections.map(section => `
              <ul>
                <li>${section.title}</li>
                <ul>
                  ${section.items.map(listItem => {
                    // Determine emoji based on section title and item title
                    let emoji = '📋' // default emoji
                    if (item.title === 'Pull Requests') {
                      if (section.title === 'Opened') emoji = '🔀'
                      else if (section.title === 'Reviewed') emoji = '👀'
                      else if (section.title === 'Closed') emoji = '✅'
                    } else if (item.title === 'Issues') {
                      if (section.title === 'Opened') emoji = '❓'
                      else if (section.title === 'Commented') emoji = '💬'
                      else if (section.title === 'Closed') emoji = '✅'
                    }
                    return `
                      <li>
                        <a href="${listItem.url}">${emoji} ${listItem.title}</a>
                      </li>
                    `
                  }).join('')}
                </ul>
              </ul>
            `).join('')}
          </ul>
        `).join('')}
      </div>
    `

    // Create plain text version (Slack format)
    const plainText = formatReportForSlack(reportData)

    // Create Blob items for each mime type
    const blobHtml = new Blob([htmlContent], { type: 'text/html' })
    const blobPlain = new Blob([plainText], { type: 'text/plain' })

    const clipboardItemInput = {
      'text/html': blobHtml,
      'text/plain': blobPlain
    }

    try {
      // Write to clipboard
      await navigator.clipboard.write([
        new ClipboardItem(clipboardItemInput)
      ])
      
      toast({
        title: "Report copied",
        description: "The report has been copied to your clipboard in both rich text and Slack format",
      })
    } catch (err) {
      console.error('Copy failed:', err)
      toast({
        title: "Copy failed",
        description: "Failed to copy the report to clipboard",
        variant: "destructive",
      })
    }
  }

  // Update the renderReport function to use the new data structure
  const renderReport = () => {
    const eventsToExport = getFilteredEvents(events)
    const reportData = prepareReportData(eventsToExport)
    
    // Helper function to get actors for a specific item
    const getItemActors = (url: string) => {
      return new Map(
        eventsToExport
          .filter(e => {
            const eventUrl = e.payload.pull_request?.html_url || 
                           e.payload.issue?.html_url || 
                           e.payload.comment?.html_url
            return eventUrl === url
          })
          .map(e => [e.actor.login, e.actor.avatar_url])
      )
    }
    
    if (reportData.length === 0) {
      return (
        <div className="text-center py-4 text-muted-foreground">
          No activity to report in this time range.
        </div>
      )
    }
    
    return (
      <div className="space-y-1">
        <ul className="pl-0">
          {reportData.map((item, index) => (
            <li key={index} className="mb-4">
              <div className="font-semibold text-lg mb-2">{item.title}</div>
              <ul className="pl-4 space-y-2 list-disc">
                {item.sections.map((section, sectionIndex) => (
                  <li key={sectionIndex} className="mb-2">
                    <div className="font-medium text-base mb-1">{section.title}</div>
                    <ul className="pl-4 space-y-1 list-disc">
                      {section.items.map((listItem, listIndex) => {
                        const actors = getItemActors(listItem.url)
                        return (
                          <li key={listIndex} className="text-sm flex items-center gap-2">
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
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  // Add helper function to calculate date range duration
  const getDateRangeDuration = () => {
    return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  }

  // Add function to navigate periods
  const navigatePeriod = (direction: 'next' | 'previous') => {
    const durationDays = getDateRangeDuration()
    const newStartDate = new Date()
    const newEndDate = new Date()

    if (direction === 'next') {
      // Start from the day after current end date
      newStartDate.setTime(endDate.getTime())
      newStartDate.setDate(endDate.getDate() + 1)
      newStartDate.setHours(0, 0, 0, 0)
      
      // End date is start date plus duration minus 1 (since start date counts as day 1)
      newEndDate.setTime(newStartDate.getTime())
      newEndDate.setDate(newStartDate.getDate() + durationDays - 1)
      newEndDate.setHours(23, 59, 59, 999)
    } else {
      // End date is the day before current start date
      newEndDate.setTime(startDate.getTime())
      newEndDate.setDate(startDate.getDate() - 1)
      newEndDate.setHours(23, 59, 59, 999)
      
      // Start date is end date minus duration plus 1 (since end date counts as day 1)
      newStartDate.setTime(newEndDate.getTime())
      newStartDate.setDate(newEndDate.getDate() - durationDays + 1)
      newStartDate.setHours(0, 0, 0, 0)
    }

    setStartDate(newStartDate)
    setEndDate(newEndDate)
    setQuickSelectOpen(false)

    if (usernames.length > 0) {
      fetchEvents()
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
                          onSelect={(date) => {
                            if (date) {
                              const newDate = new Date(date)
                              newDate.setHours(0, 0, 0, 0)
                              validateAndSetDates(newDate, endDate)
                            }
                          }}
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
                          onSelect={(date) => {
                            if (date) {
                              const newDate = new Date(date)
                              newDate.setHours(23, 59, 59, 999)
                              validateAndSetDates(startDate, newDate)
                            }
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <Popover open={quickSelectOpen} onOpenChange={setQuickSelectOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10">
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2" align="end">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 flex-1"
                              onClick={() => navigatePeriod('previous')}
                            >
                              Previous
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 flex-1"
                              onClick={() => navigatePeriod('next')}
                            >
                              Next
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-full"
                              onClick={() => {
                                setDateRange("today")
                              }}
                            >
                              Today
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-full"
                              onClick={() => {
                                setDateRange("threeDays")
                              }}
                            >
                              3 Days
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-full"
                              onClick={() => {
                                setDateRange("week")
                              }}
                            >
                              This Week
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-full"
                              onClick={() => {
                                setDateRange("month")
                              }}
                            >
                              This Month
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
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
          </form>
        </CardContent>
      </Card>

      {events.length > 0 && (
        <>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-muted-foreground">
              Time Range: {format(startDate, "MMM d, yyyy")} 00:00 - {format(endDate, "MMM d, yyyy")} 23:59
            </div>
          </div>

          <Card className="mb-6">
            <CardContent className="pt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Filters</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className="flex items-center gap-2 text-muted-foreground"
                  >
                    <span className="text-xs">{getFilterDescription()}</span>
                    {getActiveFilterCount() > 0 && !showFilters && (
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
                            onClick={() => toggleRepoSelection(repo)}
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
                            onClick={() => toggleEventTypeSelection(category as EventCategory)}
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
            </CardContent>
          </Card>

          <div className="flex justify-between items-center mb-2">
            <div className="inline-flex rounded-md border border-input bg-background">
              <Button
                variant={viewMode === "timeline" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("timeline")}
                className="rounded-r-none border-r"
              >
                Timeline
              </Button>
              <Button
                variant={viewMode === "grouped" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grouped")}
                className="rounded-none border-r"
              >
                Grouped
              </Button>
              <Button
                variant={viewMode === "report" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("report")}
                className="rounded-l-none"
              >
                Summary
              </Button>
            </div>
            {viewMode === "grouped" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const allGroups = Object.entries(groupEventsByCategoryAndNumber(getFilteredEvents(events)))
                    .flatMap(([category, numberGroups]) => 
                      Object.keys(numberGroups).map(number => `${category}-${number}`)
                    )
                  if (expandedGroups.size === allGroups.length) {
                    setExpandedGroups(new Set())
                  } else {
                    setExpandedGroups(new Set(allGroups))
                  }
                }}
                className="flex items-center gap-1"
              >
                {expandedGroups.size > 0 ? (
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
                      .map(([number, group]) => {
                        const groupKey = `${category}-${number}`
                        const isExpanded = (category === "Other") || expandedGroups.has(groupKey)
                        
                        // Get unique actors for this group
                        const actors = new Map<string, string>()
                        group.events.forEach(event => {
                          if (!actors.has(event.actor.login)) {
                            actors.set(event.actor.login, event.actor.avatar_url)
                          }
                        })

                        return (
                          <div key={number} className="space-y-1">
                            {number !== 'other' && category !== "Other" && (
                              <div className="pl-2 flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => {
                                    const newExpanded = new Set(expandedGroups)
                                    if (isExpanded) {
                                      newExpanded.delete(groupKey)
                                    } else {
                                      newExpanded.add(groupKey)
                                    }
                                    setExpandedGroups(newExpanded)
                                  }}
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="h-3 w-3" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3" />
                                  )}
                                </Button>
                                <a
                                  href={group.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-medium text-muted-foreground hover:underline"
                                >
                                  {truncateMiddle(group.title)}
                                </a>
                                <div className="flex -space-x-1 ml-auto">
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
                            )}
                            {isExpanded && group.events.map((event) => {
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
                                            {truncateMiddle(eventInfo.summary)}
                                          </a>
                                        </div>
                                        {eventInfo.title && number === 'other' && (
                                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                                            {truncateMiddle(eventInfo.title)}
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
                        )
                      })}
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
                              {truncateMiddle(eventInfo.summary)}
                            </a>
                          </div>
                          {eventInfo.title && (
                            <div className="text-xs text-muted-foreground truncate mt-0.5">
                              {truncateMiddle(eventInfo.title)}
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
                          onClick={copyReport}
                        >
                          <ClipboardCopy className="mr-2 h-4 w-4" />
                          Export to Slack
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

// Create the main page component
export default function GitHubEventViewer() {
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <GitHubEventViewerClient />
    </Suspense>
  )
}