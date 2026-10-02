import { Fragment, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDay } from "../utils/dataStatus";

// Order and names for the tables. Written by the pipeline at every data update
// into public/statistics.json (the summary tables) and public/accuracy.json
// (the games behind them, D-054), from the same tests that gate a release.
const ORDER = ["gamepass", "psplus", "epic", "humble"];
const NAMES = {
  gamepass: "Xbox Game Pass",
  psplus: "PS Plus Extra",
  epic: "Epic Games Store",
  humble: "Humble Choice",
};
// For the service tiles on a phone, four to a row.
const SHORT = { gamepass: "Game Pass", psplus: "PS Plus", epic: "Epic", humble: "Humble" };

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
  "November", "December"];

// Parsed by hand, like utils/dataStatus: new Date("2026-09-25") is UTC
// midnight, which shows as the day before for anyone west of Greenwich.
function parts(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  return m ? { y: Number(m[1]), mo: Number(m[2]) - 1, d: m[3] ? Number(m[3]) : 1 } : null;
}

/** "25 Sep 2026" */
function shortDay(iso) {
  const p = parts(iso);
  return p ? `${p.d} ${MON[p.mo]} ${p.y}` : null;
}

/** "Dec 2026" */
function shortMonth(iso) {
  const p = parts(iso);
  return p ? `${MON[p.mo]} ${p.y}` : null;
}

/** "January 2026" */
function longMonth(iso) {
  const p = parts(iso);
  return p ? `${LONG_MON[p.mo]} ${p.y}` : null;
}

const DASH = "-";
const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const count = (n) => (isNum(n) ? n.toLocaleString("en-US") : DASH);
const pct = (x) => (isNum(x) ? `${Math.round(x * 100)}%` : DASH);
const inTen = (x) => (isNum(x) ? `${Math.round(x * 10)} in 10` : DASH);
const months = (n) => (isNum(n) ? `${n} month${n === 1 ? "" : "s"}` : DASH);
const decimal = (x) => (isNum(x) ? (Number.isInteger(x) ? String(x) : x.toFixed(1)) : DASH);
const chance = (c) => (!isNum(c) ? DASH : c < 0.01 ? "Under 1%" : `${Math.round(c * 100)}%`);

/** "Closer by": how much nearer the models land than the simple guess. */
function closerBy(model, baseline) {
  if (!isNum(model) || !isNum(baseline)) return DASH;
  const d = baseline - model;
  if (d === 0) return "Level";
  return d > 0 ? months(d) : `${months(-d)} further`;
}

/** "January to August 2026" reads as "between January and August 2026". */
function periodText(period) {
  if (!period) return "";
  return / to /.test(period) ? ` between ${period.replace(" to ", " and ")}` : ` in ${period}`;
}

/** When the data was frozen for the yearly test, in words. */
function frozenText(tests) {
  const days = tests.map(formatDay).filter(Boolean);
  if (!days.length) return "";
  if (days.length === 1) return `The data was frozen at ${days[0]}.`;
  const p = tests.map(parts);
  const yearApart = p.every((x, i) => x && (i === 0 || (x.y === p[i - 1].y + 1 && x.mo === p[0].mo && x.d === p[0].d)));
  if (yearApart && days.length === 2) return `The data was frozen at ${days[0]} and again a year later.`;
  if (yearApart) return `The data was frozen at ${days[0]} and again each year after, up to ${days[days.length - 1]}.`;
  return `The data was frozen at ${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}.`;
}

/** How far the real month was from the best guess, in words. */
// Counted between the two months as shown, not from the exact days: a game
// due late in January that arrives early in January reads "Same month", as
// the table says, not "1 month sooner".
function offText(guess, arrived) {
  const g = parts(guess);
  const a = parts(arrived);
  if (!g || !a) return DASH;
  const d = a.y * 12 + a.mo - (g.y * 12 + g.mo);
  if (d === 0) return "Same month";
  const n = Math.abs(d);
  return `${n} month${n === 1 ? "" : "s"} ${d < 0 ? "sooner" : "later"}`;
}

