"use client"

import React, { useEffect, useState, Suspense } from "react"
import { Moon, Sun, RefreshCw, ClipboardCopy, ChevronDown, ChevronUp, ChevronRight } from "lucide-react"
import { format, subDays, startOfDay, endOfDay, addDays } from "date-fns"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Card, CardContent } from "../components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover"
import { Calendar } from "../components/ui/calendar"
import { useToast } from "./hooks/use-toast"
import { useTheme } from "next-themes"
import { cn } from "./lib/utils"
import { GitHubEvent, EventCategory, ViewMode, UserPreferences } from "./types/github"
import { getEventCategory, groupEventsByCategoryAndNumber, groupRelatedEventsForTimeline, getEventSummary } from "./utils/event-helpers"
import { prepareReportData, formatReportForSlack, formatReportAsHtml } from "./utils/report-helpers"
import { Header } from "./components/GitHubEventViewer/Header"
import { UserInput } from "./components/GitHubEventViewer/UserInput"
import { Filters } from "./components/GitHubEventViewer/Filters"
import { ViewModeSelector } from "./components/GitHubEventViewer/ViewModeSelector"
import { TimelineView } from "./components/GitHubEventViewer/TimelineView"
import { GroupedView } from "./components/GitHubEventViewer/GroupedView"
import { SummaryView } from "./components/GitHubEventViewer/SummaryView"
import { NoEvents } from "./components/GitHubEventViewer/NoEvents"
import { validateDateRange } from "./utils/date-helpers"

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
  const { toast } = useToast()
  const { theme, setTheme } = useTheme()
  
  // State
  const [events, setEvents] = useState<GitHubEvent[]>([])
  const [usernames, setUsernames] = useState<string[]>([])
  const [usernameInput, setUsernameInput] = useState("")
  const [startDate, setStartDate] = useState(startOfDay(subDays(new Date(), 7)))
  const [endDate, setEndDate] = useState(endOfDay(new Date()))
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>("timeline")
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set())
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [showQuickDateOptions, setShowQuickDateOptions] = useState(false)
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set())
  const [lastRequestKey, setLastRequestKey] = useState<string>("")
  const [quickSelectOpen, setQuickSelectOpen] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null)
  const [hasPendingChanges, setHasPendingChanges] = useState(false)

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

    validateAndSetDates({ startDate: newStartDate, endDate: newEndDate })
    setQuickSelectOpen(false)
  }

  // Add function to handle expand all
  const handleExpandAll = () => {
    if (expandedGroups.size > 0) {
      setExpandedGroups(new Set())
    } else {
      const allGroups = new Set<string>()
      events.forEach(event => {
        const category = getEventCategory(event)
        if (event.type === "PullRequestEvent" || event.type === "IssuesEvent") {
          const number = event.payload.pull_request?.number || event.payload.issue?.number
          if (number) {
            allGroups.add(`${category}-${number}`)
          }
        }
      })
      setExpandedGroups(allGroups)
    }
  }

  // Add function to copy report
  const copyReport = async () => {
    const eventsToExport = getFilteredEvents(events)
    const reportData = prepareReportData(eventsToExport)
    
    // Filter out collapsed sections
    const visibleReportData = reportData.map(item => ({
      ...item,
      sections: item.sections.filter(section => !collapsedSections.has(`${item.title}-${section.title}`))
    })).filter(item => item.sections.length > 0)
    
    try {
      // Create both text and HTML versions
      const plainText = formatReportForSlack(visibleReportData)
      const htmlContent = formatReportAsHtml(visibleReportData)

      // Create a clipboard item with both formats
      const clipboardItem = new ClipboardItem({
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
        'text/html': new Blob([htmlContent], { type: 'text/html' })
      })

      await navigator.clipboard.write([clipboardItem])
      toast({
        title: "Copied to clipboard",
        description: "Summary copied in both text and HTML formats",
      })
    } catch (err) {
      console.error('Copy failed:', err)
      // Fallback to plain text only if HTML copy fails
      try {
        const plainText = formatReportForSlack(visibleReportData)
        await navigator.clipboard.writeText(plainText)
        toast({
          title: "Copied to clipboard",
          description: "Summary copied in text format only",
        })
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr)
        toast({
          title: "Copy failed",
          description: "Could not copy to clipboard. Please try again.",
          variant: "destructive",
        })
      }
    }
  }

  // Helper function to validate and set dates
  const validateAndSetDates = (range: { startDate: Date | null; endDate: Date | null }) => {
    const newStartDate = range.startDate || startDate
    const newEndDate = range.endDate || endDate

    // Ensure we have valid date objects
    if (isNaN(newStartDate.getTime()) || isNaN(newEndDate.getTime())) return

    // Create start of day for start date and end of day for end date
    const validStart = startOfDay(newStartDate)
    const validEnd = endOfDay(newEndDate)

    // If start date is after end date, adjust the other date
    if (validStart > validEnd) {
      if (range.startDate) { // If changing start date
        setStartDate(validStart)
        setEndDate(endOfDay(validStart))
      } else if (range.endDate) { // If changing end date
        setStartDate(startOfDay(validEnd))
        setEndDate(validEnd)
      }
    } else {
      // Normal case - dates are in correct order
      if (range.startDate) setStartDate(validStart)
      if (range.endDate) setEndDate(validEnd)
    }

    setHasPendingChanges(true)
  }

  // Handle initial URL parameters - only run once on mount
  useEffect(() => {
    // Get usernames from URL first
    const urlUsernames = searchParams.get('usernames')
    const parsedUrlUsernames = urlUsernames ? parseUsernames(urlUsernames) : []
    
    // Get dates from URL
    const urlStartDate = searchParams.get('startDate')
    const urlEndDate = searchParams.get('endDate')

    let initialStartDate = startDate
    let initialEndDate = endDate

    if (urlStartDate && urlEndDate) {
      const parsedStart = new Date(urlStartDate)
      const parsedEnd = new Date(urlEndDate)
      if (!isNaN(parsedStart.getTime()) && !isNaN(parsedEnd.getTime())) {
        initialStartDate = startOfDay(parsedStart)
        initialEndDate = endOfDay(parsedEnd)
      }
    } else {
      // If no URL dates, try to load from localStorage
      const savedPrefs = localStorage.getItem("github-event-viewer-prefs")
      if (savedPrefs) {
        try {
          const prefs: UserPreferences = JSON.parse(savedPrefs)
          const savedStart = new Date(prefs.startDate)
          const savedEnd = new Date(prefs.endDate)
          if (!isNaN(savedStart.getTime()) && !isNaN(savedEnd.getTime())) {
            initialStartDate = startOfDay(savedStart)
            initialEndDate = endOfDay(savedEnd)
          }
        } catch (error) {
          console.error("Error parsing saved preferences:", error)
        }
      }
    }

    // Set initial dates
    setStartDate(initialStartDate)
    setEndDate(initialEndDate)
    
    // Get view mode from URL
    const urlViewMode = searchParams.get('view') as ViewMode | null
    if (urlViewMode && ['timeline', 'grouped', 'report'].includes(urlViewMode)) {
      setViewMode(urlViewMode)
    }
    
    // Handle usernames
    if (parsedUrlUsernames.length > 0) {
      setUsernames(parsedUrlUsernames)
      setUsernameInput(parsedUrlUsernames.join(', '))
      setHasPendingChanges(true)
    } else {
      // Try to load usernames from localStorage
      const savedPrefs = localStorage.getItem("github-event-viewer-prefs")
      if (savedPrefs) {
        try {
          const prefs: UserPreferences = JSON.parse(savedPrefs)
          if (prefs.usernames && prefs.usernames.length > 0) {
            setUsernames(prefs.usernames)
            setUsernameInput(prefs.usernames.join(', '))
            setHasPendingChanges(true)
          }
        } catch (error) {
          console.error("Error parsing saved preferences:", error)
        }
      }
    }

    // Set the dates
    setStartDate(startDate)
    setEndDate(endDate)

    // Load other preferences from localStorage
    const savedPrefs = localStorage.getItem("github-event-viewer-prefs")
    if (savedPrefs) {
      try {
        const prefs: UserPreferences = JSON.parse(savedPrefs)
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
  }, []) // Empty dependency array - only run once on mount

  // Update URL when parameters change - use a ref to prevent unnecessary updates
  const lastUrlUpdate = React.useRef('')
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    
    // Update all URL parameters at once
    params.set('startDate', startDate.toISOString().split('T')[0])
    params.set('endDate', endDate.toISOString().split('T')[0])
    
    if (usernames.length > 0) {
      params.set('usernames', usernames.join(','))
    } else {
      params.delete('usernames')
    }
    
    params.set('view', viewMode)
    
    const newUrl = params.toString()
    // Only update if the URL actually changed
    if (newUrl !== lastUrlUpdate.current) {
      lastUrlUpdate.current = newUrl
      router.push(`?${newUrl}`, { scroll: false })
    }
  }, [startDate, endDate, usernames, viewMode, router, searchParams])

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

  // Load collapsed sections state from localStorage
  useEffect(() => {
    const savedCollapsedSections = localStorage.getItem("github-event-collapsed-sections")
    if (savedCollapsedSections) {
      try {
        setCollapsedSections(new Set(JSON.parse(savedCollapsedSections)))
      } catch (error) {
        console.error("Error parsing saved collapsed sections:", error)
      }
    }
  }, [])

  // Save collapsed sections state to localStorage
  useEffect(() => {
    localStorage.setItem(
      "github-event-collapsed-sections",
      JSON.stringify(Array.from(collapsedSections))
    )
  }, [collapsedSections])

  // Toggle section collapse
  const toggleSection = (sectionKey: string) => {
    const newCollapsed = new Set(collapsedSections)
    if (newCollapsed.has(sectionKey)) {
      newCollapsed.delete(sectionKey)
    } else {
      newCollapsed.add(sectionKey)
    }
    setCollapsedSections(newCollapsed)
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

  // Get filtered events
  const getFilteredEvents = (events: GitHubEvent[]): GitHubEvent[] => {
    let filtered = events

    // Filter by username if selected
    if (selectedUsername) {
      filtered = filtered.filter(event => event.actor.login === selectedUsername)
    }

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
    setSelectedUsername(null)
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
  const handleSubmit = () => {
    const newUsernames = parseUsernames(usernameInput)
    if (newUsernames.join(',') !== usernames.join(',')) {
      setUsernames(newUsernames)
      setHasPendingChanges(true)
    } else {
      setUsernames(newUsernames)
      fetchEvents()
    }
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

    validateAndSetDates({ startDate: start, endDate: end })
    setQuickSelectOpen(false)
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
    setHasPendingChanges(false)

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
      <Header lastSynced={lastSynced} />
      
      <UserInput
        usernameInput={usernameInput}
        onUsernameChange={setUsernameInput}
        dateRange={{ startDate, endDate }}
        onDateChange={({ startDate: newStart, endDate: newEnd }) => {
          validateAndSetDates({ startDate: newStart, endDate: newEnd })
        }}
        onSubmit={handleSubmit}
        isSyncing={isSyncing}
        onQuickSelect={setDateRange}
        onNavigatePeriod={navigatePeriod}
        quickSelectOpen={quickSelectOpen}
        onQuickSelectOpenChange={setQuickSelectOpen}
        hasPendingChanges={hasPendingChanges}
      />

      {events.length > 0 && (
        <>
          <div className="text-sm text-muted-foreground mb-4">
            Time Range: {format(startDate, "MMM d, yyyy")} 00:00 - {format(endDate, "MMM d, yyyy")} 23:59
          </div>

          <Filters
            events={events}
            showFilters={showFilters}
            onShowFiltersChange={setShowFilters}
            selectedRepos={selectedRepos}
            onRepoToggle={toggleRepoSelection}
            selectedEventTypes={selectedEventTypes}
            onEventTypeToggle={toggleEventTypeSelection}
            selectedLabels={selectedLabels}
            onLabelToggle={toggleLabelSelection}
            selectedUsername={selectedUsername}
            onUsernameSelect={setSelectedUsername}
            usernames={usernames}
            getUniqueRepos={getUniqueRepos}
            getUniqueLabels={getUniqueLabels}
            EVENT_TYPES={EVENT_TYPES}
            clearAllFilters={clearAllFilters}
          />

          <ViewModeSelector
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onExpandAll={viewMode === "grouped" ? handleExpandAll : undefined}
            isAllExpanded={expandedGroups.size > 0}
            onCopyToClipboard={viewMode === "report" ? copyReport : undefined}
          />

          <div className="space-y-3">
            {viewMode === "timeline" && (
              <TimelineView
                events={getFilteredEvents(events)}
                expandedEvents={expandedEvents}
                onEventExpand={toggleEventExpansion}
              />
            )}
            {viewMode === "grouped" && (
              <GroupedView
                events={getFilteredEvents(events)}
                expandedEvents={expandedEvents}
                onEventExpand={toggleEventExpansion}
                expandedGroups={expandedGroups}
              />
            )}
            {viewMode === "report" && (
              <SummaryView
                events={getFilteredEvents(events)}
                startDate={startDate}
                endDate={endDate}
                collapsedSections={collapsedSections}
                onSectionToggle={toggleSection}
              />
            )}
          </div>
        </>
      )}

      {events.length === 0 && (
        <NoEvents usernames={usernames} isSyncing={isSyncing} />
      )}
    </div>
  )
}

// Create the main page component
export default function Page() {
  return (
    <Suspense fallback={<NoEvents usernames={[]} isSyncing={true} />}>
      <GitHubEventViewerClient />
    </Suspense>
  )
}