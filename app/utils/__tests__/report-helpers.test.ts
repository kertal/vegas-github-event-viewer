import { GitHubEvent } from "../../types/github"
import { prepareReportData, formatReportForSlack, formatReportAsHtml } from "../report-helpers"

describe('report formatting', () => {
  const mockReportData = [
    {
      title: "Pull Requests",
      sections: [
        {
          title: "Opened",
          items: [
            {
              title: "Add new feature",
              url: "https://github.com/org/repo/pull/1"
            },
            {
              title: "Fix bug in login",
              url: "https://github.com/org/repo/pull/2"
            }
          ]
        },
        {
          title: "Merged",
          items: [
            {
              title: "Update documentation",
              url: "https://github.com/org/repo/pull/3"
            }
          ]
        }
      ]
    },
    {
      title: "Issues",
      sections: [
        {
          title: "Opened",
          items: [
            {
              title: "Performance issue in search",
              url: "https://github.com/org/repo/issues/4"
            }
          ]
        },
        {
          title: "Closed",
          items: [
            {
              title: "Fix navigation bug",
              url: "https://github.com/org/repo/issues/5"
            }
          ]
        }
      ]
    }
  ]

  describe('formatReportForSlack', () => {
    it('should format report data correctly for Slack', () => {
      const result = formatReportForSlack(mockReportData)
      
      // Should use "PRs" instead of "Pull Requests"
      expect(result).toContain('PRs - Opened')
      expect(result).toContain('PRs - Merged')
      
      // Should include markdown links
      expect(result).toContain('[Add new feature](https://github.com/org/repo/pull/1)')
      expect(result).toContain('[Fix bug in login](https://github.com/org/repo/pull/2)')
      
      // Should maintain section structure
      expect(result).toContain('Issues - Opened')
      expect(result).toContain('Issues - Closed')
      
      // Should include bullet points
      expect(result).toMatch(/^• /m)
      
      // Should have blank lines between sections
      expect(result).toMatch(/\n\n/)
    })

    it('should handle empty report data', () => {
      const result = formatReportForSlack([])
      expect(result).toBe('')
    })

    it('should handle sections with no items', () => {
      const emptySection = [{
        title: "Pull Requests",
        sections: [{
          title: "Opened",
          items: []
        }]
      }]
      const result = formatReportForSlack(emptySection)
      expect(result).toContain('PRs - Opened')
      expect(result.trim().split('\n').length).toBe(1) // Just the header, since we don't need a blank line for empty sections
    })
  })

  describe('formatReportAsHtml', () => {
    it('should format report data correctly as HTML', () => {
      const result = formatReportAsHtml(mockReportData)
      
      // Should use "PRs" instead of "Pull Requests"
      expect(result).toContain('<h3>PRs - Opened</h3>')
      expect(result).toContain('<h3>PRs - Merged</h3>')
      
      // Should include HTML links
      expect(result).toContain('<a href="https://github.com/org/repo/pull/1">Add new feature</a>')
      expect(result).toContain('<a href="https://github.com/org/repo/pull/2">Fix bug in login</a>')
      
      // Should maintain section structure
      expect(result).toContain('<h3>Issues - Opened</h3>')
      expect(result).toContain('<h3>Issues - Closed</h3>')
      
      // Should include list items
      expect(result).toContain('<ul>')
      expect(result).toContain('</ul>')
      expect(result).toContain('<li>')
      expect(result).toContain('</li>')
      
      // Should have proper HTML structure
      expect(result).toMatch(/<h3>.*<\/h3>\n<ul>/)
      expect(result).toMatch(/<\/ul>\n\n/)
    })

    it('should handle empty report data', () => {
      const result = formatReportAsHtml([])
      expect(result).toBe('')
    })

    it('should handle sections with no items', () => {
      const emptySection = [{
        title: "Pull Requests",
        sections: [{
          title: "Opened",
          items: []
        }]
      }]
      const result = formatReportAsHtml(emptySection)
      expect(result).toContain('<h3>PRs - Opened</h3>')
      expect(result).toContain('<ul>')
      expect(result).toContain('</ul>')
      expect(result.match(/<li>/g)).toBeNull() // No list items
    })

    it('should properly escape HTML in titles', () => {
      const dataWithHtml = [{
        title: "Pull Requests",
        sections: [{
          title: "Opened",
          items: [{
            title: "<script>alert('xss')</script>",
            url: "https://github.com/org/repo/pull/1"
          }]
        }]
      }]
      const result = formatReportAsHtml(dataWithHtml)
      expect(result).not.toContain('<script>')
      expect(result).toContain('&lt;script&gt;')
    })
  })
}) 