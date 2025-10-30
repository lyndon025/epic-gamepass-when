# 🎮 Game Prediction Engine

Predict when games will become free on Epic Games Store, Xbox Game Pass, and PlayStation Plus using machine learning and historical giveaway data.

![Python](https://img.shields.io/badge/Python-3.9+-blue)
![Flask](https://img.shields.io/badge/Flask-2.0+-green)
![XGBoost](https://img.shields.io/badge/XGBoost-ML-orange)
![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react)
![License](https://img.shields.io/badge/License-MIT-yellow)

## About The Project

This application uses machine learning to predict when games will be added to major subscription services. Instead of manually tracking when your favorite games become free, this tool analyzes historical data and provides accurate predictions with confidence scores.

## Backend Architecture

### GameServicePredictor Class - ML Engine

The backend uses a tiered prediction system with three fallback layers.

#### Tier 1: Historical Lookup (Most Reliable)

If a game previously appeared on the platform, the system calculates when it might return based on average intervals between appearances. This uses Pandas to analyze historical data from CSV files.

#### Tier 2: XGBoost Model

For new games, an XGBoost machine learning model predicts time-to-service using features like:
- Publisher identity (encoded)
- Metacritic score
- Publisher statistics (average days to inclusion, consistency variance)

#### Tier 3: First-Party Check

Microsoft and Sony first-party titles are handled with special logic:
- Xbox Game Pass: 99% confidence prediction of "Day One" release
- PlayStation Studios: 75% confidence for "within 12-24 months"

### Confidence Scoring

Predictions include confidence percentages calculated based on:
- Sample Size Reliability
- Data Consistency
- Metacritic Availability

Platform-specific caps:
- Epic Games: 95% maximum confidence
- Xbox Game Pass: 80% maximum confidence
- PS Plus Extra: 70% maximum confidence

## Data Flow

1. User searches for a game
2. Frontend queries RAWG API for game metadata
3. User selects a game and chooses a subscription platform
4. Frontend sends game details and platform choice to Flask backend
5. Backend's GameServicePredictor runs the tiered prediction logic
6. Backend returns prediction with category, confidence, and reasoning

## Getting Started

### Prerequisites

- Python 3.9 or higher
- Node.js 14 or higher

### Backend Setup

git clone https://github.com/yourusername/game-prediction-engine.git
cd game-prediction-engine
python -m venv venv
source venv/bin/activate
pip install flask flask-cors pandas numpy xgboost
python app.py

### Frontend Setup

cd frontend
npm install
npm run dev

## Built With

- React 18
- Vite
- Flask
- Python
- XGBoost
- Pandas
- NumPy

## Data Sources

- i-pax: Epic Games Store historical data (Up to June 2025)
- ABattleVet: Xbox Game Pass & PS Plus data (Up to October 2025)
- RAWG: Game database and API

## Infrastructure

Backend: Render's free tier
- Cold start: 50-90 seconds after 15 minutes of inactivity
- Fully operational after initial startup

## License

MIT License

## Acknowledgments

- i-pax for Epic Games Store historical dataset
- ABattleVet for Xbox Game Pass and PS Plus datasets
- RAWG for game database API
