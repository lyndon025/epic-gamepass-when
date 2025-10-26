# 🎮 Epic Game Pass When

<div align="center">

![License](https://img.shields.io/badge/license-MIT-green.svg)
![React](https://img.shields.io/badge/React-19.1-61dafb.svg)
![Python](https://img.shields.io/badge/Python-3.10-blue.svg)
![XGBoost](https://img.shields.io/badge/XGBoost-2.0-orange.svg)

**AI-Powered Predictions for When Games Will Be Free**

Predict when your favorite games will become available on Epic Games Store, Xbox Game Pass, and PlayStation Plus Extra using machine learning trained on 15 years of historical data.

[🌐 Live Demo](https://epic-gamepass-when.vercel.app) • [🐛 Report Bug](https://github.com/lyndon025/epic-gamepass-when/issues) • [✨ Request Feature](https://github.com/lyndon025/epic-gamepass-when/issues)

</div>

---

## 📖 About The Project

**Epic Game Pass When** helps gamers make informed decisions about when to buy games by predicting when they might become available for free on major gaming platforms. Using advanced machine learning models trained on comprehensive historical data, the tool analyzes publisher patterns, game quality metrics, and release timing to provide accurate predictions with confidence intervals.

### 🎯 What It Does

- **Predicts Free Release Dates**: Estimates when games will appear on free platforms
- **Multi-Platform Support**: Currently supports Epic Games Store (Xbox Game Pass & PS Plus coming soon)
- **Smart Analysis**: Considers publisher behavior, Metacritic scores, and release dates
- **Confidence Intervals**: Provides prediction ranges to show uncertainty
- **Game Discovery**: Search thousands of games via integrated RAWG API

### 🤖 How It Works

1. **Data Collection**: Historical data from 2010-2025 covering Epic Games Store, Xbox Game Pass, and PlayStation Plus Extra
2. **Feature Engineering**: Analyzes publisher speed (how quickly they make games free), game quality (Metacritic scores), and release timing
3. **XGBoost Model**: Trained regression model predicts years until free release
4. **Confidence Intervals**: Statistical ranges show prediction uncertainty
5. **Real-time Predictions**: Flask API serves predictions instantly

### 🎓 Model Features

- **Publisher Statistics**: Historical average wait times per publisher
- **Game Metadata**: Metacritic scores, release dates, genre information
- **Speed Score**: Publisher's historical tendency to offer free games
- **Fallback Handling**: Graceful degradation for unknown publishers

### ⚠️ Limitations

- **Past Performance**: Predictions based on historical patterns which may change
- **Publisher Behavior**: Companies can alter their free game strategies
- **Market Factors**: Economic conditions and competition affect timing
- **Data Coverage**: Limited to games with sufficient historical data
- **Accuracy**: Predictions are estimates, not guarantees

## 🛠️ Tech Stack

### Frontend
- **React 19.1** - Modern UI framework
- **Vite 7** - Lightning-fast build tool
- **Tailwind CSS 4** - Utility-first styling
- **React Router 7** - Client-side routing
- **Axios** - HTTP client

### Backend
- **Flask 3.0** - Python web framework
- **XGBoost 2.0** - Machine learning model
- **Pandas & NumPy** - Data processing
- **scikit-learn 1.3** - ML preprocessing
- **Flask-CORS** - Cross-origin support

### APIs
- **RAWG API** - Game metadata and images
- **Custom ML API** - Prediction engine

