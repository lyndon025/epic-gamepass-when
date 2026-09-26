import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, NavLink } from "react-router-dom";
import Home from "./pages/Home";
import About from "./pages/About";
import Donate from "./pages/Donate";
import Leaderboard from "./pages/Leaderboard";
import "./styles/console.css";

function App() {
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
            </div>
          </nav>
        </header>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/p/:service/:slug" element={<Home />} />
          <Route path="/statistics" element={<Leaderboard />} />
          <Route path="/about" element={<About />} />
          <Route path="/donate" element={<Donate />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
