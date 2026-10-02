import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, NavLink, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import About from "./pages/About";
import Rankings from "./pages/Rankings";
import Statistics from "./pages/Statistics";
import Donate from "./pages/Donate";
import LogoMark from "./components/LogoMark";
import "./styles/console.css";
import "./styles/pages.css";
import { useTheme } from "./utils/theme";

// Home in the nav, marked current on a prediction page too, which is part of
// Home. A plain NavLink would only match "/" exactly.
function HomeLink() {
  const { pathname } = useLocation();
  const here = pathname === "/" || pathname.startsWith("/p/");
  return (
    <Link to="/" aria-current={here ? "page" : undefined}>
      Home
    </Link>
  );
}

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
              <LogoMark className="cx-brand-mark" />
              Epic Game Pass When?
            </Link>
            <div className="cx-nav">
              <HomeLink />
              <NavLink to="/about">About</NavLink>
              <NavLink to="/rankings">Rankings</NavLink>
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
          <Route path="/about" element={<About />} />
          <Route path="/rankings" element={<Rankings />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/donate" element={<Donate />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
