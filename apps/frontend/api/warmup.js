// Wakes the prediction backend when someone opens the site.
//
// The backend sleeps when idle on free hosting, so the first prediction of the
// day pays a cold-start penalty of up to a minute. Pinging it on page load moves
// that wait to while the visitor is still searching, by which point the service
// is usually already up.
//
// This runs server-side rather than from the browser on purpose: the backend's
// CORS allowlist is scoped to known frontend origins, and going through Vercel
// sidesteps that entirely.
//
// Fire-and-forget by design. It always answers 200, because "the backend is
// still waking" is the expected case, not a failure - the request that timed out
// is itself what started the container booting.
export default async function handler(req, res) {
    const backendUrl =
        process.env.BACKEND_API_URL ||
        process.env.VITE_API_URL ||
        'http://127.0.0.1:5000';

    const started = Date.now();

    try {
        // Kept under Vercel's function limit; we only need to land the request,
        // not wait for the container to finish starting.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(`${backendUrl}/api/health`, {
            signal: controller.signal,
        });
        clearTimeout(timer);

        return res.status(200).json({
            warm: response.ok,
            ms: Date.now() - started,
        });
    } catch {
        return res.status(200).json({
            warm: false,
            waking: true,
            ms: Date.now() - started,
        });
    }
}
