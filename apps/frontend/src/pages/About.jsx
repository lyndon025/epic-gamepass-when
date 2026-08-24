export default function About() {
  return (
    <div className="min-h-screen py-6 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-10 border border-white/20 shadow-2xl">
          <div className="mb-6">
            <a href="/" className="inline-flex items-center text-purple-400 hover:text-purple-300 transition-colors">
              <span className="mr-2">←</span> Back to Home
            </a>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 sm:mb-8">
            About This Project
          </h1>

          <div className="space-y-8 text-gray-200">
            {/* What's New - version 2.0 */}
            <section className="bg-white/5 rounded-xl p-4 sm:p-6 border border-purple-500/40">
              <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-semibold text-white flex items-center gap-2">
                  <span>✨</span>
                  <span>What&apos;s New</span>
                </h2>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 whitespace-nowrap">
                  Version 2.0 &middot; 2026
                </span>
              </div>

              <p className="text-sm sm:text-base leading-relaxed mb-5">
                The biggest update since launch. The prediction engine was rebuilt
                and every service&apos;s history was refreshed.
              </p>

              <ul className="space-y-3 text-sm sm:text-base leading-relaxed">
                <li className="flex gap-3">
                  <span className="text-purple-400 mt-0.5">&#9656;</span>
                  <span>
                    <span className="font-semibold text-white">Data current through August 2026.</span>{" "}
                    All four services refreshed, adding several hundred new arrivals.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-purple-400 mt-0.5">&#9656;</span>
                  <span>
                    <span className="font-semibold text-white">A rebuilt prediction model.</span>{" "}
                    Measurably more accurate than before, and now tested the honest
                    way: trained only on what was known at the time, then checked
                    against what actually happened.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-purple-400 mt-0.5">&#9656;</span>
                  <span>
                    <span className="font-semibold text-white">Unfamiliar publishers get a real answer.</span>{" "}
                    The old version gave up when it had not seen a publisher before.
                    It now answers from what it knows generally, and says how
                    uncertain that makes it.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-purple-400 mt-0.5">&#9656;</span>
                  <span>
                    <span className="font-semibold text-white">Call of Duty handled correctly.</span>{" "}
                    Microsoft changed its Game Pass policy in 2026 and new entries no
                    longer arrive at launch. Predictions now reflect that, while
                    older entries are still judged on their own history.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-purple-400 mt-0.5">&#9656;</span>
                  <span>
                    <span className="font-semibold text-white">A less mysterious wait.</span>{" "}
                    The prediction service now starts warming up the moment you open
                    the site, and if it is still starting it tells you so instead of
                    sitting silent.
                  </span>
                </li>
              </ul>
            </section>

            {/* Introduction */}
            <section className="bg-gradient-to-r to-gray-900 rounded-xl p-6 border-l-4 border-purple-500">
              <div className="flex items-start gap-4">
                <div className="text-4xl">🤖</div>
                <div>
                  <h3 className="text-lg font-bold mb-3 text-purple-400">
                    AI-Powered Game Predictions
                  </h3>
                  <p className="text-base sm:text-ld leading-relaxed mb-4">
                    This tool predicts when games will become free on major
                    platforms using
                    <span className="font-semibold text-white">
                      {" "}
                      machine learning models
                    </span>{" "}
                    trained on historical giveaway data.
                  </p>
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <span>🔧 Built by</span>
                    <a
                      href="https://github.com/lyndon025"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-purple-400 hover:text-purple-300 transition"
                    >
                      lyndon025
                    </a>
                  </div>
                </div>
              </div>
            </section>

            {/* How It Works */}
            <div className="bg-white/5 rounded-xl p-4 sm:p-6 border border-white/10">
              <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                <span>🧠</span>
                <span>How It Works</span>
              </h2>

              <div className="space-y-4 text-sm sm:text-base leading-relaxed text-gray-200">
                <p>
                  Each service gets its own prediction model. Xbox Game Pass and PS
                  Plus behave nothing alike, and one model averaging them together
                  would be wrong for both.
                </p>
                <p>
                  The models are{" "}
                  <span className="font-semibold text-white">
                    gradient-boosted decision trees
                  </span>
                  , trained on roughly 6,900 historical arrivals across the four
                  services, going back as far as 2002.
                </p>
                <p>
                  Accuracy is measured by{" "}
                  <span className="font-semibold text-white">
                    time-based validation
                  </span>
                  : the model is trained only on what was known before a given date,
                  then tested on what happened after, and compared against simple
                  benchmarks it has to beat. Typical error is measured in months
                  rather than days, so treat a prediction as a guide to roughly when,
                  not a promise about a particular week.
                </p>
                <p>
                  Some answers do not come from the model at all. Where a platform
                  holder has published a policy about its own games, that is more
                  reliable than any prediction, so it is used directly.
                </p>
              </div>
            </div>

            {/* Data Sources */}
            <div className="bg-white/5 rounded-xl p-4 sm:p-6 border border-white/10">
              <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                <span>📊</span>
                <span>Data Sources</span>
              </h2>

              <div className="space-y-6 text-sm sm:text-base leading-relaxed text-gray-200">
                <p>
                  Historical data collected from Epic Games Store, Xbox Game
                  Pass, PlayStation Plus Extra, and Humble Choice (Humble Bundle Monthly) free game offerings spanning
                  from 2010 to 2026, including release dates, Metacritic scores,
                  and publisher information.
                </p>

                <div className="mt-6 pt-6 border-t border-white/10">
                  <p className="font-semibold text-white mb-4">
                    Sources and Special Thanks:
                  </p>

                  {/* i-pax Epic Games Section */}
                  <div className="mb-6 p-4 bg-white/5 rounded-lg border border-purple-500/30">
                    <p className="text-purple-300 font-semibold mb-3 flex items-center gap-2">
                      <span>🎮</span>
                      <span>i-pax & PCGamer</span>
                      <span className="text-gray-400 text-sm font-normal">
                        - Epic Games Store historical data
                      </span>
                    </p>
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                        <span className="text-gray-400 text-xs w-24">Original Source:</span>
                        <div className="flex gap-2">
                          <a
                            href="https://docs.google.com/spreadsheets/d/1pD5h9JfwjewnN7DTKPu-Ad89ukaStLaY7nB5jhOAEyE/edit#gid=504781956"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center px-3 py-1 bg-green-600 hover:bg-green-700 text-white font-medium rounded transition-all shadow-md text-xs"
                          >
                            📊 Google Sheets
                          </a>
                          <a
                            href="https://www.reddit.com/r/EpicGamesPC/comments/zwdd9h/the_complete_and_regularly_updated_list_of_all/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded transition-all shadow-md text-xs"
                          >
                            💬 Reddit
                          </a>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                        <span className="text-gray-400 text-xs w-24">June '25 - Jan '26:</span>
                        <a
                          href="https://www.pcgamer.com/epic-games-store-free-games-list/#"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-medium rounded transition-all shadow-md text-xs"
                        >
                          📰 PCGamer
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* ABattleVet Xbox/PS Plus Section */}
                  <div className="mb-4 p-4 bg-white/5 rounded-lg border border-blue-500/30">
                    <p className="text-blue-300 font-semibold mb-3 flex items-center gap-2">
                      <span>🎯</span>
                      <span>ABattleVet</span>
                      <span className="text-gray-400 text-sm font-normal">
                        - Xbox Game Pass & PS Plus data (Up to Early January 2026)
                      </span>
                    </p>

                    {/* Xbox Buttons */}
                    <div className="mb-4">
                      <p className="text-sm text-gray-300 mb-2 font-medium">
                        Xbox Game Pass:
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <a
                          href="https://docs.google.com/spreadsheets/d/1kspw-4paT-eE5-mrCrc4R9tg70lH2ZTFrJOUmOtOytg"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-all shadow-md hover:shadow-lg text-sm"
                        >
                          📊 View Google Sheets
                        </a>
                        <a
                          href="https://www.reddit.com/r/XboxGamePass/comments/gancnk/master_list_of_all_current_and_removed_game_pass/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-all shadow-md hover:shadow-lg text-sm"
                        >
                          💬 Reddit Thread
                        </a>
                      </div>
                    </div>

                    {/* PS Plus Buttons */}
                    <div>
                      <p className="text-sm text-gray-300 mb-2 font-medium">
                        PlayStation Plus:
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <a
                          href="https://docs.google.com/spreadsheets/d/19RorxFhWc2lHocg4c9zrVssSwZq1u2nPcpTsAvzdJQw/edit?gid=1938605355#gid=1938605355"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-all shadow-md hover:shadow-lg text-sm"
                        >
                          📊 View Google Sheets
                        </a>
                        <a
                          href="https://www.reddit.com/r/PlayStationPlus/comments/vid7ev/na_playstation_plus_master_list/?utm_source=share&utm_medium=ios_app&utm_name=iossmf"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-all shadow-md hover:shadow-lg text-sm"
                        >
                          💬 Reddit Thread
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Humble Bundle Section */}
                  <div className="mb-4 p-4 bg-white/5 rounded-lg border border-red-500/30">
                    <div className="text-red-300 font-semibold mb-3">
                      <div className="flex items-center gap-2">
                        <span>🎁</span>
                        <span>dangarbri / appsolutelywonderful</span>
                      </div>
                      <div className="text-gray-400 text-sm font-normal mt-1">
                        - Humble Choice (Humble Bundle Monthly) data (Up to Early January 2026)
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <a
                        href="https://dangarbri.tech/humblechoice"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-all shadow-md hover:shadow-lg text-sm"
                      >
                        🌐 Visit Website
                      </a>
                      <a
                        href="https://www.reddit.com/r/humblebundles/comments/16gsmku/3_years_ago_i_made_a_searchable_list_of_all/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-all shadow-md hover:shadow-lg text-sm"
                      >
                        💬 Reddit Thread
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Backend Performance Notice */}
            <div className="bg-yellow-500/20 backdrop-blur-lg rounded-xl p-6 shadow-xl border border-yellow-500/40">
              <h2 className="text-2xl font-semibold mb-3 flex items-center gap-2">
                <span>⏱️</span> First Load May Take Up to a Minute
              </h2>
              <p className="text-base leading-relaxed mb-3">
                This application's backend runs on Render's free tier, which
                automatically spins down after 15 minutes of inactivity to
                conserve resources. When you're the first visitor after a period
                of inactivity, the backend needs to "wake up" and restart, which
                can take 50-90 seconds.
              </p>
              <p className="text-base leading-relaxed">
                After the initial load, the application will work smoothly for
                all users as long as someone is actively using the service.
                Thank you for your patience!
              </p>
            </div>

            {/* Technology Stack */}
            <section className="bg-white/5 rounded-xl p-4 sm:p-6 border border-white/10">
              <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                <span>🔧</span>
                <span>Technology Stack</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm sm:text-base">
                <div className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span>XGBoost Regression Model</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span>Metacritic Score Weighting</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span>Publisher Analysis</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span>React + Vite Frontend (Vercel)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span>Python Flask Backend (Render)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span>Supabase (PostgreSQL) for Caching & Statistics</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span>RAWG API Integration</span>
                </div>
              </div>
            </section>

            {/* How It Works */}
            <section className="bg-white/5 rounded-xl p-4 sm:p-6 border border-white/10">
              <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                <span>🧠</span>
                <span>How It Works</span>
              </h2>
              <ol className="list-decimal list-inside space-y-2 text-sm sm:text-base">
                <li>Search for any game using the RAWG database</li>
                <li>
                  Model analyzes publisher history, Metacritic scores, and
                  release patterns
                </li>
                {/* Prediction Engine */}
                <div className="bg-slate-700 bg-opacity-50 p-4 rounded-lg border border-slate-600">
                  <h3 className="text-xl font-semibold mb-3">
                    🤖 Prediction Engine
                  </h3>
                  <p className="text-slate-300 mb-3">
                    The backend uses a <strong>tiered prediction system</strong>{" "}
                    with three fallback layers:
                  </p>
                  <ul className="space-y-2 text-slate-300 text-sm">
                    <li>
                      <strong>A. Historical Lookup (Most Reliable):</strong> If
                      a game previously appeared on the platform/service, the
                      system calculates when it might return based on average
                      intervals between appearances. This uses pandas to analyze
                      historical data from CSV files
                    </li>
                    <li>
                      <strong>B. XGBoost Model:</strong> For new games, an
                      XGBoost machine learning model predicts time-to-service
                      using features like publisher identity, Metacritic score,
                      and publisher statistics.
                    </li>
                    <li>
                      <strong>C. First-Party Check:</strong> Microsoft and Sony
                      first-party titles are handled with special logic—Xbox
                      "within 12-24 months" predictions.
                    </li>
                    <li>
                      <strong>D. Humble Choice Rules:</strong> Humble Choice games
                      has never repeated (as of January 2026). If a game has appeared before, it is
                      flagged as "Very Unlikely" to reappear.
                    </li>
                  </ul>
                </div>
                <li>
                  Predicts time until free release with confidence intervals
                </li>
                <li>Provides detailed explanation of the prediction</li>
              </ol>
            </section>

            {/* Limitations */}
            <div className="bg-white/5 rounded-xl p-4 sm:p-6 border border-white/10">
              <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                <span>⚠️</span>
                <span>Limitations</span>
              </h2>

              <ul className="space-y-3 text-sm sm:text-base text-gray-200">
                <li className="flex gap-3">
                  <span className="text-yellow-400 mt-1">•</span>
                  <div>
                    <strong className="text-white">Live checks:</strong> It
                    currently can’t verify if a game is currently live on the
                    service, it only assumes it isn’t and predicts when it can
                    come. This tool focuses on predicting titles that might join
                    or rejoin in the future.
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="text-yellow-400 mt-1">•</span>
                  <div>
                    <strong className="text-white">Past Performance:</strong>{" "}
                    Predictions based on historical patterns which may change
                  </div>
                </li>

                <li className="flex gap-3">
                  <span className="text-yellow-400 mt-1">•</span>
                  <div>
                    <strong className="text-white">Publisher Behavior:</strong>{" "}
                    Companies can alter their free game strategies
                  </div>
                </li>

                <li className="flex gap-3">
                  <span className="text-yellow-400 mt-1">•</span>
                  <div>
                    <strong className="text-white">Market Factors:</strong>{" "}
                    Economic conditions and competition affect timing
                  </div>
                </li>

                <li className="flex gap-3">
                  <span className="text-yellow-400 mt-1">•</span>
                  <div>
                    <strong className="text-white">Data Coverage:</strong>{" "}
                    Limited to games with sufficient historical data
                  </div>
                </li>

                <li className="flex gap-3">
                  <span className="text-yellow-400 mt-1">•</span>
                  <div>
                    <strong className="text-white">Accuracy:</strong>{" "}
                    Predictions are estimates, not guarantees
                  </div>
                </li>
              </ul>
            </div>

            {/* Additional References */}
            <section className="bg-white/5 rounded-xl p-4 sm:p-6 border border-white/10">
              <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                <span>📚</span>
                <span>Additional References</span>
              </h2>
              <ul className="list-disc list-inside space-y-2 text-sm sm:text-base">
                <li>RAWG Video Game Database API</li>
                <li>Metacritic Scores Database</li>
                <li>XGBoost Machine Learning Library</li>
              </ul>
            </section>

            {/* Shameless Plug */}
            <section className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-xl p-6 border border-white/10 text-center">
              <h2 className="text-xl sm:text-2xl font-semibold text-white mb-3">
                Check out my other gaming related project! 🚀
              </h2>
              <p className="text-gray-300 mb-4 max-w-2xl mx-auto">
                <strong className="text-white">PlayTested</strong> is a no-nonsense gaming review platform and tech blog.
                Objective, honest reviews that cut through the noise. Powered by AI features.
              </p>
              <a
                href="https://www.playtested.net/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-6 py-3 bg-white text-purple-900 font-bold rounded-full hover:bg-gray-100 transition-transform transform hover:scale-105 shadow-lg"
              >
                Visit PlayTested.net
              </a>
            </section>
          </div>
        </div>
      </div>
    </div >
  );
}
