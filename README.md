# 🎮 Game Prediction Engine - Frontend

Predict when games will become free on Epic Games Store, Xbox Game Pass, and PlayStation Plus.

![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react)
![Tailwind](https://img.shields.io/badge/Tailwind-CSS-blue)
![Vite](https://img.shields.io/badge/Vite-Build-purple)

## About The Project

This is the frontend interface for the Game Prediction Engine. It allows users to:
1.  **Search** for games (via RAWG API).
2.  **Select** a platform model (Epic, Xbox, PS Plus).
3.  **View Predictions** with confidence scores and reasoning.

## Getting Started

### Prerequisites
- Node.js 16+
- Backend running (see `../epicgamepasswhen-backend/README.md`)

### Installation
```bash
npm install
```

### Configuration
Edit `src/config.js` to point to your backend:
```javascript
const config = {
  // Option 1: Render (Default)
  // backendUrl: "https://your-render-app.onrender.com",
    
  // Option 2: Fly.io
  // backendUrl: "https://your-fly-app.fly.dev",

  // Local Development
  backendUrl: "http://localhost:5000",
};
export default config;
```

### Run Locally
```bash
npm run dev
```

## Troubleshooting

### "Waking up server..." / Timeout Errors
If you are using the free tier of Render or Fly.io, the backend may "sleep" after inactivity.
-   **Cold Start**: The first request may take **50-90 seconds**.
-   **Timeout**: If you see "Request timed out", please **click Predict again**. The server is likely awake now and will respond instantly.
-   The "Predict" button will show a "Waking up server..." message if the request takes longer than 2 seconds.

## Architecture

Refactored into components:
-   `PlatformSelector`: Choose between prediction models.
-   `GameSearch`: Search for games.
-   `GameDetails`: View game info and trigger prediction.
-   `PredictionResults`: Display confidence, category, and analysis.

## License
MIT License
