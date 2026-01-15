# 🎮 Epic Game Pass When?

**AI-Powered Game Prediction Engine**

Predict when your favorite games will be free on Epic Games Store, Xbox Game Pass, PlayStation Plus, and Humble Choice.

![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react)
![Tailwind](https://img.shields.io/badge/Tailwind-CSS-blue)
![Vite](https://img.shields.io/badge/Vite-Build-purple)
![Python](https://img.shields.io/badge/Python-3.10+-yellow?logo=python)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

-   **AI-Powered Predictions**: Uses XGBoost machine learning models trained on historical data to estimate when a game might join a subscription service.
-   **Multi-Platform Support**:
    -   Epic Games Store (Free Games)
    -   Xbox Game Pass Ultimate
    -   PlayStation Plus Extra
    -   Humble Choice
-   **Smart Search**: Integrated with RAWG API for instant game lookups.
-   **Manual Entry Fallback**: Seamlessly handles cases where API limits are reached or games are unlisted.
-   **Mobile Responsive**: Fully optimized for mobile devices with a 4x1 platform grid and stacked search interface.

## 🚀 Getting Started

### Prerequisites

-   **Node.js**: v16 or higher
-   **Python**: v3.10+ (for Backend)

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/epicgamepasswhen.git
    cd epicgamepasswhen
    ```

2.  **Install Frontend Dependencies**
    ```bash
    npm install
    ```

3.  **Start the Frontend**
    ```bash
    npm run dev
    ```

### Backend Setup
*(See `../epicgamepasswhen-backend/README.md` for full details)*

1.  Navigate to the backend directory.
2.  Install requirements: `pip install -r requirements.txt`.
3.  Run the Flask app: `python app.py`.

## 🛠️ Architecture

The project is split into a modern React frontend and a Python Flask backend.

### Frontend (`/src`)
-   **`Home.jsx`**: Main controller. Handles search, selection, and coordination between components.
-   **`PlatformSelector.jsx`**: 4x1 responsive grid for selecting prediction models.
-   **`GameSearch.jsx`**: Search interface with manual entry fallback.
-   **`PredictionResults.jsx`**: Display logic for AI confidence scores and reasoning.

### Backend (`/api`)
-   **`predict`**: Endpoint that accepts game metadata and runs it through the XGBoost model.
-   **`GameServicePredictor`**: Core logic class handling feature engineering and inference.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.
