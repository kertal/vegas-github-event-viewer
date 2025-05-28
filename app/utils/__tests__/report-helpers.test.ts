import { GitHubEvent } from "../../types/github"
import { prepareReportData, formatReportForSlack, formatReportAsHtml, truncateMiddle, formatDateForUrl, parseDateFromUrl } from "../report-helpers"

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

  const mockTimeRange = {
    startDate: new Date('2024-03-01'),
    endDate: new Date('2024-03-07')
  }

  describe('truncateMiddle', () => {
    it('should not truncate text shorter than max length', () => {
      const text = "Short text"
      expect(truncateMiddle(text)).toBe(text)
    })

    it('should truncate text longer than max length', () => {
      const text = "This is a very long text that should be truncated in the middle because it exceeds the maximum length"
      const result = truncateMiddle(text)
      expect(result.length).toBeLessThanOrEqual(100)
      expect(result).toContain('...')
      expect(result).toMatch(/^This.*\.\.\..*length$/)
    })

    it('should handle custom max length', () => {
      const text = "This text should be truncated at 20 characters"
      const result = truncateMiddle(text, 20)
      expect(result.length).toBeLessThanOrEqual(20)
      expect(result).toContain('...')
    })
  })

  describe('date handling', () => {
    it('should format dates correctly for URL', () => {
      const date = new Date('2024-03-01T12:34:56Z')
      expect(formatDateForUrl(date)).toBe('2024-03-01')
    })

    it('should handle invalid dates gracefully', () => {
      const invalidDate = new Date('invalid')
      const result = formatDateForUrl(invalidDate)
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/) // Should return today's date in YYYY-MM-DD format
    })

    it('should parse valid dates from URL', () => {
      const result = parseDateFromUrl('2024-03-01')
      expect(result).toBeInstanceOf(Date)
      expect(result?.toISOString()).toContain('2024-03-01')
    })

    it('should return null for invalid dates', () => {
      expect(parseDateFromUrl('invalid-date')).toBeNull()
    })
  })

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

    it('should truncate long titles', () => {
      const longTitleData = [{
        title: "Pull Requests",
        sections: [{
          title: "Opened",
          items: [{
            title: "This is an extremely long pull request title that goes into great detail about the changes made and should definitely be truncated in the middle to maintain readability",
            url: "https://github.com/org/repo/pull/1"
          }]
        }]
      }]
      const result = formatReportForSlack(longTitleData)
      const lines = result.split('\n')
      const titleLine = lines.find(line => line.startsWith('•'))
      expect(titleLine).toBeDefined()
      expect(titleLine!.length).toBeLessThanOrEqual(150) // Account for markdown link syntax
      expect(titleLine).toContain('...')
    })

    it('should include time range in header when provided', () => {
      const result = formatReportForSlack(mockReportData, mockTimeRange)
      expect(result).toContain('Time Range: 2024-03-01 to 2024-03-07')
    })

    it('should add time range parameters to URLs when provided', () => {
      const result = formatReportForSlack(mockReportData, mockTimeRange)
      expect(result).toContain('?timeStart=2024-03-01&timeEnd=2024-03-07')
    })

    it('should not add time range when not provided', () => {
      const result = formatReportForSlack(mockReportData)
      expect(result).not.toContain('Time Range:')
      expect(result).not.toContain('timeStart=')
    })

    it('should handle malicious time range input safely', () => {
      const maliciousTimeRange = {
        startDate: new Date('"><script>alert("xss")</script>'),
        endDate: new Date('2024-03-07')
      }
      const result = formatReportForSlack(mockReportData, maliciousTimeRange)
      const today = new Date().toISOString().split('T')[0]
      expect(result).toContain(`Time Range: ${today} to 2024-03-07`)
      expect(result).not.toContain('<script>')
    })

    it('should handle URLs with existing query parameters', () => {
      const dataWithQuery = [{
        title: "Pull Requests",
        sections: [{
          title: "Opened",
          items: [{
            title: "Test PR",
            url: "https://github.com/org/repo/pull/1?draft=true"
          }]
        }]
      }]
      const result = formatReportForSlack(dataWithQuery, mockTimeRange)
      expect(result).toContain('?draft=true&timeStart=')
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

    it('should truncate long titles', () => {
      const longTitleData = [{
        title: "Pull Requests",
        sections: [{
          title: "Opened",
          items: [{
            title: "This is an extremely long pull request title that goes into great detail about the changes made and should definitely be truncated in the middle to maintain readability",
            url: "https://github.com/org/repo/pull/1"
          }]
        }]
      }]
      const result = formatReportAsHtml(longTitleData)
      expect(result).toContain('...')
      const titleMatch = result.match(/>([^<]+)</)?.[1] // Extract text between > and <
      expect(titleMatch).toBeDefined()
      expect(titleMatch!.length).toBeLessThanOrEqual(100)
    })

    it('should include time range in header when provided', () => {
      const result = formatReportAsHtml(mockReportData, mockTimeRange)
      expect(result).toContain('<p class="time-range">Time Range: 2024-03-01 to 2024-03-07</p>')
    })

    it('should add time range parameters to URLs when provided', () => {
      const result = formatReportAsHtml(mockReportData, mockTimeRange)
      expect(result).toContain('?timeStart=2024-03-01&amp;timeEnd=2024-03-07')
    })

    it('should not add time range when not provided', () => {
      const result = formatReportAsHtml(mockReportData)
      expect(result).not.toContain('Time Range:')
      expect(result).not.toContain('timeStart=')
    })

    it('should handle malicious time range input safely', () => {
      const maliciousTimeRange = {
        startDate: new Date('"><script>alert("xss")</script>'),
        endDate: new Date('2024-03-07')
      }
      const result = formatReportAsHtml(mockReportData, maliciousTimeRange)
      const today = new Date().toISOString().split('T')[0]
      expect(result).toContain(`Time Range: ${today} to 2024-03-07`)
      expect(result).not.toContain('<script>')
      // The malicious input is handled by returning today's date, so we don't need to check for escaped HTML
    })

    it('should properly encode time range parameters in URLs', () => {
      const timeRangeWithSpaces = {
        startDate: new Date('2024-03-01'),
        endDate: new Date('2024-03-07')
      }
      const result = formatReportAsHtml(mockReportData, timeRangeWithSpaces)
      expect(result).toContain(`timeStart=${encodeURIComponent('2024-03-01')}`)
      expect(result).toContain(`timeEnd=${encodeURIComponent('2024-03-07')}`)
    })

    it('should handle URLs with existing query parameters', () => {
      const dataWithQuery = [{
        title: "Pull Requests",
        sections: [{
          title: "Opened",
          items: [{
            title: "Test PR",
            url: "https://github.com/org/repo/pull/1?draft=true"
          }]
        }]
      }]
      const result = formatReportAsHtml(dataWithQuery, mockTimeRange)
      expect(result).toContain('?draft=true&amp;timeStart=')
    })
  })
}) 