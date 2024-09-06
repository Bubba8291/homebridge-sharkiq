// Add seconds to a date
function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

// Subtract seconds from a date
function subtractSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() - seconds * 1000);
}

<<<<<<< Updated upstream
export { formatParams, addSeconds, subtractSeconds };
=======
function isValidDate(d: Date): boolean {
  return d instanceof Date && !isNaN(d.getTime());
}

export { addSeconds, subtractSeconds, isValidDate };
>>>>>>> Stashed changes
