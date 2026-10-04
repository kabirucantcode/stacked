/** Request metadata for the audit log and the session list. */

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() ?? null;
}

export function userAgentOf(request: Request): string | null {
  const ua = request.headers.get("user-agent");
  return ua ? ua.slice(0, 300) : null;
}

/** "Chrome on macOS" — a short label is far more useful than a raw UA string. */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";

  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : /Firefox\//.test(ua) ? "Firefox"
    : "Browser";

  const platform =
    /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows"
    : /Linux/.test(ua) ? "Linux"
    : "unknown OS";

  return `${browser} on ${platform}`;
}
