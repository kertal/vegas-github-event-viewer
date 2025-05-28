import { RefreshCw, ChevronDown } from "lucide-react"
import { format } from "date-fns"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Card, CardContent } from "../../../components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover"
import { Calendar } from "../../../components/ui/calendar"
import { DateRange } from "../../types/github"
import { cn } from "../../../lib/utils"

interface UserInputProps {
  usernameInput: string
  onUsernameChange: (value: string) => void
  dateRange: DateRange
  onDateChange: (range: DateRange) => void
  onSubmit: () => void
  isSyncing: boolean
  onQuickSelect: (preset: "today" | "week" | "month" | "threeDays") => void
  onNavigatePeriod: (direction: 'next' | 'previous') => void
  quickSelectOpen: boolean
  onQuickSelectOpenChange: (open: boolean) => void
  hasPendingChanges?: boolean
}

export function UserInput({
  usernameInput,
  onUsernameChange,
  dateRange,
  onDateChange,
  onSubmit,
  isSyncing,
  onQuickSelect,
  onNavigatePeriod,
  quickSelectOpen,
  onQuickSelectOpenChange,
  hasPendingChanges = false
}: UserInputProps) {
  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label htmlFor="username" className="block text-sm font-medium mb-1">
                GitHub Usernames
              </label>
              <Input
                id="username"
                value={usernameInput}
                onChange={(e) => onUsernameChange(e.target.value)}
                placeholder="Enter GitHub usernames (comma-separated)"
                className="w-full"
              />
            </div>

            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Date Range</label>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-start text-left font-normal flex-1">
                        {format(dateRange.startDate, "EEE, MMM d, yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateRange.startDate}
                        onSelect={(date) => date && onDateChange({ ...dateRange, startDate: date })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="flex items-center">to</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-start text-left font-normal flex-1">
                        {format(dateRange.endDate, "EEE, MMM d, yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateRange.endDate}
                        onSelect={(date) => date && onDateChange({ ...dateRange, endDate: date })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <Popover open={quickSelectOpen} onOpenChange={onQuickSelectOpenChange}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-10 w-10">
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="end">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 flex-1"
                            onClick={() => onNavigatePeriod('previous')}
                          >
                            Previous
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 flex-1"
                            onClick={() => onNavigatePeriod('next')}
                          >
                            Next
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-full"
                            onClick={() => onQuickSelect("today")}
                          >
                            Today
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-full"
                            onClick={() => onQuickSelect("threeDays")}
                          >
                            3 Days
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-full"
                            onClick={() => onQuickSelect("week")}
                          >
                            This Week
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-full"
                            onClick={() => onQuickSelect("month")}
                          >
                            This Month
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            <div className="flex items-end">
              <Button 
                type="submit" 
                disabled={!usernameInput || isSyncing} 
                className={cn(
                  "h-10",
                  hasPendingChanges && "bg-yellow-600 hover:bg-yellow-700"
                )}
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    {hasPendingChanges && <RefreshCw className="mr-2 h-4 w-4" />}
                    {hasPendingChanges ? "Fetch" : "Refresh"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
} 