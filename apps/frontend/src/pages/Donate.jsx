const GOES_TO = [
  ["Faster first answers", "Paid hosting doesn't sleep, so no wake-up wait."],
  ["Fresher data", "More frequent updates than quarterly."],
  ["New features", "And better predictions."],
];

export default function Donate() {
  return (
    <div className="cx-pg">
      <main className="cx-shell">
        <header className="cx-pg-head">
          <h1>Support This Project</h1>
          <p className="cx-lede">
            A hobby project, hosted on free tiers. Every contribution goes into making it faster and better.
          </p>
        </header>

        <div className="cx-dn-two">
          <section className="cx-tile cx-dn-note">
            <p>
              This is a hobby project created to give gamers a rough estimate when their favorite games might become
              free or available on major platforms and subscription services. I built it to learn more about AI, machine
              learning, Python, and web development.
            </p>
            <p>
              If you&apos;ve found this tool useful and would like to support its development, I&apos;d genuinely
              appreciate any contribution. This service is hosted for free via Vercel and Render, but with your support,
              I could upgrade to faster response times and handle more requests. I also plan to improve prediction
              accuracy and develop new features in the future.
            </p>
            <p>Thank you for visiting!</p>
            <p className="cx-by">
              &mdash;{" "}
              <a href="https://github.com/lyndon025" target="_blank" rel="noopener noreferrer">
                lyndon025
              </a>
            </p>
            <div className="cx-dn-goes">
              {GOES_TO.map(([title, text]) => (
                <div key={title}>
                  <b>{title}</b>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="cx-tile cx-dn-kofi">
            <div className="cx-sec-head">
              <h2 className="cx-h2">Donate via Ko-fi</h2>
              <p className="cx-context">PayPal or card</p>
            </div>
            <iframe
              id="kofiframe"
              src="https://ko-fi.com/lyndon025/?hidefeed=true&widget=true&embed=true&preview=true&theme=dark"
              title="Ko-fi Donation Panel"
              loading="lazy"
            />
          </section>
        </div>
      </main>
    </div>
  );
}
