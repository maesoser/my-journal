export function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

export function getSessionId(): string {
  return `session-${getTodayDateString()}`;
}
