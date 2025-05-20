import { GitHubEvent, ReportItem } from '../types/github'
import { getEventEmoji } from './event-helpers'

// Add function to prepare report data
export const prepareReportData = (events: GitHubEvent[]): ReportItem[] => {
  const prEvents = events.filter(e => e.type === "PullRequestEvent")
  const issueEvents = events.filter(e => e.type === "IssuesEvent")

  const prSections = [
    {
      title: "Opened",
      items: prEvents
        .filter(e => e.payload.action === "opened")
        .map(e => ({
          title: e.payload.pull_request?.title || "",
          url: e.payload.pull_request?.html_url || ""
        }))
    },
    {
      title: "Reviewed",
      items: events
        .filter(e => e.type === "PullRequestReviewEvent")
        .map(e => ({
          title: e.payload.pull_request?.title || "",
          url: e.payload.pull_request?.html_url || ""
        }))
    },
    {
      title: "Closed",
      items: prEvents
        .filter(e => e.payload.action === "closed")
        .map(e => ({
          title: e.payload.pull_request?.title || "",
          url: e.payload.pull_request?.html_url || ""
        }))
    }
  ].filter(section => section.items.length > 0)

  const issueSections = [
    {
      title: "Opened",
      items: issueEvents
        .filter(e => e.payload.action === "opened")
        .map(e => ({
          title: e.payload.issue?.title || "",
          url: e.payload.issue?.html_url || ""
        }))
    },
    {
      title: "Commented",
      items: events
        .filter(e => e.type === "IssueCommentEvent")
        .map(e => ({
          title: e.payload.issue?.title || "",
          url: e.payload.comment?.html_url || ""
        }))
    },
    {
      title: "Closed",
      items: issueEvents
        .filter(e => e.payload.action === "closed")
        .map(e => ({
          title: e.payload.issue?.title || "",
          url: e.payload.issue?.html_url || ""
        }))
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
              else if (section.title === 'Closed') emoji = '✅'
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