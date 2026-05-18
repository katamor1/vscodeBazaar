export function formatRevisionTimestamp(timestamp: string): string {
  const value = timestamp.trim();
  const match = /(?:[A-Za-z]{3}\s+)?(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/.exec(value);
  if (!match) {
    return timestamp;
  }

  return `${match[1].slice(-2)}/${match[2]}/${match[3]} ${match[4]}:${match[5]}`;
}
