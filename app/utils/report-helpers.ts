import { GitHubEvent, ReportItem } from '../types/github'
import { getEventEmoji } from './event-helpers'

// Add truncateMiddle function
const truncateMiddle = (str: string, maxLength: number = 120): string => {
  if (str.length <= maxLength) return str
  const halfLength = Math.floor((maxLength - 3) / 2)
  return `${str.slice(0, halfLength)}...${str.slice(-halfLength)}`
}

// Add function to prepare report data
export const prepareReportData = (events: GitHubEvent[]): ReportItem[] => {
  const prEvents = events.filter(e => e.type === "PullRequestEvent")
  const issueEvents = events.filter(e => e.type === "IssuesEvent")

  // Helper function to remove duplicates from items
  const removeDuplicates = (items: { title: string; url: string }[]) => {
    const seen = new Set<string>()
    return items.filter(item => {
      const key = `${item.title}|${item.url}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  // Track all issues across sections to prevent duplicates
  const seenIssues = new Set<string>()

  // Helper function to add unique issues to a section
  const addUniqueIssues = (events: GitHubEvent[], action: string, urlKey: 'html_url' | 'comment_url' = 'html_url') => {
    const items = events
      .filter(e => {
        const issueKey = `${e.repo.name}#${e.payload.issue?.number}`
        if (e.payload.action !== action || seenIssues.has(issueKey)) return false
        seenIssues.add(issueKey)
        return true
      })
      .map(e => ({
        title: truncateMiddle(e.payload.issue?.title || ""),
        url: e.payload[urlKey === 'comment_url' ? 'comment' : 'issue']?.html_url || ""
      }))
    
    return removeDuplicates(items)
  }

  const prSections = [
    {
      title: "Opened",
      items: removeDuplicates(
        prEvents
          .filter(e => e.payload.action === "opened")
          .map(e => ({
            title: truncateMiddle(e.payload.pull_request?.title || ""),
            url: e.payload.pull_request?.html_url || ""
          }))
      )
    },
    {
      title: "Reviewed",
      items: removeDuplicates(
        events
          .filter(e => e.type === "PullRequestReviewEvent")
          .map(e => ({
            title: truncateMiddle(e.payload.pull_request?.title || ""),
            url: e.payload.pull_request?.html_url || ""
          }))
      )
    },
    {
      title: "Merged",
      items: removeDuplicates(
        prEvents
          .filter(e => {
            // Only show merged PRs where the person who merged it is also the creator
            const pr = e.payload.pull_request
            return e.payload.action === "closed" && 
                   pr?.merged === true && 
                   pr?.user?.login === e.actor.login
          })
          .map(e => ({
            title: truncateMiddle(e.payload.pull_request?.title || ""),
            url: e.payload.pull_request?.html_url || ""
          }))
      )
    },
    {
      title: "Closed",
      items: removeDuplicates(
        prEvents
          .filter(e => {
            const pr = e.payload.pull_request
            return e.payload.action === "closed" && 
                   (pr?.merged !== true || // Not merged
                    (pr?.merged === true && pr?.user?.login !== e.actor.login)) // Or merged by someone else
          })
          .map(e => ({
            title: truncateMiddle(e.payload.pull_request?.title || ""),
            url: e.payload.pull_request?.html_url || ""
          }))
      )
    }
  ].filter(section => section.items.length > 0)

  const issueSections = [
    {
      title: "Opened",
      items: addUniqueIssues(issueEvents, "opened")
    },
    {
      title: "Commented",
      items: addUniqueIssues(
        events.filter(e => 
          e.type === "IssueCommentEvent" && 
          // Only include comments on issues (not PRs)
          !e.payload.issue?.pull_request
        ),
        "created",
        'comment_url'
      )
    },
    {
      title: "Closed",
      items: addUniqueIssues(issueEvents, "closed")
    }
  ].filter(section => section.items.length > 0)

  const reportItems: ReportItem[] = []

  if (prSections.length > 0) {
    reportItems.push({
      title: "Pull Requests",
      sections: prSections
    })
  }

  if (issueSections.length > 0) {
    reportItems.push({
      title: "Issues",
      sections: issueSections
    })
  }

  return reportItems
}

// Add function to format report for Slack
export const formatReportForSlack = (reportData: ReportItem[]): string => {
  return reportData.map(item => {
    const sections = item.sections
      .map(section => {
        const items = section.items
          .map(listItem => {
            // Determine emoji based on section title
            let emoji = '📋' // default emoji
            if (item.title === 'Pull Requests') {
              if (section.title === 'Opened') emoji = '🔀'
              else if (section.title === 'Reviewed') emoji = '👀'
              else if (section.title === 'Merged') emoji = '🎉'
              else if (section.title === 'Closed') emoji = '❌'
            } else if (item.title === 'Issues') {
              if (section.title === 'Opened') emoji = '❓'
              else if (section.title === 'Commented') emoji = '💬'
              else if (section.title === 'Closed') emoji = '✅'
            }
            return `${emoji} <${listItem.url}|${listItem.title}>`
          })
          .join('\n')
        return `*${section.title}*\n${items}`
      })
      .join('\n\n')
    return `*${item.title}*\n${sections}`
  }).join('\n\n')
} 