import {
  getEventCategory,
  groupEventsByCategory,
  groupEventsByCategoryAndNumber,
  findRelatedEvents,
  findPRReferences,
  getEventSummary,
  getEventUrl
} from '../event-helpers'
import { GitHubEvent, EventCategory } from '../../types/github'

// Mock GitHub event data
const mockPullRequestEvent: GitHubEvent = {
  id: '1',
  type: 'PullRequestEvent',
  actor: { 
    login: 'testuser',
    avatar_url: 'https://avatars.githubusercontent.com/u/1',
    url: 'https://api.github.com/users/testuser'
  },
  repo: { 
    name: 'test/repo'
  },
  payload: {
    action: 'opened',
    pull_request: {
      number: 123,
      title: 'Test PR',
      body: 'Fixes #456',
      html_url: 'https://github.com/test/repo/pull/123',
      user: {
        login: 'testuser'
      }
    }
  },
  created_at: '2024-03-20T10:00:00Z'
}

const mockIssueEvent: GitHubEvent = {
  id: '2',
  type: 'IssuesEvent',
  actor: { 
    login: 'testuser',
    avatar_url: 'https://avatars.githubusercontent.com/u/1',
    url: 'https://api.github.com/users/testuser'
  },
  repo: { 
    name: 'test/repo'
  },
  payload: {
    action: 'opened',
    issue: {
      number: 456,
      title: 'Test Issue',
      html_url: 'https://github.com/test/repo/issues/456'
    }
  },
  created_at: '2024-03-20T09:00:00Z'
}

describe('getEventCategory', () => {
  it('should categorize pull request events correctly', () => {
    expect(getEventCategory(mockPullRequestEvent)).toBe('Pull Requests')
    expect(getEventCategory({ ...mockPullRequestEvent, type: 'PullRequestReviewEvent' })).toBe('Pull Requests')
    expect(getEventCategory({ ...mockPullRequestEvent, type: 'PullRequestReviewCommentEvent' })).toBe('Pull Requests')
  })

  it('should categorize issue events correctly', () => {
    expect(getEventCategory(mockIssueEvent)).toBe('Issues')
    expect(getEventCategory({ ...mockIssueEvent, type: 'IssueCommentEvent' })).toBe('Issues')
  })

  it('should categorize commit events correctly', () => {
    expect(getEventCategory({ ...mockPullRequestEvent, type: 'PushEvent' })).toBe('Commits')
  })

  it('should categorize repository events correctly', () => {
    const repoEvents = ['CreateEvent', 'DeleteEvent', 'ForkEvent', 'WatchEvent', 'ReleaseEvent', 'PublicEvent', 'MemberEvent', 'GollumEvent']
    repoEvents.forEach(type => {
      expect(getEventCategory({ ...mockPullRequestEvent, type })).toBe('Repository')
    })
  })

  it('should categorize unknown events as Other', () => {
    expect(getEventCategory({ ...mockPullRequestEvent, type: 'UnknownEvent' })).toBe('Other')
  })
})

describe('groupEventsByCategory', () => {
  it('should group events by their categories', () => {
    const events = [mockPullRequestEvent, mockIssueEvent]
    const grouped = groupEventsByCategory(events)

    expect(grouped['Pull Requests']).toHaveLength(1)
    expect(grouped['Issues']).toHaveLength(1)
    expect(grouped['Pull Requests'][0]).toBe(mockPullRequestEvent)
    expect(grouped['Issues'][0]).toBe(mockIssueEvent)
  })

  it('should handle empty event list', () => {
    const grouped = groupEventsByCategory([])
    expect(Object.keys(grouped)).toHaveLength(0)
  })
})

describe('findPRReferences', () => {
  it('should find PR references in commit messages', () => {
    expect(findPRReferences('Fix bug PR #123', 'test/repo')).toEqual({
      number: 123,
      url: 'https://github.com/test/repo/pull/123'
    })
    expect(findPRReferences('Fixes #456', 'test/repo')).toEqual({
      number: 456,
      url: 'https://github.com/test/repo/pull/456'
    })
    expect(findPRReferences('Closes #789', 'test/repo')).toEqual({
      number: 789,
      url: 'https://github.com/test/repo/pull/789'
    })
  })

  it('should return null for messages without PR references', () => {
    expect(findPRReferences('Regular commit message', 'test/repo')).toBeNull()
    expect(findPRReferences('', 'test/repo')).toBeNull()
  })
})

describe('findRelatedEvents', () => {
  it('should link PR and issue when PR fixes an issue', () => {
    const events = [mockPullRequestEvent, mockIssueEvent]
    const related = findRelatedEvents(events)
    
    const issueKey = 'test/repo#456'
    const relatedIssue = related.get(issueKey)

    expect(relatedIssue).toBeDefined()
    expect(relatedIssue?.issue).toBe(mockIssueEvent)
    expect(relatedIssue?.pr).toBe(mockPullRequestEvent)
  })

  it('should handle events without relationships', () => {
    const prWithoutRef: GitHubEvent = {
      ...mockPullRequestEvent,
      payload: {
        ...mockPullRequestEvent.payload,
        pull_request: {
          ...mockPullRequestEvent.payload.pull_request!,
          number: 123,
          title: 'Test PR',
          html_url: 'https://github.com/test/repo/pull/123',
          body: 'No reference to any issue'
        }
      }
    }
    
    const events = [prWithoutRef, mockIssueEvent]
    const related = findRelatedEvents(events)

    expect(related.get('test/repo#123')).toBeDefined()
    expect(related.get('test/repo#456')).toBeDefined()
    expect(related.size).toBe(2)
  })
})

describe('getEventUrl', () => {
  it('should return correct URL for pull request events', () => {
    expect(getEventUrl(mockPullRequestEvent)).toBe('https://github.com/test/repo/pull/123')
  })

  it('should return correct URL for issue events', () => {
    expect(getEventUrl(mockIssueEvent)).toBe('https://github.com/test/repo/issues/456')
  })

  it('should return repository URL for other events', () => {
    const otherEvent: GitHubEvent = { 
      ...mockPullRequestEvent, 
      type: 'WatchEvent',
      payload: {
        action: 'started'
      }
    }
    expect(getEventUrl(otherEvent)).toBe('https://github.com/test/repo')
  })
})

describe('getEventSummary', () => {
  it('should generate correct summary for pull request events', () => {
    const summary = getEventSummary(mockPullRequestEvent)
    expect(summary.summary).toContain('testuser')
    expect(summary.summary).toContain('opened')
    expect(summary.summary).toContain('pull request')
    expect(summary.title).toBe('#123 Test PR')
  })

  it('should generate correct summary for issue events', () => {
    const summary = getEventSummary(mockIssueEvent)
    expect(summary.summary).toContain('testuser')
    expect(summary.summary).toContain('opened')
    expect(summary.summary).toContain('issue')
    expect(summary.title).toBe('#456 Test Issue')
  })
}) 