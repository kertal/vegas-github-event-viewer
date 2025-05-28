import { startOfDay, endOfDay, addDays, subDays } from "date-fns"

describe('date range validation', () => {
  it('should validate and adjust date ranges correctly', () => {
    // Helper function to simulate the validateAndSetDates logic
    const validateDateRange = (start: Date, end: Date): { start: Date, end: Date } => {
      const newStart = new Date(start)
      const newEnd = new Date(end)

      if (newStart > newEnd) {
        // If start date is after end date, adjust end date
        newEnd.setTime(newStart.getTime())
        newEnd.setHours(23, 59, 59, 999)
      }

      // Ensure start date has start-of-day time
      newStart.setHours(0, 0, 0, 0)
      // Ensure end date has end-of-day time
      newEnd.setHours(23, 59, 59, 999)

      return { start: newStart, end: newEnd }
    }

    // Test case 1: Normal date range
    const start1 = new Date('2024-03-20')
    const end1 = new Date('2024-03-25')
    const result1 = validateDateRange(start1, end1)
    expect(result1.start.getHours()).toBe(0)
    expect(result1.start.getMinutes()).toBe(0)
    expect(result1.end.getHours()).toBe(23)
    expect(result1.end.getMinutes()).toBe(59)
    expect(result1.start.toISOString().split('T')[0]).toBe('2024-03-20')
    expect(result1.end.toISOString().split('T')[0]).toBe('2024-03-25')

    // Test case 2: Start date after end date
    const start2 = new Date('2024-03-25')
    const end2 = new Date('2024-03-20')
    const result2 = validateDateRange(start2, end2)
    expect(result2.start.toISOString().split('T')[0]).toBe('2024-03-25')
    expect(result2.end.toISOString().split('T')[0]).toBe('2024-03-25')
    expect(result2.start.getHours()).toBe(0)
    expect(result2.end.getHours()).toBe(23)

    // Test case 3: Same day
    const start3 = new Date('2024-03-20')
    const end3 = new Date('2024-03-20')
    const result3 = validateDateRange(start3, end3)
    expect(result3.start.toISOString().split('T')[0]).toBe('2024-03-20')
    expect(result3.end.toISOString().split('T')[0]).toBe('2024-03-20')
    expect(result3.start.getHours()).toBe(0)
    expect(result3.end.getHours()).toBe(23)

    // Test case 4: With time components
    const start4 = new Date('2024-03-20T15:30:00')
    const end4 = new Date('2024-03-25T10:45:00')
    const result4 = validateDateRange(start4, end4)
    expect(result4.start.getHours()).toBe(0)
    expect(result4.start.getMinutes()).toBe(0)
    expect(result4.end.getHours()).toBe(23)
    expect(result4.end.getMinutes()).toBe(59)
    expect(result4.start.toISOString().split('T')[0]).toBe('2024-03-20')
    expect(result4.end.toISOString().split('T')[0]).toBe('2024-03-25')
  })
}) 