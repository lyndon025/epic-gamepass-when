import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home";
import About from "./pages/About";
import Donate from "./pages/Donate"; 


function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <nav className="bg-gray-900/95 backdrop-blur-sm border-b border-purple-500/30 sticky top-0 z-50">
  <div className="container mx-auto px-4 py-4 flex items-center justify-between">
    <Link
      to="/"
      className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600 flex items-center gap-2 sm:text-base sm:gap-1"
    >
      Epic Game Pass When
    </Link>
    <div className="flex gap-6 sm:gap-2">
      <Link
        to="/about"
        className="text-white hover:text-purple-300 transition-colors sm:text-base"
      >
        About
      </Link>
      <Link
        to="/donate"
        className="text-white hover:text-purple-300 transition-colors flex items-center gap-1 sm:text-base"
      >
        <span className="mr-1 text-lg sm:text-base">☕</span>
        Donate
      </Link>
    </div>
  </div>
</nav>




        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/donate" element={<Donate />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
