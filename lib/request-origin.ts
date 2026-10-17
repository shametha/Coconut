/** The public origin is explicit because App Hosting's internal Host may differ. */
export function isAllowedAppRequest(
  request: Request,
  publicOrigin = process.env.COCONUT_APP_ORIGIN,
) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const expected = new URL(publicOrigin || request.url);
    if (!["https:", "http:"].includes(expected.protocol)) return false;
    // Forwarded host headers never authorize a different caller origin.
    return origin === expected.origin;
  } catch {
    return false;
  }
}
