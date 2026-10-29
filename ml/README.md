# ML Engine

Machine learning components for the portfolio analysis system.

## Folder Structure

- **data/raw** - Original, immutable data sources (git-ignored)
- **data/processed** - Cleaned and transformed datasets ready for modeling (git-ignored)
- **scripts** - Training, evaluation, and data processing scripts
- **artifacts** - Trained models, encoders, scalers (git-ignored)
- **reports** - Performance metrics, visualizations, experiment logs
- **tests** - Unit and integration tests for ML components

## Setup

Activate the virtual environment:
```bash
source .venv/Scripts/activate  # Windows Git Bash
# or: .venv\Scripts\activate   # Windows CMD
# or: source .venv/bin/activate # Linux/Mac
```

Install dependencies:
```bash
pip install -r requirements.txt
```
