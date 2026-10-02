import { useCallback, useEffect, useState } from "react";

// Small pieces of motion shared by the pages (styles/motion.css). Both respect
// the visitor's reduce-motion setting.

const reduceMotion = () =>
    typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/**
 * A figure that counts up to its value over about half a second, then stays.
 * `format` turns the in-between number into text, e.g. chanceText. Mount a new
 * one (a new key) for a new value.
 */
export function CountUp({ value, format, duration = 600 }) {
    const [shown, setShown] = useState(() => (reduceMotion() ? value : 0));
    useEffect(() => {
        if (value === null || value === undefined || reduceMotion()) return undefined;
        let raf = 0;
        let start;
        const step = (t) => {
            if (start === undefined) start = t;
            const k = Math.min(1, (t - start) / duration);
            setShown(value * (1 - (1 - k) ** 3));
            if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [value, duration]);
    return format(shown);
}

/**
 * An image that fades in once it has loaded, instead of popping in. Give it a
 * key per src so a new image fades in too.
 */
export function FadeImg({ className = "", onLoad, onLoaded, ...props }) {
    const [loaded, setLoaded] = useState(false);
    const done = useCallback(() => {
        setLoaded(true);
        onLoaded?.();
    }, [onLoaded]);
    // A cached image can finish before React attaches onLoad.
    const ref = useCallback(
        (el) => {
            if (el && el.complete && el.naturalWidth > 0) done();
        },
        [done],
    );
    return (
        <img
            ref={ref}
            className={`${className} cx-fade-img${loaded ? " is-loaded" : ""}`.trim()}
            onLoad={(e) => {
                done();
                onLoad?.(e);
            }}
            {...props}
        />
    );
}
