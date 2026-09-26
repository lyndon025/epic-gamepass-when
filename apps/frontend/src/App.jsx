import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, NavLink } from "react-router-dom";
import Home from "./pages/Home";
import About from "./pages/About";
import Donate from "./pages/Donate";
import Leaderboard from "./pages/Leaderboard";
import "./styles/console.css";
import { useTheme } from "./utils/theme";

function App() {
  const [theme, toggleTheme] = useTheme();
  // Wake the prediction backend the moment someone lands on the site. It
  // sleeps when idle on free hosting, so starting it now means the cold start
  // overlaps with the visitor searching rather than blocking their first
  // prediction. Deliberately ignores the outcome - failure here is harmless.
  useEffect(() => {
    fetch("/api/warmup").catch(() => { });
  }, []);

  return (
    <BrowserRouter>
      <div className="cx-app">
        <header className="cx-topbar-wrap">
          <nav className="cx-topbar" aria-label="Main">
            <Link to="/" className="cx-brand">
              <span className="cx-brand-mark" aria-hidden="true"><span /></span>
              Epic Game Pass When?
            </Link>
            <div className="cx-nav">
              <NavLink to="/about">About</NavLink>
              <NavLink to="/statistics">Statistics</NavLink>
              <NavLink to="/donate">Donate</NavLink>
              <button
                type="button"
                className="cx-theme-btn"
                onClick={toggleTheme}
                aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
                title={theme === "light" ? "Dark mode" : "Light mode"}
              >
                {theme === "light" ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                  </svg>
                )}
              </button>
            </div>
          </nav>
        </header>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/p/:service/:slug" element={<Home />} />
          <Route path="/statistics" element={<div className="cx-dark-only"><Leaderboard /></div>} />
          <Route path="/about" element={<div className="cx-dark-only"><About /></div>} />
          <Route path="/donate" element={<div className="cx-dark-only"><Donate /></div>} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
