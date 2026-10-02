import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PlatformSelector from "../components/PlatformSelector";
import { predictionPath } from "../utils/predictionLink";
import { FadeImg } from "../components/Motion";

// The same four tiles as the home page (Home.jsx), so choosing a service here
// looks and works the same. `label` is the short name used in headings.
const PLATFORMS = {
  epic: { name: "Epic Games Store", label: "Epic", iconPath: "/logos/epic.svg", enabled: true },
  gamepass: { name: "Xbox Game Pass Ultimate", label: "Game Pass", iconPath: "/logos/xbox.svg", enabled: true },
  psplus: { name: "PlayStation Plus Extra", label: "PS Plus Extra", iconPath: "/logos/ps.svg", enabled: true },
  humble: { name: "Humble Choice (Monthly)", label: "Humble Choice", iconPath: "/logos/humble.svg", enabled: true },
};

const TOP = 20; // rows per list
const FEATURED = 3; // rows drawn large at the top

const LIKELY_NOTE =
  "The chance it joins in the next 12 months, the same figure each game's page shows. Games a publisher policy already answers (Microsoft's own games on Game Pass) and games that can't come to this service are left out.";

const count = (n) => Number(n || 0).toLocaleString("en-US");
const percent = (chance) => `${Math.round(chance * 100)}%`;

