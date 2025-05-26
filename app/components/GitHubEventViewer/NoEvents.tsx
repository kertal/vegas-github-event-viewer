interface NoEventsProps {
  usernames: string[]
  isSyncing: boolean
}

export function NoEvents({ usernames, isSyncing }: NoEventsProps) {
  if (isSyncing) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (usernames.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Enter GitHub usernames to view events.</p>
      </div>
    )
  }

  return (
    <div className="text-center py-12">
      <p className="text-muted-foreground">No events found for these usernames and date range.</p>
    </div>
  )
} 