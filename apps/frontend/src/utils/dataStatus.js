import { useEffect, useState } from "react";

// When the data was last collected and when the next refresh is due. Written by
// pipeline.deploy into public/data_status.json on every data update, so the site
// can say how fresh it is without hardcoding a date that goes stale.
export function useDataStatus() {
    const [status, setStatus] = useState(null);
    useEffect(() => {
        let alive = true;
        fetch("/data_status.json")
            .then((r) => (r.ok ? r.json() : null))
            .then((s) => {
                if (alive) setStatus(s);
            })
            .catch(() => { });
        return () => {
            alive = false;
        };
    }, []);
    return status;
}

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

// Parsed by hand: new Date("2026-09-25") is read as UTC midnight, which shows
// as the previous day for anyone west of Greenwich.
function parts(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? { y: m[1], mo: Number(m[2]) - 1, d: Number(m[3]) } : null;
}

export function formatDay(iso) {
    const p = parts(iso);
    return p ? `${p.d} ${MONTHS[p.mo]} ${p.y}` : null;
}

export function formatMonth(iso) {
    const p = parts(iso);
    return p ? `${MONTHS[p.mo]} ${p.y}` : null;
}
