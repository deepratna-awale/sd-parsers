import { ipAddress } from "@vercel/functions";

/** Expand an IPv6 address to its eight hextets */
function expandIPv6(address: string): string[] | null {
  const [head, tail, ...rest] = address.split("::");
  if (rest.length) return null;
  const left = head ? head.split(":") : [];
  const right = tail !== undefined && tail ? tail.split(":") : [];
  const fill = tail === undefined ? 0 : 8 - left.length - right.length;
  if (fill < 0) return null;
  const parts = [...left, ...Array<string>(fill).fill("0"), ...right];
  return parts.length === 8 ? parts : null;
}

/**
 * Identify the client for rate limiting.
 *
 * IPv6 clients usually control a whole /64, so they are grouped by that prefix;
 * otherwise rotating addresses would bypass the limits.
 */
export function clientKey(request: Request): string {
  const ip =
    ipAddress(request) ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (ip.includes(":") && !ip.startsWith("::ffff:")) {
    const parts = expandIPv6(ip.split("%")[0]);
    if (parts) return `${parts.slice(0, 4).map((p) => p.toLowerCase().padStart(4, "0")).join(":")}::/64`;
  }
  return ip.replace(/^::ffff:/, "");
}

/** Comma separated list of exact addresses or prefixes (e.g. `203.0.113.`, `2001:db8:`) */
export function isBlocked(key: string, blocklist = process.env.BLOCKED_IPS ?? ""): boolean {
  return blocklist
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .some((entry) => entry && key.toLowerCase().startsWith(entry));
}
