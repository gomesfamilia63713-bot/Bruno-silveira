export function isConnectivityError(error: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const value = error as { message?: string; details?: string; hint?: string } | null;
  const message = [value?.message, value?.details, value?.hint].filter(Boolean).join(" ").toLowerCase();
  return /failed to fetch|fetch failed|network|offline|timeout|timed out|connection reset|connection refused|socket|aborterror/.test(message);
}

export function isRetryableError(error: unknown) {
  const status = (error as { status?: number } | null)?.status;
  return isConnectivityError(error) || status === 429 || (typeof status === "number" && status >= 500);
}