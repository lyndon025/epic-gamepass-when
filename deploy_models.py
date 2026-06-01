
import os
import shutil

# Configuration
SOURCE_BASE = r"i:\Lyndon\AI ML\Project\Epic and Gamepass Predictor"
BACKEND_BASE = os.path.join(SOURCE_BASE, "epicgamepasswhen-backend")
BACKEND_MODELS = os.path.join(BACKEND_BASE, "models")

# Define copies
# Tuple format: (Source Path, Destination Filename inside Backend folder or models folder)
# We want CSVs in backend root (based on App.py logic) and Models in backend/models
COPY_LIST = [
    # Xbox
    {
        "src": os.path.join(SOURCE_BASE, "Xbox", "Xbox.csv"),
        "dst": os.path.join(BACKEND_BASE, "Xbox.csv")
    },
    {
        "src": os.path.join(SOURCE_BASE, "Xbox", "xgb_xbox_model.pkl"),
        "dst": os.path.join(BACKEND_MODELS, "xgb_xbox_model.pkl")
    },
    {
        "src": os.path.join(SOURCE_BASE, "Xbox", "publisher_statistics_xbox.csv"),
        "dst": os.path.join(BACKEND_MODELS, "publisher_statistics_xbox.csv")
    },
    {
        "src": os.path.join(SOURCE_BASE, "Xbox", "publisher_encoder_xbox.pkl"),
        "dst": os.path.join(BACKEND_MODELS, "publisher_encoder_xbox.pkl")
    },
    
    # PS Plus
    {
        "src": os.path.join(SOURCE_BASE, "Xbox", "PS.csv"),
        "dst": os.path.join(BACKEND_BASE, "PS.csv")
    },
    {
        "src": os.path.join(SOURCE_BASE, "Xbox", "xgb_psplus_model.pkl"),
        "dst": os.path.join(BACKEND_MODELS, "xgb_psplus_model.pkl")
    },
    {
        "src": os.path.join(SOURCE_BASE, "Xbox", "publisher_statistics_psplus.csv"),
        "dst": os.path.join(BACKEND_MODELS, "publisher_statistics_psplus.csv")
    },
    {
        "src": os.path.join(SOURCE_BASE, "Xbox", "publisher_encoder_psplus.pkl"),
        "dst": os.path.join(BACKEND_MODELS, "publisher_encoder_psplus.pkl")
    },
    
    # Epic
    {
        "src": os.path.join(SOURCE_BASE, "Epic", "Epic.csv"),
        "dst": os.path.join(BACKEND_BASE, "Epic.csv")
    },
    {
        "src": os.path.join(SOURCE_BASE, "Epic", "xgb_epic_model.pkl"),
        "dst": os.path.join(BACKEND_MODELS, "xgb_epic_model.pkl")
    },
    {
        "src": os.path.join(SOURCE_BASE, "Epic", "publisher_statistics_epic.csv"),
        "dst": os.path.join(BACKEND_MODELS, "publisher_statistics_epic.csv")
    },
    {
        "src": os.path.join(SOURCE_BASE, "Epic", "publisher_encoder_epic.pkl"),
        "dst": os.path.join(BACKEND_MODELS, "publisher_encoder_epic.pkl")
    },

    # Humble Bundle (NEW)
    {
        "src": os.path.join(SOURCE_BASE, "HB", "HB.csv"),
        "dst": os.path.join(BACKEND_BASE, "HB.csv")
    },
    {
        "src": os.path.join(SOURCE_BASE, "HB", "xgb_humblebundle_model.pkl"),
        "dst": os.path.join(BACKEND_MODELS, "xgb_humblebundle_model.pkl")
    },
    {
        "src": os.path.join(SOURCE_BASE, "HB", "publisher_statistics_humblebundle.csv"),
        "dst": os.path.join(BACKEND_MODELS, "publisher_statistics_humblebundle.csv")
    },
    {
        "src": os.path.join(SOURCE_BASE, "HB", "publisher_encoder_humblebundle.pkl"),
        "dst": os.path.join(BACKEND_MODELS, "publisher_encoder_humblebundle.pkl")
    }
]

def deploy():
    print("Deploying models and data to backend...")
    
    if not os.path.exists(BACKEND_MODELS):
        os.makedirs(BACKEND_MODELS)
        
    for item in COPY_LIST:
        src = item['src']
        dst = item['dst']
        
        if os.path.exists(src):
            try:
                shutil.copy2(src, dst)
                print(f"✓ Copied {os.path.basename(src)}")
            except Exception as e:
                print(f"❌ Error copying {os.path.basename(src)}: {e}")
        else:
            print(f"⚠️ Source missing: {src}")

if __name__ == "__main__":
    deploy()