function initials(name) {
  return String(name || "")
    .split(/\s+/)
    .map((w) => w.match(/[A-Za-z0-9]/)?.[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// RAWG serves a 420px-wide copy of any image under /media/resize/420/-/, and
// no image here is drawn wider than 176px. Already-resized links pass through.
function smallImage(url) {
  return url
    .replace("/media/games/", "/media/resize/420/-/games/")
    .replace("/media/screenshots/", "/media/resize/420/-/screenshots/");
}

/** Cover art: the small copy, then the original, then the game's initials. */
function Thumb({ src, name, wide = false }) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const cls = wide ? "cx-rk-thumb cx-wide" : "cx-rk-thumb";
  const small = typeof src === "string" && src ? smallImage(src) : null;
  const url = attempt === 0 ? small : attempt === 1 && small !== src ? src : null;
  if (!url) {
    return <span className={cls} aria-hidden="true">{initials(name)}</span>;
  }
  // A soft shimmer holds the place until the cover has loaded, then it fades in.
  return (
    <span className={`${cls} cx-shimmer${loaded ? " is-loaded" : ""}`} aria-hidden="true">
      <FadeImg
        key={url}
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        onLoaded={() => setLoaded(true)}
        onError={() => setAttempt((a) => a + 1)}
      />
    </span>
  );
}

function Row({ item, big, max, index }) {
  const width = max > 0 ? Math.max(0, Math.min(100, (item.weight / max) * 100)) : 0;
  const body = (
    <>
      <span className="cx-rk-n">{item.rank}</span>
      <Thumb src={item.image} name={item.name} wide={big} />
      <span className="cx-rk-name">
        <b>{item.name}</b>
        {item.sub && <span>{item.sub}</span>}
      </span>
      <span className="cx-rk-v">
        {item.value}
        {item.unit && <small>{item.unit}</small>}
      </span>
      <span className="cx-rk-meter" aria-hidden="true">
        <i style={{ width: `${width}%` }} />
      </span>
    </>
  );
  return (
    <li className={big ? "cx-rk-big" : undefined} style={{ "--cx-i": index }}>
      {item.to ? (
        <Link className="cx-rk-item" to={item.to}>{body}</Link>
      ) : (
        <div className="cx-rk-item">{body}</div>
      )}
    </li>
  );
}

/** The top three drawn large, then the rest as plain rows. */
function RankList({ items }) {
  const max = Math.max(0, ...items.map((g) => g.weight));
  return (
    <ol className="cx-rk-rows">
      {items.map((g, i) => (
        <Row key={`${g.rank}-${g.name}`} item={g} big={i < FEATURED} max={max} index={i} />
      ))}
    </ol>
  );
}

function Status({ children, onRetry }) {
  return (
    <div className="cx-pg-status" role="status">
      {children}
      {onRetry && (
        <button type="button" className="cx-btn cx-btn-quiet" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

function Loading({ children }) {
  return (
    <Status>
      <span className="cx-spinner" aria-hidden="true" />
      {children}
    </Status>
  );
}

// Written by the pipeline at every data update; one file holds all four
// services' lists.
function useRankingsFile() {
  const [state, setState] = useState({ status: "loading", data: null });
  useEffect(() => {
    let alive = true;
    fetch("/rankings.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (alive) setState({ status: "ok", data });
      })
      .catch(() => {
        if (alive) setState({ status: "error", data: null });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

// Search counts from the site's own leaderboard. Each list is fetched the
// first time it is shown and kept for the visit, so switching back is instant.
function useSearchCounts(url, active) {
  const cache = useRef(new Map());
  const [state, setState] = useState({ url: null, status: "idle", rows: [] });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    const hit = cache.current.get(url);
    if (hit) {
      setState({ url, status: "ok", rows: hit });
      return undefined;
    }
    let alive = true;
    setState({ url, status: "loading", rows: [] });
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        const rows = Array.isArray(d?.leaderboard) ? d.leaderboard.slice(0, TOP) : [];
        cache.current.set(url, rows);
        if (alive) setState({ url, status: "ok", rows });
      })
      .catch(() => {
        if (alive) setState({ url, status: "error", rows: [] });
      });
    return () => {
      alive = false;
    };
  }, [url, active, retry]);

  // Until the effect catches up with a new address, report it as loading
  // rather than briefly showing the previous list under the new heading.
  const current = state.url === url ? state : { url, status: "loading", rows: [] };
  return [current, () => setRetry((n) => n + 1)];
}

// "Humble Choice 209 · Epic 30": where a game's searches came from, for the
// all-services list.
function breakdownText(breakdown) {
  if (!breakdown || typeof breakdown !== "object") return "";
  return Object.entries(breakdown)
    .map(([k, n]) => [k, Number(n) || 0])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${PLATFORMS[k]?.label || k} ${count(n)}`)
    .join(" · ");
}

const TrendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </svg>
);

const TABS = [
  { key: "likely", title: "Most likely next", sub: "Chance of joining in the next 12 months", icon: <TrendIcon /> },
  { key: "searched", title: "Most searched", sub: "What people look up on this site", icon: <SearchIcon /> },
];

export default function Rankings() {
  const [service, setService] = useState("humble");
  const [tab, setTab] = useState("likely");
  const [scope, setScope] = useState("service");
  const tabRefs = useRef({});

  const file = useRankingsFile();
  const searchUrl =
    scope === "all"
      ? `/api/leaderboard?limit=${TOP}`
      : `/api/leaderboard?platform=${encodeURIComponent(service)}&limit=${TOP}`;
  const [searched, retrySearch] = useSearchCounts(searchUrl, tab === "searched");

  const label = PLATFORMS[service].label;

  // Arrow keys move between the two tabs, as in a native tab strip.
  function onTabKey(e) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.key === tab);
    const next = TABS[(i + step + TABS.length) % TABS.length].key;
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  let heading;
  let sub = null;
  let content;
  let note = null;
  let announced = [];

  if (tab === "likely") {
    heading = `Most likely to join ${label} next`;
    const svc = file.data?.services?.[service];
    if (file.status === "loading") {
      content = <Loading>Loading the rankings...</Loading>;
    } else if (file.status === "error" || !svc) {
      content = <Status>The rankings could not be loaded. Please try again later.</Status>;
    } else {
      if (Number.isFinite(svc.waiting)) {
        sub = `Out of ${count(svc.waiting)} games not yet on ${label}, as of our last update.`;
      }
      announced = Array.isArray(svc.announced) ? svc.announced : [];
      const items = (Array.isArray(svc.likely) ? svc.likely : []).slice(0, TOP).map((g, i) => ({
        rank: g.rank ?? i + 1,
        name: g.name,
        sub: [g.publisher || "Publisher unknown", g.year].filter(Boolean).join(" · "),
        value: percent(g.chance),
        weight: g.chance,
        image: g.image,
        to: predictionPath(service, g.slug),
      }));
      content = items.length ? (
        <RankList key={`likely-${service}`} items={items} />
      ) : (
        <Status>No games to list for {label} yet.</Status>
      );
      note = LIKELY_NOTE;
    }
  } else {
    heading = scope === "all" ? "Most searched, all services" : `Most searched for ${label}`;
    sub = "Searches on this site since 15 January 2026.";
    if (searched.status === "error") {
      content = <Status onRetry={retrySearch}>The search counts could not be loaded.</Status>;
    } else if (searched.status !== "ok") {
      content = <Loading>Loading the search counts...</Loading>;
    } else {
      const items = searched.rows.map((row, i) => {
        const n = Number(row.score) || 0;
        return {
          rank: row.rank ?? i + 1,
          name: row.game,
          sub: scope === "all" ? breakdownText(row.breakdown) : "",
          value: count(n),
          unit: n === 1 ? "search" : "searches",
          weight: n,
          image: row.image,
          to: null,
        };
      });
      content = items.length ? (
        <RankList key={`searched-${searchUrl}`} items={items} />
      ) : (
        <Status>No searches counted here yet.</Status>
      );
    }
  }

  return (
    <div className="cx-pg cx-page" data-svc={service}>
      <main className="cx-shell">
        <header className="cx-pg-head">
          <h1>Rankings</h1>
          <p className="cx-lede">What is likely to join each service next, and what people look up most on this site.</p>
        </header>

        <PlatformSelector selectedModel={service} setSelectedModel={setService} platformConfig={PLATFORMS} />

        <section className="cx-rk" aria-label="Rankings">
          <div className="cx-rk-tabs" role="tablist" aria-label="Ranking" onKeyDown={onTabKey}>
            <span className="cx-rk-ink" aria-hidden="true" style={{ "--cx-x": Math.max(0, TABS.findIndex((t) => t.key === tab)) }} />
            {TABS.map(({ key, title, sub: tabSub, icon }) => {
              const on = tab === key;
              return (
                <button
                  key={key}
                  ref={(el) => (tabRefs.current[key] = el)}
                  type="button"
                  role="tab"
                  id={`rk-tab-${key}`}
                  aria-selected={on}
                  aria-controls="rk-panel"
                  tabIndex={on ? 0 : -1}
                  className="cx-rk-tab"
                  onClick={() => setTab(key)}
                >
                  {icon}
                  <span className="cx-rk-tab-text">
                    <b>{title}</b>
                    <small>{tabSub}</small>
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className={`cx-rk-body cx-rk-on-${tab}`}
            role="tabpanel"
            id="rk-panel"
            aria-labelledby={`rk-tab-${tab}`}
          >
            <div className="cx-rk-bar">
              <div className="cx-sec-head">
                <h2 className="cx-h2">{heading}</h2>
                {sub && <p className="cx-context">{sub}</p>}
              </div>
              {tab === "searched" && (
                <span className="cx-seg" role="group" aria-label="Which searches">
                  <button type="button" aria-pressed={scope === "service"} onClick={() => setScope("service")}>
                    This service
                  </button>
                  <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>
                    All services
                  </button>
                </span>
              )}
            </div>

            <div className="cx-rk-swap" key={`${tab}-${service}-${scope}`}>
            {announced.length > 0 && (
              <ul className="cx-rk-announced" aria-label="Officially announced">
                {announced.map((a) => {
                  const to = predictionPath(service, a.slug);
                  const inner = (
                    <>
                      <Thumb src={a.image} name={a.name} />
                      <span className="cx-rk-ann-text">
                        <span>Officially announced</span>
                        <b>{a.name}</b>
                        {a.date && <span>Joining {a.date}</span>}
                      </span>
                    </>
                  );
                  return (
                    <li key={a.slug || a.name}>
                      {to ? (
                        <Link className="cx-rk-ann" to={to}>{inner}</Link>
                      ) : (
                        <div className="cx-rk-ann">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {content}

            {note && <p className="cx-context">{note}</p>}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
