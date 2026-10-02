import { Fragment, useEffect, useState } from "react";
import { formatDay } from "../utils/dataStatus";

// Order and names for the tables. Written by the pipeline at every data update
// into public/statistics.json, from the same backtests that gate a release.
const ORDER = ["gamepass", "psplus", "epic", "humble"];
const NAMES = {
  gamepass: "Xbox Game Pass",
  psplus: "PS Plus Extra",
  epic: "Epic Games Store",
  humble: "Humble Choice",
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Parsed by hand, like utils/dataStatus: new Date("2026-09-25") is UTC
// midnight, which shows as the day before for anyone west of Greenwich.
function parts(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? { y: Number(m[1]), mo: Number(m[2]) - 1, d: Number(m[3]) } : null;
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

const DASH = "-";
const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const count = (n) => (isNum(n) ? n.toLocaleString("en-US") : DASH);
const pct = (x) => (isNum(x) ? `${Math.round(x * 100)}%` : DASH);
const months = (n) => (isNum(n) ? `${n} month${n === 1 ? "" : "s"}` : DASH);
const decimal = (x) => (isNum(x) ? (Number.isInteger(x) ? String(x) : x.toFixed(1)) : DASH);

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

function useStatisticsFile() {
  const [state, setState] = useState({ status: "loading", data: null });
  useEffect(() => {
    let alive = true;
    fetch("/statistics.json")
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

export default function Statistics() {
  const file = useStatisticsFile();
  const s = file.data;

  const head = (
    <header className="cx-pg-head">
      <h1>Statistics</h1>
      <p className="cx-lede">
        How the answers are tested. Every figure below comes from predictions made using only data from before the date
        being tested, then checked against what actually happened.
      </p>
    </header>
  );

  if (file.status !== "ok" || !s) {
    return (
      <div className="cx-pg">
        <main className="cx-shell">
          {head}
          <section className="cx-tile">
            <div className="cx-pg-status" role="status">
              {file.status === "loading" ? (
                <>
                  <span className="cx-spinner" aria-hidden="true" />
                  Loading the statistics...
                </>
              ) : (
                "The statistics could not be loaded. Please try again later."
              )}
            </div>
          </section>
        </main>
      </div>
    );
  }

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
    <div className="cx-pg">
      <main className="cx-shell">
        {head}

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

        <section className="cx-tile">
          <h2 className="cx-h2">What these numbers can&apos;t tell you</h2>
          <ul className="cx-plain">
            <li>
              <strong>Only games that joined can be checked for timing.</strong> A game that never joins has no real date
              to compare against.
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
      </main>
    </div>
  );
}
