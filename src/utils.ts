// Add seconds to a date
function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000)
}

// Subtract seconds from a date
function subtractSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() - seconds * 1000)
}

function isValidDate(d: Date): boolean {
  return d instanceof Date && !Number.isNaN(d.getTime())
}

export { addSeconds, isValidDate, subtractSeconds }
