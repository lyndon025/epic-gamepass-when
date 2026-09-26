import { useEffect, useState } from "react";

// Light or dark. With no saved choice the site follows the system setting; a
// click saves an explicit choice. index.html applies a saved choice before the
// first paint, so the page never flashes the wrong theme.
const KEY = "theme";

function systemTheme() {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
}

function savedTheme() {
    try {
        const t = localStorage.getItem(KEY);
        return t === "light" || t === "dark" ? t : null;
    } catch {
        return null; // storage can be blocked; the system setting still applies
    }
}

export function useTheme() {
    const [theme, setTheme] = useState(() => savedTheme() || systemTheme());

    // Follow the system while the visitor has not chosen.
    useEffect(() => {
        const mq = window.matchMedia?.("(prefers-color-scheme: light)");
        if (!mq) return undefined;
        const onChange = () => {
            if (!savedTheme()) setTheme(systemTheme());
        };
        mq.addEventListener?.("change", onChange);
        return () => mq.removeEventListener?.("change", onChange);
    }, []);

    function toggle() {
        const next = theme === "light" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", next);
        try {
            localStorage.setItem(KEY, next);
        } catch {
            /* the choice still applies for this visit */
        }
        setTheme(next);
    }

    return [theme, toggle];
}
