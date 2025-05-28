import { GitHubEvent } from "../types/github"

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

// Helper function to truncate text in the middle
const truncateMiddle = (text: string, maxLength: number = 100): string => {
  if (text.length <= maxLength) return text
  const halfLength = Math.floor((maxLength - 3) / 2)
  return `${text.slice(0, halfLength)}...${text.slice(-halfLength)}`
}

export const prepareReportData = (events: GitHubEvent[]): ReportItem[] => {
  const reportData: ReportItem[] = []

  // Helper function to add an item to a section
  const addToSection = (
    categoryTitle: string,
    sectionTitle: string,
    itemTitle: string,
    itemUrl: string
  ) => {
    let category = reportData.find(item => item.title === categoryTitle)
    if (!category) {
      category = { title: categoryTitle, sections: [] }
      reportData.push(category)
    }

    let section = category.sections.find(s => s.title === sectionTitle)
    if (!section) {
      section = { title: sectionTitle, items: [] }
      category.sections.push(section)
    }

    // Check if this item already exists
    const existingItem = section.items.find(item => item.url === itemUrl)
    if (!existingItem) {
      section.items.push({ title: itemTitle, url: itemUrl })
    }
  }

  // Process each event
  events.forEach(event => {
    switch (event.type) {
      case "PullRequestEvent": {
        const action = event.payload.action
        const pr = event.payload.pull_request
        if (!pr) break

        const title = pr.title
        const url = pr.html_url
        const isMerged = pr.merged
        const mergedBy = pr.merged_by?.login
        const creator = pr.user?.login

        if (action === "opened") {
          addToSection("Pull Requests", "Opened", title, url)
        } else if (action === "closed" && isMerged && mergedBy === creator) {
          addToSection("Pull Requests", "Merged", title, url)
        } else if (action === "closed" && isMerged) {
          addToSection("Pull Requests", "Merged", title, url)
        }
        break
      }

      case "PullRequestReviewEvent": {
        const pr = event.payload.pull_request
        const review = event.payload.review
        if (!pr || !review) break

        const title = pr.title
        const url = pr.html_url

        if (review.state === "approved") {
          addToSection("Pull Requests", "Reviewed", title, url)
        }
        break
      }

      case "IssuesEvent": {
        const action = event.payload.action
        const issue = event.payload.issue
        if (!issue) break

        const title = issue.title
        const url = issue.html_url

        if (action === "opened") {
          addToSection("Issues", "Opened", title, url)
        } else if (action === "closed") {
          addToSection("Issues", "Closed", title, url)
        }
        break
      }

      case "IssueCommentEvent": {
        const issue = event.payload.issue
        if (!issue || issue.pull_request) break // Skip PR comments

        const title = issue.title
        const url = issue.html_url

        addToSection("Issues", "Commented", title, url)
        break
      }

      // Add other event types as needed
      default:
        // Handle other events if needed
        break
    }
  })

  // Sort sections and items
  reportData.forEach(category => {
    // Sort sections by priority
    const sectionOrder = {
      "Opened": 1,
      "Reviewed": 2,
      "Merged": 3,
      "Commented": 4,
      "Closed": 5
    }
    
    category.sections.sort((a, b) => {
      const orderA = sectionOrder[a.title as keyof typeof sectionOrder] || 99
      const orderB = sectionOrder[b.title as keyof typeof sectionOrder] || 99
      return orderA - orderB
    })

    // Sort items by URL (which typically includes numbers)
    category.sections.forEach(section => {
      section.items.sort((a, b) => a.url.localeCompare(b.url))
    })
  })

  // Sort categories by priority (only Pull Requests and Issues)
  const categoryOrder = ["Pull Requests", "Issues"]
  reportData.sort((a, b) => {
    const orderA = categoryOrder.indexOf(a.title)
    const orderB = categoryOrder.indexOf(b.title)
    if (orderA === -1) return 1
    if (orderB === -1) return -1
    return orderA - orderB
  })

  return reportData
}

export const formatReportForSlack = (reportData: ReportItem[]): string => {
  let text = ""

  reportData.forEach(category => {
    const categoryPrefix = category.title === "Pull Requests" ? "PRs" : category.title
    category.sections.forEach(section => {
      text += `${categoryPrefix} - ${section.title}\n`
      section.items.forEach(item => {
        text += `• [${truncateMiddle(item.title)}](${item.url})\n`
      })
      text += "\n" // Always add a blank line after each section, even if empty
    })
  })

  return text
}

export const formatReportAsHtml = (reportData: ReportItem[]): string => {
  // Helper function to escape HTML
  const escapeHtml = (text: string) => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
  }

  let html = ""

  reportData.forEach(category => {
    const categoryPrefix = category.title === "Pull Requests" ? "PRs" : category.title
    category.sections.forEach(section => {
      html += `<h3>${escapeHtml(categoryPrefix)} - ${escapeHtml(section.title)}</h3>\n<ul>\n`
      section.items.forEach(item => {
        html += `  <li><a href="${escapeHtml(item.url)}">${escapeHtml(truncateMiddle(item.title))}</a></li>\n`
      })
      html += `</ul>\n\n`
    })
  })

  return html
}

// Export truncateMiddle for testing
export { truncateMiddle } 