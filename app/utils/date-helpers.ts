import { startOfDay, endOfDay } from "date-fns"

export interface DateRange {
  startDate: Date
  endDate: Date
}

/**
 * Validates and adjusts a date range to ensure:
 * 1. Start date is at start of day (00:00:00)
 * 2. End date is at end of day (23:59:59)
 * 3. Start date is not after end date
 */
export const validateDateRange = (start: Date | null, end: Date | null): DateRange | null => {
  if (!start || !end) return null

  // Create new Date objects to avoid mutating the input
  const newStart = new Date(start)
  const newEnd = new Date(end)

  // If start date is after end date, adjust end date to be same as start
  if (newStart > newEnd) {
    newEnd.setTime(newStart.getTime())
  }

  // Ensure start date is at start of day
  const validStart = startOfDay(newStart)
  // Ensure end date is at end of day
  const validEnd = endOfDay(newEnd)

  return {
    startDate: validStart,
    endDate: validEnd
  }
} 