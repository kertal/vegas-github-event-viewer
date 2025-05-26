import { GitHubEvent, EventCategory, RelatedEvents, Commit } from '../types/github'

// Add function to categorize events
export const getEventCategory = (event: GitHubEvent): EventCategory => {
  switch (event.type) {
    case "PullRequestEvent":
    case "PullRequestReviewEvent":
    case "PullRequestReviewCommentEvent":
      return "Pull Requests"
    case "IssuesEvent":
    case "IssueCommentEvent":
      return "Issues"
    case "PushEvent":
      return "Commits"
    case "CreateEvent":
    case "DeleteEvent":
    case "ForkEvent":
    case "WatchEvent":
    case "ReleaseEvent":
    case "PublicEvent":
    case "MemberEvent":
    case "GollumEvent":
      return "Repository"
    default:
      return "Other"
  }
}

// Add function to group events by category
export const groupEventsByCategory = (events: GitHubEvent[]) => {
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
export const groupEventsByCategoryAndNumber = (events: GitHubEvent[]) => {
  const groups: Record<EventCategory, Record<string, { title: string; url: string; events: GitHubEvent[] }>> = {
    "Pull Requests": {},
    "Issues": {},
    "Commits": {},
    "Repository": {},
    "Other": {}
  }

  events.forEach(event => {
    const category = getEventCategory(event)
    let number = "other"
    let title = ""
    let url = getEventUrl(event)

    switch (event.type) {
      case "PullRequestEvent":
      case "PullRequestReviewEvent":
      case "PullRequestReviewCommentEvent":
        number = event.payload.pull_request?.number?.toString() || "other"
        title = event.payload.pull_request?.title || ""
        break
      case "IssuesEvent":
      case "IssueCommentEvent":
        number = event.payload.issue?.number?.toString() || "other"
        title = event.payload.issue?.title || ""
        break
    }

    if (!groups[category][number]) {
      groups[category][number] = {
        title,
        url,
        events: []
      }
    }
    groups[category][number].events.push(event)
  })

  return groups
}

// Add function to find related events
export const findRelatedEvents = (events: GitHubEvent[]): Map<string, RelatedEvents> => {
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
export const groupRelatedEventsForTimeline = (events: GitHubEvent[]): GitHubEvent[] => {
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
export const findPRReferences = (commitMessage: string, repo: string): { number: number; url: string } | null => {
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
export const getEventSummary = (event: GitHubEvent, relatedEvents?: RelatedEvents) => {
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

// Get emoji for event type
export const getEventEmoji = (type: string) => {
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
export const getEventUrl = (event: GitHubEvent) => {
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