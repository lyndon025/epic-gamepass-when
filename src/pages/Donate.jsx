export default function Donate() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 text-white">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl md:text-5xl font-bold mb-8 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
          Support This Project
        </h1>

        <div className="space-y-8">
          {/* Description Section */}
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-8 shadow-xl border border-white/20">
            <p className="text-base leading-relaxed mb-4">
              This is a hobby project created to give gamers a rough estimate when their favorite games might become free or available on major platforms and subscription services. I built it to learn more about AI, machine learning, Python, and web development.
            </p>
            <p className="text-base leading-relaxed mb-4">
              If you've found this tool useful and would like to support its development, I'd genuinely appreciate any contribution. This service is hosted for free via Vercel and Render, but with your support, I could upgrade to faster response times and handle more requests.  I also plan to improve prediction accuracy and develop new features in the future.
            </p>
            <p className="text-base leading-relaxed">
              Thank you for visiting!
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>-</span>
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


          {/* Ko-fi Donation Panel */}
          <div className="w-full flex flex-col items-center justify-center space-y-4">
            <div className="text-center">
              <h2 className="text-2xl font-bold">Donate via Ko-fi</h2>
              <p className="text-gray-300 text-sm">PayPal or Card</p>
            </div>

            <div 
              className="w-full max-w-2xl rounded-xl overflow-hidden shadow-2xl" 
              style={{ transform: 'translateZ(0)', willChange: 'transform' }}
            >
              <iframe
                id="kofiframe"
                src="https://ko-fi.com/lyndon025/?hidefeed=true&widget=true&embed=true&preview=true&theme=dark"
                title="Ko-fi Donation Panel"
                style={{
                  border: 'none',
                  width: '100%',
                  height: '600px',
                  padding: '4px',
                  background: '#05122dff',
                  borderRadius: '0.5rem',
                  boxShadow: '0 0 10px rgba(0,0,0,0.05)',
                  overflow: 'hidden',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
