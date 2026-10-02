import { Link } from "react-router-dom";
import { useDataStatus, formatDay } from "../utils/dataStatus";
import { SERVICE_COLORS } from "../utils/serviceTheme";

// Each source card's edge takes its service's colour; Epic's grey brand is too
// dim on the dark tile, so it takes its lighter accent.
const edge = (key) => ({ "--cx-src-edge": key === "epic" ? SERVICE_COLORS.epic.hi : SERVICE_COLORS[key].brand });

const SOURCES = [
  {
    key: "epic",
    name: "Epic Games Store",
    text: "i-pax and PCGamer's giveaway lists, and evenwebb's scraper for every giveaway since 2018, repeats included.",
    links: [
      ["Google Sheets", "https://docs.google.com/spreadsheets/d/1pD5h9JfwjewnN7DTKPu-Ad89ukaStLaY7nB5jhOAEyE/edit#gid=504781956"],
      ["Reddit", "https://www.reddit.com/r/EpicGamesPC/comments/zwdd9h/the_complete_and_regularly_updated_list_of_all/"],
      ["PCGamer", "https://www.pcgamer.com/epic-games-store-free-games-list/"],
      ["evenwebb on GitHub", "https://github.com/evenwebb/epic-free-games-scraper"],
    ],
  },
  {
    key: "gamepass",
    name: "Xbox Game Pass",
    text: "ABattleVet's master list of current and removed Game Pass titles.",
    links: [
      ["Google Sheets", "https://docs.google.com/spreadsheets/d/1kspw-4paT-eE5-mrCrc4R9tg70lH2ZTFrJOUmOtOytg"],
      ["Reddit", "https://www.reddit.com/r/XboxGamePass/comments/gancnk/master_list_of_all_current_and_removed_game_pass/"],
    ],
  },
  {
    key: "psplus",
    name: "PS Plus Extra",
    text: "ABattleVet's PlayStation Plus master list.",
    links: [
      ["Google Sheets", "https://docs.google.com/spreadsheets/d/19RorxFhWc2lHocg4c9zrVssSwZq1u2nPcpTsAvzdJQw/edit?gid=1938605355#gid=1938605355"],
      ["Reddit", "https://www.reddit.com/r/PlayStationPlus/comments/vid7ev/na_playstation_plus_master_list/"],
    ],
  },
  {
    key: "humble",
    name: "Humble Choice",
    text: "dangarbri (appsolutelywonderful)'s searchable list of every Humble Choice and Humble Monthly game.",
    links: [
      ["Website", "https://dangarbri.tech/humblechoice"],
      ["Reddit", "https://www.reddit.com/r/humblebundles/comments/16gsmku/3_years_ago_i_made_a_searchable_list_of_all/"],
    ],
  },
];

const BUILT_WITH = [
  ["Models", "XGBoost quantile models with conformal calibration for the window; arrival tables and a mixture cure model for the chances"],
  ["Backend", "Python and Flask, on Render"],
  ["Site", "React and Vite, on Vercel"],
  ["Data", "Supabase for search counts and saved answers; the RAWG API for game details"],
];

