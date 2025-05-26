import { Suspense } from "react"
import { Header } from "./Header"
import { UserInput } from "./UserInput"
import { Filters } from "./Filters"
import { ViewModeSelector } from "./ViewModeSelector"
import { NoEvents } from "./NoEvents"
import { TimelineView } from "./TimelineView"
import { GroupedView } from "./GroupedView"
import { SummaryView } from "./SummaryView"

// Create the main page component
export default function GitHubEventViewer() {
  return (
    <Suspense fallback={<NoEvents usernames={[]} isSyncing={true} />}>
      <GitHubEventViewerClient />
    </Suspense>
  )
}

// Create a client component wrapper
function GitHubEventViewerClient() {
  // ... Move all the state and logic from app/page.tsx here ...
  // ... Break down the render into components ...
  
  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <Header lastSynced={lastSynced} />
      
      <UserInput
        usernameInput={usernameInput}
        onUsernameChange={setUsernameInput}
        dateRange={{ startDate, endDate }}
        onDateChange={validateAndSetDates}
        onSubmit={handleSubmit}
        isSyncing={isSyncing}
        onQuickSelect={setDateRange}
        onNavigatePeriod={navigatePeriod}
        quickSelectOpen={quickSelectOpen}
        onQuickSelectOpenChange={setQuickSelectOpen}
      />

      {events.length > 0 && (
        <>
          <div className="text-sm text-muted-foreground mb-4">
            Time Range: {format(startDate, "MMM d, yyyy")} 00:00 - {format(endDate, "MMM d, yyyy")} 23:59
          </div>

          <Filters
            events={events}
            showFilters={showFilters}
            onShowFiltersChange={setShowFilters}
            selectedRepos={selectedRepos}
            onRepoToggle={toggleRepoSelection}
            selectedEventTypes={selectedEventTypes}
            onEventTypeToggle={toggleEventTypeSelection}
            selectedLabels={selectedLabels}
            onLabelToggle={toggleLabelSelection}
            selectedUsername={selectedUsername}
            onUsernameSelect={setSelectedUsername}
            usernames={usernames}
            getUniqueRepos={getUniqueRepos}
            getUniqueLabels={getUniqueLabels}
            EVENT_TYPES={EVENT_TYPES}
            clearAllFilters={clearAllFilters}
          />

          <ViewModeSelector
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onExpandAll={viewMode === "grouped" ? handleExpandAll : undefined}
            isAllExpanded={expandedGroups.size > 0}
            onCopyToClipboard={viewMode === "report" ? copyReport : undefined}
          />

          <div className="space-y-3">
            {viewMode === "timeline" && (
              <TimelineView
                events={getFilteredEvents(events)}
                expandedEvents={expandedEvents}
                onEventExpand={toggleEventExpansion}
              />
            )}
            {viewMode === "grouped" && (
              <GroupedView
                events={getFilteredEvents(events)}
                expandedEvents={expandedEvents}
                onEventExpand={toggleEventExpansion}
                expandedGroups={expandedGroups}
              />
            )}
            {viewMode === "report" && (
              <SummaryView
                events={getFilteredEvents(events)}
                startDate={startDate}
                endDate={endDate}
                collapsedSections={collapsedSections}
                onSectionToggle={toggleSection}
              />
            )}
          </div>
        </>
      )}

      {events.length === 0 && (
        <NoEvents usernames={usernames} isSyncing={isSyncing} />
      )}
    </div>
  )
} 