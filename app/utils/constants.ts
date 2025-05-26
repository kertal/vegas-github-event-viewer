import { EventCategory } from "@/types/github"

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