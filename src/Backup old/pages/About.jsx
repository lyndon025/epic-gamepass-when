export default function About() {
  return (
    <div className="min-h-screen py-6 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-10 border border-white/20 shadow-2xl">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 sm:mb-8">
            About This Project
          </h1>

          <div className="space-y-8 text-gray-200">
            {/* Introduction */}
            <section>
              <p className="text-base sm:text-lg leading-relaxed">
                This AI-powered tool predicts when games will become free on
                major platforms / subscription services using machine learning
                models trained on historical giveaway data.
              </p>
            </section>

            {/* Data Sources */}
            <div className="bg-white/5 rounded-xl p-4 sm:p-6 border border-white/10">
              <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                <span>📊</span>
                <span>Data Sources</span>
              </h2>

              <div className="space-y-6 text-sm sm:text-base leading-relaxed text-gray-200">
                <p>
                  Historical data collected from Epic Games Store, Xbox Game
                  Pass, and PlayStation Plus Extra free game offerings spanning
                  from 2010 to 2025, including release dates, Metacritic scores,
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
                      <span>i-pax</span>
                      <span className="text-gray-400 text-sm font-normal">
                        - Epic Games Store historical data (Up to June 2025)
                      </span>
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <a
                        href="https://docs.google.com/spreadsheets/d/1pD5h9JfwjewnN7DTKPu-Ad89ukaStLaY7nB5jhOAEyE/edit#gid=504781956"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-all shadow-md hover:shadow-lg text-sm"
                      >
                        📊 View Google Sheets
                      </a>
                      <a
                        href="https://www.reddit.com/r/EpicGamesPC/comments/zwdd9h/the_complete_and_regularly_updated_list_of_all/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-all shadow-md hover:shadow-lg text-sm"
                      >
                        💬 Reddit Thread
                      </a>
                    </div>
                  </div>

                  {/* ABattleVet Xbox/PS Plus Section */}
                  <div className="mb-4 p-4 bg-white/5 rounded-lg border border-blue-500/30">
                    <p className="text-blue-300 font-semibold mb-3 flex items-center gap-2">
                      <span>🎯</span>
                      <span>ABattleVet</span>
                      <span className="text-gray-400 text-sm font-normal">
                        - Xbox Game Pass & PS Plus data (Up to October 2025)
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
                </div>
              </div>
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
                  <span>React + Vite Frontend</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span>Python Flask Backend</span>
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
          </div>
        </div>
      </div>
    </div>
  );
}
