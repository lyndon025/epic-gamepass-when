from http.server import BaseHTTPRequestHandler
import json
import pickle
import pandas as pd
import numpy as np
import os

# Load model and artifacts (these will be in the same directory)
model_path = os.path.join(os.path.dirname(__file__), 'models', 'epic_regression_model.pkl')
encoder_path = os.path.join(os.path.dirname(__file__), 'models', 'publisher_encoder.pkl')
stats_path = os.path.join(os.path.dirname(__file__), 'models', 'publisher_statistics.csv')

with open(model_path, 'rb') as f:
    xgb_model = pickle.load(f)

with open(encoder_path, 'rb') as f:
    le_publisher = pickle.load(f)

publisher_stats = pd.read_csv(stats_path)
overall_avg_meta = 73.5  # From your training data

def safe_speed_score(days):
    if pd.isna(days) or days == 0:
        return 0.5
    return 1 / (days / 365)

def predict_game_timing(game_name, publisher, metacritic_score=None, release_year=2024, release_month=1):
    """Prediction logic from your notebook"""
    
    if publisher in publisher_stats['primary_publisher'].values:
        pub_stats = publisher_stats[publisher_stats['primary_publisher'] == publisher].iloc[0]
        avg_days = pub_stats['avg_days_to_epic']
        games_count = pub_stats['games_count']
        avg_meta = pub_stats['avg_metacritic']
        publisher_encoded = le_publisher.transform([publisher])[0]
    else:
        avg_days = publisher_stats['avg_days_to_epic'].mean()
        games_count = 0
        avg_meta = overall_avg_meta
        
        years_whole = int(avg_days / 365)
        months_whole = int(((avg_days / 365) - years_whole) * 12)
        
        return {
            'game_name': game_name,
            'publisher': publisher,
            'predicted_years': avg_days / 365,
            'years_whole': years_whole,
            'months_whole': months_whole,
            'lower_bound_years': 0.0,
            'upper_bound_years': 0.0,
            'sentence': f"Based on the publisher '{publisher}', which has no historical data in our Epic Games dataset, we cannot make a reliable prediction. Industry average suggests approximately {years_whole} years and {months_whole} months.",
            'publisher_game_count': games_count
        }
    
    if metacritic_score is None:
        metacritic_filled = avg_meta
        has_metacritic = 0
        meta_text = "without an available Metacritic score"
    else:
        metacritic_filled = metacritic_score
        has_metacritic = 1
        meta_text = f"with a Metacritic score of {metacritic_score}"
    
    publisher_speed = safe_speed_score(avg_days)
    
    features = pd.DataFrame([{
        'metacritic_filled': metacritic_filled,
        'has_metacritic': has_metacritic,
        'release_year': release_year,
        'release_month': release_month,
        'num_publishers': 1,
        'num_developers': 1,
        'games_count': games_count,
        'avg_days_to_epic': avg_days,
        'publisher_speed_score': publisher_speed,
        'publisher_encoded': publisher_encoded
    }])
    
    predicted_days = xgb_model.predict(features)[0]
    predicted_years = predicted_days / 365
    
    years_whole = int(predicted_years)
    months_whole = int((predicted_years - years_whole) * 12)
    
    lower_bound_years = max(predicted_years * 0.85, 0.1)
    upper_bound_years = predicted_years * 1.15
    
    avg_years = int(avg_days / 365)
    avg_months = int((avg_days % 365) / 30)
    
    sentence = (
        f"Based on the publisher '{publisher}', which has released {int(games_count)} "
        f"game{'s' if games_count != 1 else ''} on Epic Games Store with an average wait time of "
        f"{avg_years} year{'s' if avg_years != 1 else ''} and {avg_months} month{'s' if avg_months != 1 else ''} "
        f"(averaging a Metacritic score of {avg_meta:.1f}), "
        f"and considering '{game_name}' {meta_text}, "
        f"the model estimates it will appear free on Epic Games Store approximately "
        f"**{years_whole} year{'s' if years_whole != 1 else ''} and {months_whole} month{'s' if months_whole != 1 else ''}** "
        f"after release, with a confidence interval between **{lower_bound_years:.1f} and {upper_bound_years:.1f} years**."
    )
    
    return {
        'game_name': game_name,
        'publisher': publisher,
        'predicted_years': predicted_years,
        'years_whole': years_whole,
        'months_whole': months_whole,
        'lower_bound_years': lower_bound_years,
        'upper_bound_years': upper_bound_years,
        'sentence': sentence,
        'publisher_game_count': games_count
    }

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data.decode('utf-8'))
        
        result = predict_game_timing(
            game_name=data.get('game_name'),
            publisher=data.get('publisher'),
            metacritic_score=data.get('metacritic_score'),
            release_year=data.get('release_year', 2024),
            release_month=data.get('release_month', 1)
        )
        
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
