// Addresses for a single prediction: /p/<service>/<rawg-slug>. Opening one
// loads that game and runs the prediction, so a shared link or a scanned QR
// lands on the answer itself rather than an empty search box.

export const SITE_ORIGIN = "https://epic-gamepass-when.vercel.app";

export const SERVICES = ["epic", "gamepass", "psplus", "humble"];

export function isService(key) {
    return SERVICES.includes(key);
}

// RAWG slugs are lowercase letters, digits and hyphens; anything else is not
// one of ours and is not looked up.
export function isSlug(slug) {
    return typeof slug === "string" && /^[a-z0-9][a-z0-9-]{0,120}$/.test(slug);
}

export function predictionPath(service, slug) {
    return isService(service) && isSlug(slug) ? `/p/${service}/${slug}` : null;
}

// Full address for sharing. Falls back to the site root for games typed in by
// hand, which have no RAWG slug to link to.
export function predictionUrl(service, slug) {
    const path = predictionPath(service, slug);
    return path ? `${SITE_ORIGIN}${path}` : `${SITE_ORIGIN}/`;
}