function useJson(url) {
  const [state, setState] = useState({ status: "loading", data: null });
  useEffect(() => {
    let alive = true;
    fetch(url)
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
  }, [url]);
  return state;
}

const TABS = [
  { key: "accuracy", title: "Accuracy", sub: "Each service, game by game" },
  { key: "compare", title: "Compare", sub: "All four side by side" },
  { key: "data", title: "Data", sub: "What we have, and its limits" },
];

// Each view has its own address, e.g. /statistics?tab=accuracy&service=psplus,
// like the Rankings page. Anything missing or unknown falls back to the default.
function useView() {
  const [params, setParams] = useSearchParams();
  const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
  const view = {
    tab: pick("tab", TABS.map((t) => t.key), "accuracy"),
    service: pick("service", ORDER, "gamepass"),
  };
  const set = (key) => (value) => {
    const next = { ...view, [key]: value };
    setParams(next.tab === "accuracy" ? next : { tab: next.tab }, { replace: true });
  };
  return [view, set];
}

// ---------- accuracy, per service ----------

/** A service's three headline figures; the tiles double as the service picker. */
function ServiceTiles({ acc, service, onPick }) {
  const refs = useRef({});
  const keys = ORDER.filter((k) => acc[k]);
  function onKey(e) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = keys[(keys.indexOf(service) + step + keys.length) % keys.length];
    onPick(next);
    refs.current[next]?.focus();
  }
  return (
    <div className="cx-acc-tiles" role="radiogroup" aria-label="Service" onKeyDown={onKey}>
      {keys.map((k) => {
        const a = acc[k];
        const on = k === service;
        const picks = (a.whether || []).map((t) => t.top?.["20"]?.joined).filter(isNum);
        return (
          <button
            key={k}
            ref={(el) => (refs.current[k] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className="cx-acc-tile"
            data-acc={k}
            onClick={() => onPick(k)}
          >
            <span className="cx-acc-name">
              <i aria-hidden="true" />
              <span className="cx-acc-long">{NAMES[k]}</span>
              <span className="cx-acc-short">{SHORT[k]}</span>
            </span>
            <span className="cx-acc-fig"><b>{inTen(a.when?.within?.["12"])}</b><span>within a year of our best guess</span></span>
            <span className="cx-acc-fig cx-acc-more-fig"><b>{pct(a.when?.inside)}</b><span>inside the range shown</span></span>
            {picks.length > 0 && (
              <span className="cx-acc-fig cx-acc-more-fig"><b>{picks.join(" and ")}</b><span>of our top 20 picks joined</span></span>
            )}
            <span className="cx-acc-go" aria-hidden="true">
              {on ? "Shown below" : "Show details"}
              <svg viewBox="0 0 12 12"><path d="M3 4.5 6 7.5l3-3" /></svg>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// How far the real month was from the best guess, in months. The first three
// together are "within a year", the figure in the first box above.
const BUCKETS = [
  [0, 3, "0-3 mo", "within 3 months of the best guess"],
  [3, 6, "3-6 mo", "between 3 and 6 months off"],
  [6, 12, "6-12 mo", "between 6 and 12 months off"],
  [12, 24, "1-2 yrs", "between 1 and 2 years off"],
  [24, 36, "2-3 yrs", "between 2 and 3 years off"],
  [36, Infinity, "3+ yrs", "more than 3 years off"],
];

/** "a, b, c and d" */
function listText(items) {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0] || "";
}

/**
 * Every game in the test, one block per distance from the best guess, sized by
 * how many games are in it, with a bracket under the blocks that make up
 * "within a year". A grid, so the bracket lines up with its blocks exactly.
 */
function OffBar({ games }) {
  const segs = BUCKETS.map(([lo, hi, label, words], i) => ({
    i, label, words, n: games.filter((g) => Math.abs(g.off) >= lo && Math.abs(g.off) < hi).length,
  })).filter((s) => s.n > 0);
  const total = games.length;
  const yearSegs = segs.filter((s) => s.i < 3);
  const year = yearSegs.reduce((a, s) => a + s.n, 0);
  const said = segs.map((s) => `${s.n} ${s.words}`);
  return (
    <figure className="cx-acc-off">
      <div
        className="cx-acc-offgrid"
        style={{ gridTemplateColumns: segs.map((s) => `minmax(var(--cx-seg-min), ${s.n}fr)`).join(" ") }}
        role="img"
        aria-label={`${total} games: ${listText(said)}.`}
      >
        {segs.map((s, k) => (
          <span
            key={s.i}
            className={`cx-acc-seg cx-acc-s${s.i}${k === 0 ? " cx-acc-seg-first" : ""}${k === segs.length - 1 ? " cx-acc-seg-last" : ""}`}
            title={`${s.n} ${s.n === 1 ? "game" : "games"} ${s.words}`}
          >
            <b>{s.n}</b>
            <small>{s.label}</small>
          </span>
        ))}
        {year > 0 && (
          <span className="cx-acc-brace" style={{ gridColumn: `1 / ${yearSegs.length + 1}` }} aria-hidden="true">
            <i />
            <span>{year} of {total} within a year</span>
          </span>
        )}
      </div>
    </figure>
  );
}

function GameTable({ games, caption }) {
  return (
    <div className="cx-table-wrap">
      <table className="cx-table cx-acc-games">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Game</th>
            <th scope="col">Our best guess</th>
            <th scope="col" className="cx-acc-arr">Arrived</th>
            <th scope="col">Against the guess</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g) => (
            <tr key={`${g.game}-${g.arrived}`}>
              <th scope="row">
                {g.game}
                <small>{[g.publisher, g.released && `released ${shortMonth(g.released)}`].filter(Boolean).join(" · ")}</small>
              </th>
              <td>
                {shortMonth(g.guess)}
                <small>{shortMonth(g.low)} to {shortMonth(g.high)}</small>
              </td>
              <td className="cx-acc-arr">{shortMonth(g.arrived)}</td>
              <td>
                <small className="cx-acc-arr-m">Arrived {shortMonth(g.arrived)}</small>
                {offText(g.guess, g.arrived)}
                <span className={g.inside ? "cx-acc-in" : "cx-acc-out"}>{g.inside ? "In range" : "Outside range"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function When({ w }) {
  const games = Array.isArray(w.games) ? w.games : [];
  const close = games.slice(0, 5);
  const worst = games.slice(-3).reverse();
  const oldMisses = worst.filter((g) => parts(g.released)?.y <= (parts(g.arrived)?.y ?? 0) - 8).length >= 2;
  return (
    <section className="cx-tile cx-acc-part">
      <div className="cx-sec-head">
        <h2 className="cx-h2">When it arrives</h2>
        <p className="cx-context">
          The model was rebuilt from data up to {longMonth(w.from)}, then its best guess for each of the {count(w.n)} games
          that actually arrived after that, up to {longMonth(w.to)}, was compared with the real month.
        </p>
      </div>
      <div className="cx-acc-bigs">
        <div><b>{inTen(w.within?.["12"])}</b><span>within a year of the best guess</span></div>
        <div><b>{inTen(w.within?.["24"])}</b><span>within 2 years</span></div>
        <div><b>{inTen(w.within?.["36"])}</b><span>within 3 years</span></div>
        <div><b>{pct(w.inside)}</b><span>inside the range shown, which aims for 8 in 10</span></div>
      </div>
      <p className="cx-acc-label">How close the best guess came</p>
      <p className="cx-context">
        All {count(games.length)} games, sorted into blocks by how far their real arrival month was from the month we
        predicted. A wider block holds more games.
      </p>
      <OffBar games={games} />
      <GameTable games={close} caption="Closest calls" />
      <GameTable games={worst} caption="Biggest misses" />
      {oldMisses && (
        <p className="cx-context">
          The biggest misses are old games: they arrived many years after release, long after the model expected anything
          that old still to be waiting.
        </p>
      )}
      <details className="cx-acc-more">
        <summary>All {count(games.length)} games in this test</summary>
        <GameTable games={games} caption="From the closest to the furthest" />
      </details>
    </section>
  );
}

/** One plain sentence on how the totals went, true for whatever the numbers are. */
function totalsNote(tests) {
  const r = tests.map((t) => (t.expected > 0 ? t.joined / t.expected : null)).filter(isNum);
  if (!r.length) return "";
  if (r.every((x) => x >= 0.8 && x <= 1.2)) return "The totals landed close to what was expected each time.";
  if (r.every((x) => x > 1.2)) return "More games joined than expected each time, so these chances run on the cautious side.";
  if (r.every((x) => x < 0.8)) return "Fewer games joined than expected each time, so these chances run on the generous side.";
  return tests.map((t) => `${parts(t.cutoff)?.y}: ${t.joined} joined against ${decimal(t.expected)} expected.`).join(" ");
}

function Picks({ t }) {
  const top = t.top?.["20"];
  return (
    <div className="cx-acc-picks">
      <p className="cx-acc-label">Our top 10 picks, data frozen {formatDay(t.cutoff)}</p>
      <ol>
        {(t.top10 || []).map((g) => (
          <li key={`${g.rank}-${g.game}`}>
            <span className="cx-acc-rk">{g.rank}</span>
            <span className="cx-acc-pk">
              <b>{g.game}</b>
              <small>{chance(g.chance)} chance</small>
            </span>
            {g.joined ? (
              <span className="cx-acc-in">Joined {shortMonth(g.joined)}</span>
            ) : (
              <span className="cx-acc-no">Not that year</span>
            )}
          </li>
        ))}
      </ol>
      {top && (
        <p className="cx-context">
          Of the top 20, <b>{top.joined}</b> joined within the year; their chances added up to {decimal(top.expected)}.
          Twenty waiting games picked at random would have given about {decimal(t.random20)}.
        </p>
      )}
    </div>
  );
}

function Bands({ tests }) {
  const labels = (tests[0]?.bands || []).map((b) => b.label);
  const rows = labels
    .map((label, i) => {
      const games = tests.reduce((s, t) => s + (t.bands?.[i]?.games || 0), 0);
      const expected = tests.reduce((s, t) => s + (t.bands?.[i]?.expected || 0), 0);
      const joined = tests.reduce((s, t) => s + (t.bands?.[i]?.joined || 0), 0);
      return games ? { label, games, said: expected / games, got: joined / games, joined } : null;
    })
    .filter(Boolean);
  const top = Math.max(1e-9, ...rows.flatMap((r) => [r.said, r.got]));
  const w = (x) => `${Math.max(0.5, (x / top) * 100)}%`;
  return (
    <>
      <p className="cx-acc-label">How the chances sorted the games, both tests together</p>
      <div className="cx-legend">
        <span><i className="cx-exp" />Average chance we gave</span>
        <span><i className="cx-act" />Share that joined</span>
      </div>
      <div className="cx-acc-bands">
        {rows.map((r) => (
          <div key={r.label} className="cx-acc-band">
            <span className="cx-acc-bl">{r.label}<small>{count(r.games)} games</small></span>
            <span className="cx-acc-bb">
              <span><i className="cx-exp" style={{ width: w(r.said) }} /><b>{(r.said * 100).toFixed(1)}%</b></span>
              <span><i className="cx-act" style={{ width: w(r.got) }} /><b>{(r.got * 100).toFixed(1)}%</b><small>{r.joined} joined</small></span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function Whether({ tests }) {
  const picks = tests.reduce((s, t) => s + (t.top?.["20"]?.joined || 0), 0);
  return (
    <section className="cx-tile cx-acc-part">
      <div className="cx-sec-head">
        <h2 className="cx-h2">Will it join at all</h2>
        <p className="cx-context">
          {frozenText(tests.map((t) => t.cutoff))} Every game already on another service but not this one got the chance the
          site would have shown then; then we counted which joined in the following 12 months.
        </p>
      </div>
      <div className="cx-pairs">
        {tests.map((t) => (
          <div key={t.cutoff} className="cx-pair">
            <div className="cx-pair-yr">{parts(t.cutoff)?.y} test · {count(t.waiting)} games waiting</div>
            <div className="cx-prow">
              <span>Expected</span>
              <span className="cx-prow-bar"><i className="cx-exp" style={{ width: `${(t.expected / Math.max(...tests.flatMap((x) => [x.expected, x.joined]), 1)) * 100}%` }} /></span>
              <em>{decimal(Math.round(t.expected))}</em>
            </div>
            <div className="cx-prow">
              <span>Joined</span>
              <span className="cx-prow-bar"><i className="cx-act" style={{ width: `${(t.joined / Math.max(...tests.flatMap((x) => [x.expected, x.joined]), 1)) * 100}%` }} /></span>
              <em>{count(t.joined)}</em>
            </div>
          </div>
        ))}
      </div>
      <p className="cx-context">
        {totalsNote(tests)}
        {picks <= tests.length && " The specific top picks rarely joined, though: which games come here depends on deals no public data shows."}
      </p>
      <div className="cx-acc-picks-2">
        {tests.map((t) => (
          <Picks key={t.cutoff} t={t} />
        ))}
      </div>
      <Bands tests={tests} />
      <details className="cx-acc-more">
        <summary>Every game that joined, with the rank and chance it had been given</summary>
        {tests.map((t) => (
          <div key={t.cutoff} className="cx-table-wrap">
            <table className="cx-table cx-acc-games">
              <caption>
                Data frozen {formatDay(t.cutoff)}: {count(t.joined)} of {count(t.waiting)} waiting games joined
              </caption>
              <thead>
                <tr>
                  <th scope="col">Our rank</th>
                  <th scope="col">Game</th>
                  <th scope="col">Chance given</th>
                  <th scope="col">Joined</th>
                </tr>
              </thead>
              <tbody>
                {(t.joined_games || []).map((g) => (
                  <tr key={`${g.rank}-${g.game}`}>
                    <td>{count(g.rank)}</td>
                    <th scope="row">{g.game}<small>{g.publisher}</small></th>
                    <td>{chance(g.chance)}</td>
                    <td>{shortMonth(g.joined)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </details>
    </section>
  );
}

function AccuracyTab({ acc, service, onPick }) {
  const a = acc.data?.services?.[service];
  if (acc.status === "loading") return <Status loading>Loading the accuracy figures...</Status>;
  if (acc.status !== "ok" || !acc.data?.services) return <Status>The accuracy figures could not be loaded. Please try again later.</Status>;
  // The picked tile and the panel under it read as one card: the tile drops
  // onto the panel's outline, in the service's colour. The panel's top corner
  // under an end tile is square so the two join cleanly.
  const at = ORDER.filter((k) => acc.data.services[k]).indexOf(service);
  const corner = at === 0 ? " cx-acc-at-first" : at === 3 ? " cx-acc-at-last" : "";
  return (
    <div className="cx-acc">
      <p className="cx-acc-hint">Pick a service to see the games behind its numbers.</p>
      <ServiceTiles acc={acc.data.services} service={service} onPick={onPick} />
      {a && (
        <div className={`cx-acc-panel${corner}`} data-acc={service}>
          <div className="cx-acc-detail" key={service}>
            {a.when && <When w={a.when} />}
            {Array.isArray(a.whether) && a.whether.length > 0 && <Whether tests={a.whether} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- compare, all four ----------

function Pair({ name, rows }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.expected, r.joined].filter(isNum)));
  const width = (x) => `${isNum(x) ? Math.max(0, Math.min(100, (x / max) * 100)) : 0}%`;
  return (
    <div className="cx-pair">
      <h3>{name}</h3>
      {rows.map((r) => (
        <Fragment key={r.cutoff}>
          <div className="cx-pair-yr">{parts(r.cutoff)?.y ?? r.cutoff} test</div>
          <div className="cx-prow">
            <span>Expected</span>
            <span className="cx-prow-bar"><i className="cx-exp" style={{ width: width(r.expected) }} /></span>
            <em>{decimal(r.expected)}</em>
          </div>
          <div className="cx-prow">
            <span>Joined</span>
            <span className="cx-prow-bar"><i className="cx-act" style={{ width: width(r.joined) }} /></span>
            <em>{count(r.joined)}</em>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function CompareTab({ s }) {
  const dated = s.dated?.services || {};
  const baseline = s.baseline?.services || {};
  const yearly = s.yearly?.services || {};
  const datedKeys = ORDER.filter((k) => dated[k]);
  const baselineKeys = ORDER.filter((k) => baseline[k]);
  const pairKeys = ORDER.filter((k) => Array.isArray(yearly[k]) && yearly[k].length);
  const checks = Array.isArray(s.rankings_check) ? s.rankings_check : [];
  const tests = Array.isArray(s.yearly?.tests) ? s.yearly.tests : [];

  // Humble's note only holds while its simple guess stays close.
  const hb = baseline.humble;
  const humbleClose = hb && isNum(hb.model_months) && isNum(hb.baseline_months)
    && hb.baseline_months - hb.model_months >= 0 && hb.baseline_months - hb.model_months <= 3;

  return (
    <>
      {datedKeys.length > 0 && (
        <section className="cx-tile">
          <div className="cx-sec-head">
            <h2 className="cx-h2">When it joins: the dated estimate</h2>
            <p className="cx-context">
              Tested on {count(s.dated?.tested)} games that joined{periodText(s.dated?.period)}, none of which the models had seen.
            </p>
          </div>
          <div className="cx-table-wrap">
            <table className="cx-table">
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col" className="cx-n">Games tested</th>
                  <th scope="col" className="cx-n">Within 1 year</th>
                  <th scope="col" className="cx-n">Within 2 years</th>
                  <th scope="col" className="cx-n">Within 3 years</th>
                  <th scope="col" className="cx-n">Inside the shown range</th>
                </tr>
              </thead>
              <tbody>
                {datedKeys.map((k) => {
                  const r = dated[k];
                  return (
                    <tr key={k}>
                      <th scope="row">{NAMES[k]}</th>
                      <td className="cx-n">{count(r.n)}</td>
                      <td className="cx-n">{pct(r.within1)}</td>
                      <td className="cx-n">{pct(r.within2)}</td>
                      <td className="cx-n">{pct(r.within3)}</td>
                      <td className="cx-n">{pct(r.coverage)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="cx-context">
            &quot;Within 1 year&quot; is how often the best guess landed within a year of the real date. The range is
            built to hold the real date about 8 times in 10.
          </p>
        </section>
      )}

      {baselineKeys.length > 0 && (
        <section className="cx-tile">
          <div className="cx-sec-head">
            <h2 className="cx-h2">Against a simple guess</h2>
            <p className="cx-context">
              Average miss when each year is predicted from the years before it, against the better of two simple
              guesses: the publisher&apos;s usual wait, or the service&apos;s usual wait.
            </p>
          </div>
          <div className="cx-table-wrap">
            <table className="cx-table">
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col" className="cx-n">Our models</th>
                  <th scope="col" className="cx-n">Simple guess</th>
                  <th scope="col" className="cx-n">Closer by</th>
                </tr>
              </thead>
              <tbody>
                {baselineKeys.map((k) => {
                  const r = baseline[k];
                  return (
                    <tr key={k}>
                      <th scope="row">{NAMES[k]}</th>
                      <td className="cx-n">{months(r.model_months)}</td>
                      <td className="cx-n">{months(r.baseline_months)}</td>
                      <td className="cx-n">{closerBy(r.model_months, r.baseline_months)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {humbleClose && (
            <p className="cx-context">
              Humble&apos;s waits are short and similar from game to game, so the simple guess is already close.
            </p>
          )}
        </section>
      )}

      {pairKeys.length > 0 && (
        <section className="cx-tile">
          <div className="cx-sec-head">
            <h2 className="cx-h2">Will it join: the yearly chance</h2>
            <p className="cx-context">
              {[
                frozenText(tests),
                "The chances for every waiting game were added up to give the number expected to join in the following year, then compared with how many did.",
              ].filter(Boolean).join(" ")}
            </p>
          </div>
          <div className="cx-legend">
            <span><i className="cx-exp" />Expected</span>
            <span><i className="cx-act" />Actually joined</span>
          </div>
          <div className="cx-pairs">
            {pairKeys.map((k) => (
              <Pair key={k} name={NAMES[k]} rows={yearly[k]} />
            ))}
          </div>
        </section>
      )}

      {checks.length > 0 && (
        <section className="cx-tile">
          <div className="cx-sec-head">
            <h2 className="cx-h2">How the Most likely lists did</h2>
            <p className="cx-context">
              Each Most likely list is saved when it is published, then checked at the next update: how many of the
              listed games joined, against how many their chances added up to.
            </p>
          </div>
          <div className="cx-table-wrap">
            <table className="cx-table">
              <thead>
                <tr>
                  <th scope="col">Published</th>
                  <th scope="col">Service</th>
                  <th scope="col" className="cx-n">Games listed</th>
                  <th scope="col" className="cx-n">Expected to join</th>
                  <th scope="col" className="cx-n">Joined</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((r, i) => (
                  <tr key={`${r.published}-${r.service}-${i}`}>
                    <td>{shortDay(r.published) || r.published || DASH}</td>
                    <td>{NAMES[r.service] || r.service || DASH}</td>
                    <td className="cx-n">{count(r.listed)}</td>
                    <td className="cx-n">{decimal(r.expected)}</td>
                    <td className="cx-n">{count(r.joined)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

// ---------- data ----------

function DataTab({ s }) {
  return (
    <>
      <section className="cx-tile">
        <h2 className="cx-h2">The data</h2>
        <div className="cx-st-facts">
          <div className="cx-st-fact">
            <b>{count(s.facts?.arrivals)}</b>
            <span>arrivals across the four services in our records</span>
          </div>
          <div className="cx-st-fact">
            <b>{count(s.facts?.first_arrivals)}</b>
            <span>first arrivals the models learn from (launch-day deals and repeats left out)</span>
          </div>
          <div className="cx-st-fact">
            <b>{shortDay(s.as_of) || DASH}</b>
            <span>data current as of</span>
          </div>
          <div className="cx-st-fact">
            <b>{shortMonth(s.next_update_by) || DASH}</b>
            <span>next update due by{s.cadence ? `, updated ${s.cadence}` : ""}</span>
          </div>
        </div>
      </section>

      <section className="cx-tile">
        <h2 className="cx-h2">How the tests work</h2>
        <ul className="cx-plain">
          <li>
            <strong>When it arrives.</strong> Each service&apos;s model is rebuilt using only data from before a cutoff, then
            asked about every game that arrived after it. Its best guess is the month the site shows in large type; its
            range is the &quot;as early as&quot; to &quot;as late as&quot;. Games that launched straight onto a service
            through a deal are left out, as on the site, because there was no wait.
          </li>
          <li>
            <strong>Will it join.</strong> The data is frozen at a past date. Every game on another service&apos;s list but
            not yet on this one gets the chance the site would have shown, and we count which joined in the following 12
            months. &quot;Expected&quot; is all those chances added up, not a list of games.
          </li>
        </ul>
      </section>

      <section className="cx-tile">
        <h2 className="cx-h2">What these numbers can&apos;t tell you</h2>
        <ul className="cx-plain">
          <li>
            <strong>Only games that joined can be checked for timing.</strong> A game that never joins has no real date
            to compare against, so that test leans towards games that came quickly.
          </li>
          <li>
            <strong>The samples are small.</strong> Each service has a few dozen unseen arrivals to check, so one or two
            games move a figure by a few points.
          </li>
          <li>
            <strong>Services change their habits.</strong> Every figure assumes the next few years look like the last
            few.
          </li>
          <li>
            <strong>The records come from community lists and RAWG,</strong> which are mostly right but not always: a
            renamed publisher or a misfiled edition can blur a record.
          </li>
        </ul>
      </section>
    </>
  );
}

function Status({ children, loading }) {
  return (
    <section className="cx-tile">
      <div className="cx-pg-status" role="status">
        {loading && <span className="cx-spinner" aria-hidden="true" />}
        {children}
      </div>
    </section>
  );
}

export default function Statistics() {
  const file = useJson("/statistics.json");
  const acc = useJson("/accuracy.json");
  const [{ tab, service }, set] = useView();
  const setTab = set("tab");
  const setService = set("service");
  const tabRefs = useRef({});
  const s = file.data;

  function onTabKey(e) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.key === tab);
    const next = TABS[(i + step + TABS.length) % TABS.length].key;
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  const index = Math.max(0, TABS.findIndex((t) => t.key === tab));
  const edge = index === 0 ? "cx-tab-first" : index === TABS.length - 1 ? "cx-tab-last" : "cx-tab-mid";

  let body;
  if (tab === "accuracy") {
    body = <AccuracyTab acc={acc} service={service} onPick={setService} />;
  } else if (file.status === "loading") {
    body = <Status loading>Loading the statistics...</Status>;
  } else if (file.status !== "ok" || !s) {
    body = <Status>The statistics could not be loaded. Please try again later.</Status>;
  } else {
    body = tab === "compare" ? <CompareTab s={s} /> : <DataTab s={s} />;
  }

  return (
    <div className="cx-pg cx-page" data-svc={service}>
      <main className="cx-shell">
        <header className="cx-pg-head">
          <h1>Statistics</h1>
          <p className="cx-lede">
            How the answers are tested. Every figure here comes from predictions made using only data from before the date
            being tested, then checked against what actually happened, with the games behind each one.
          </p>
        </header>

        <section className="cx-rk cx-st-tabs" aria-label="Statistics">
          <div className="cx-rk-tabs" role="tablist" aria-label="Statistics" onKeyDown={onTabKey} style={{ "--cx-tabs": TABS.length }}>
            <span className="cx-rk-ink" aria-hidden="true" style={{ "--cx-x": index }} />
            {TABS.map(({ key, title, sub }) => {
              const on = tab === key;
              return (
                <button
                  key={key}
                  ref={(el) => (tabRefs.current[key] = el)}
                  type="button"
                  role="tab"
                  id={`st-tab-${key}`}
                  aria-selected={on}
                  aria-controls="st-panel"
                  tabIndex={on ? 0 : -1}
                  className="cx-rk-tab"
                  onClick={() => setTab(key)}
                >
                  <span className="cx-rk-tab-text">
                    <b>{title}</b>
                    <small>{sub}</small>
                  </span>
                </button>
              );
            })}
          </div>
          <div className={`cx-st-body ${edge}`} role="tabpanel" id="st-panel" aria-labelledby={`st-tab-${tab}`}>
            <div className="cx-rk-swap" key={tab}>
              {body}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
