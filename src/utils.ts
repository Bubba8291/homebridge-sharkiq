// Format paramaters for GET request
function formatParams(params): string {
  return '?' + Object
    .keys(params)
    .map((key) => {
      return key + '=' + encodeURIComponent(params[key]);
    })
    .join('&');
}

// Add seconds to a date
function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

// Subtract seconds from a date
function subtractSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() - seconds * 1000);
}

export { formatParams, addSeconds, subtractSeconds };
