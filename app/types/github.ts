// GitHub Event Types
export interface GitHubEvent {
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

export type EventCategory = "Pull Requests" | "Issues" | "Commits" | "Repository" | "Other"

export type ViewMode = "grouped" | "timeline" | "report"

export interface RelatedEvents {
  issue?: GitHubEvent
  pr?: GitHubEvent
  comments: GitHubEvent[]
}

export interface Commit {
  message: string
  sha: string
  url: string
}

export interface ReportItem {
  title: string
  sections: {
    title: string
    items: {
      title: string
      url: string
    }[]
  }[]
}

export interface UserPreferences {
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

// Event type constants
export const EVENT_TYPES: Record<EventCategory, string[]> = {
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