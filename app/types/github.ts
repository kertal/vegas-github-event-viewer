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
  }
  payload: {
    action?: string
    pull_request?: {
      number: number
      title: string
      html_url: string
      merged?: boolean
      merged_by?: {
        login: string
      }
      user?: {
        login: string
      }
      body?: string
      labels?: Label[]
    }
    issue?: {
      number: number
      title: string
      html_url: string
      pull_request?: {
        html_url: string
      }
      labels?: Label[]
    }
    comment?: {
      html_url: string
    }
    commits?: Array<{
      sha: string
      message: string
    }>
    head?: string
    ref?: string
    size?: number
    head_commit?: {
      message: string
    }
    review?: {
      state: string
    }
    release?: {
      html_url: string
    }
  }
}

export type EventCategory = "Pull Requests" | "Issues" | "Commits" | "Repository" | "Other"

export type ViewMode = "timeline" | "grouped" | "report"

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

export interface DateRange {
  startDate: Date
  endDate: Date
}

export interface Label {
  name: string
  color: string
  description?: string
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