export default function About() {
  // The "as of" date comes from public/data_status.json, written at every data
  // update, so it never goes stale.
  const status = useDataStatus();
  const asOf = formatDay(status?.collected_on);

  return (
    <div className="cx-pg">
      <main className="cx-shell">
        <header className="cx-pg-head">
          <h1>About</h1>
          <p className="cx-lede">
            Epic Game Pass When? estimates when a game will arrive on Xbox Game Pass, PS Plus Extra, the Epic Games
            Store&apos;s free giveaways or Humble Choice, and how likely it is to arrive at all. It&apos;s a data-driven
            side project, not a promise.
          </p>
          <p className="cx-by">
            Built by{" "}
            <a href="https://github.com/lyndon025" target="_blank" rel="noopener noreferrer">
              lyndon025
            </a>
          </p>
        </header>

        <section className="cx-tile" aria-label="What's new">
          <details className="cx-ab-new" open>
            <summary>
              <span className="cx-ab-tag">Version 2.1</span>
              <span className="cx-ab-sum">
                <b>What&apos;s new</b>
                <small>Every answer now says how likely a game is to join, not just when.</small>
              </span>
              <span className="cx-ab-chev" aria-hidden="true" />
            </summary>
            <ul className="cx-ab-list">
              <li>
                <b>Will it join at all?</b> Every dated answer also shows the chance it joins in the next 12 months, by
                the end of its window, and ever.
              </li>
              <li>
                <b>Chances that know the game.</b> They account for whether it&apos;s on PC, its Metacritic score, the
                publisher&apos;s record on that service, and where it is in its own window.
              </li>
              <li>
                <b>The window, year by year.</b> Bars under the window show the chance for each stretch of it.
              </li>
              <li>
                <b>Rankings.</b> The games most likely to join each service next, and the games searched most on this
                site.
              </li>
              <li>
                <b>Statistics.</b> How every answer is tested, including how many games were expected to join against
                how many did.
              </li>
              <li>
                <b>Metacritic from our records.</b> When RAWG has no score for a game, the score in our data is used.
              </li>
            </ul>
          </details>
          <details className="cx-ab-new">
            <summary>
              <span className="cx-ab-tag cx-quiet">Version 2.0</span>
              <span className="cx-ab-sum">
                <b>September 2026</b>
                <small>A new prediction engine, fresh data for every service, and answers that say how firm they are.</small>
              </span>
              <span className="cx-ab-chev" aria-hidden="true" />
            </summary>
            <ul className="cx-ab-list">
              <li>
                <b>See if it&apos;s already there.</b> Game Pass and PS Plus answers say when a game is in the catalogue
                as of the last update, with announced join and leave dates.
              </li>
              <li>
                <b>A range, not just a date.</b> Every forecast has a best guess and a realistic range around it.
              </li>
              <li>
                <b>Sony games on PS Plus Extra.</b> Sony&apos;s PS4 and PS5 games are dated from Sony&apos;s own record
                since Extra launched.
              </li>
              <li>
                <b>Will it come back?</b> Games that have been on a service before show their chance of returning.
              </li>
              <li>
                <b>The publisher&apos;s own record.</b> Forecasts list the publisher&apos;s earlier games on that service
                and how long each took.
              </li>
              <li>
                <b>Share a prediction.</b> Every prediction has its own link, and any answer can become an image with a
                QR code back to it.
              </li>
              <li>
                <b>Publisher policies built in.</b> Microsoft&apos;s day-one games and Call of Duty&apos;s Game Pass
                timing come from their published approach.
              </li>
              <li>
                <b>A new look,</b> with the game&apos;s own art behind each prediction and colours that follow the
                service.
              </li>
            </ul>
          </details>
        </section>

        <section className="cx-tile">
          <h2 className="cx-h2">How it works</h2>
          <div className="cx-ab-steps">
            <div className="cx-ab-step">
              <span className="cx-ab-n">1</span>
              <div>
                <h3>The game&apos;s own record</h3>
                <p>
                  If the game is on the service now, or has been before, its own history answers: in the catalogue as
                  of our last update, or its chance of coming back.
                </p>
              </div>
            </div>
            <div className="cx-ab-step">
              <span className="cx-ab-n">2</span>
              <div>
                <h3>Publisher policy</h3>
                <p>
                  Where a platform holder has said how its own games are handled, that answers directly.
                  Microsoft&apos;s games launch on Game Pass day one, new Call of Duty releases join about a year later,
                  and Sony&apos;s PS4 and PS5 games are dated from Sony&apos;s record on Extra.
                </p>
              </div>
            </div>
            <div className="cx-ab-step">
              <span className="cx-ab-n">3</span>
              <div>
                <h3>Two questions for everything else</h3>
                <p>
                  <b>When, if it joins.</b> Each service has its own model, trained on about 5,300 first arrivals going
                  back to 2013. It gives a best guess and a range built to hold the real date about 8 times in 10.
                </p>
                <p>
                  <b>Will it join at all.</b> Most games never join a given service. The chance comes from games like
                  it: its age, whether it&apos;s on PC, its Metacritic score, the publisher&apos;s record on that
                  service, and where it is in its own window.
                </p>
              </div>
            </div>
            <div className="cx-ab-step">
              <span className="cx-ab-n">4</span>
              <div>
                <h3>Tested before it ships</h3>
                <p>
                  At every update the models are rebuilt from older data and checked against what happened since. An
                  update that predicts worse doesn&apos;t ship. <Link to="/statistics">See the Statistics page</Link>{" "}
                  for the results.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="cx-tile">
          <div className="cx-sec-head">
            <h2 className="cx-h2">Data sources</h2>
            <p className="cx-context">Historical lists for all four services, updated quarterly. Game details come from RAWG.</p>
          </div>
          <div className="cx-ab-src">
            {SOURCES.map((s) => (
              <div key={s.key} className="cx-src" style={edge(s.key)}>
                <h3>{s.name}</h3>
                <p>{s.text}</p>
                <div className="cx-src-links">
                  {s.links.map(([label, href]) => (
                    <a key={href} href={href} target="_blank" rel="noopener noreferrer">
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="cx-ab-two">
          <section className="cx-tile">
            <h2 className="cx-h2">Good to know</h2>
            <ul className="cx-ab-list">
              <li>
                <b>Not live.</b> Whether a game is on Game Pass or PS Plus Extra, and announced join or leave dates, are
                as of the last data update{asOf ? ` (${asOf})` : ""}.
              </li>
              <li>
                <b>Habits change.</b> Services and publishers change their approach, and every figure assumes the next
                few years look like the last few.
              </li>
              <li>
                <b>Community data.</b> The records come from community lists and RAWG: mostly right, not always.
              </li>
              <li>
                <b>Estimates, not guarantees.</b> Statistics shows how often they land.
              </li>
              <li>
                <b>The first search can take a moment.</b> The prediction service sleeps when idle and can take up to a
                minute to wake. It starts waking the moment you open the site, and games already in our data answer
                straight away.
              </li>
            </ul>
          </section>
          <section className="cx-tile">
            <h2 className="cx-h2">Built with</h2>
            <ul className="cx-ab-tech">
              {BUILT_WITH.map(([what, how]) => (
                <li key={what}>
                  <b>{what}</b>
                  <span>{how}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="cx-tile cx-ab-plug">
          <div className="cx-sec-head">
            <h2 className="cx-h2">Check out my other gaming related project!</h2>
            <p className="cx-context">
              <b>PlayTested</b> is a no-nonsense gaming review platform and tech blog. Objective, honest reviews that cut
              through the noise. Powered by AI features.
            </p>
          </div>
          <a className="cx-btn cx-share-big" href="https://www.playtested.net/" target="_blank" rel="noopener noreferrer">
            Visit PlayTested.net
          </a>
        </section>
      </main>
    </div>
  );
}
