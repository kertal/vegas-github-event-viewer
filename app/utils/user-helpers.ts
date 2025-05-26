export const parseUsernames = (input: string): string[] => {
  return input
    .split(/[,\s]+/) // Split on commas or whitespace
    .map(username => username.trim())
    .filter(username => username.length > 0)
    .map(username => username.startsWith("@") ? username.slice(1) : username)
} 