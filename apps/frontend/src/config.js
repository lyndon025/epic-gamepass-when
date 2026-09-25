// Configuration for the application

// The application prioritizes environment variables (VITE_API_URL).
// This allows the same code to work locally and in production without manual changes.

const config = {
    // 1. Environment Variable (Production/Custom)
    // Set VITE_API_URL in your deployment environments (Vercel, etc.)
    // or in a local .env file.

    // 2. Fallback (Local Development)
    // If no env var is set, it defaults to localhost:5000
    backendUrl: import.meta.env.VITE_API_URL || "http://localhost:5000",
};

// Default Render URL (for reference/manual override):
// Production backend: "https://epicgamepasswhen-backend-prod.onrender.com"
// Dev backend:        "https://epicgamepasswhen-backend-dev.onrender.com"
// The Vercel proxy reads BACKEND_API_URL (set per environment), not this value.

export default config;
