"""
Configuration settings for MemOps SRE.
Supports environment variables or .env file overrides.
"""

import os
from pathlib import Path


class Settings:
    def __init__(self):
        self.PROJECT_NAME: str = "MemOps SRE"
        self.VERSION: str = "1.0.0"
        self.PORT: int = int(os.getenv("PORT", "8000"))
        self.HOST: str = os.getenv("HOST", "0.0.0.0")
        
        # API Keys (optional; local fallbacks are automatic)
        self.GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
        self.ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
        self.OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
        self.HINDSIGHT_API_KEY: str = os.getenv("HINDSIGHT_API_KEY", "")
        self.HINDSIGHT_API_URL: str = os.getenv("HINDSIGHT_API_URL", "https://api.hindsight.ai/v1")
        
        # Paths
        self.BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
        self.DATA_DIR: Path = self.BASE_DIR / "data"
        self.MEMORY_DB_PATH: Path = self.DATA_DIR / "hindsight_memory.json"
        self.FRONTEND_DIR: Path = self.BASE_DIR / "frontend"
        
        # Ensure data directory exists
        self.DATA_DIR.mkdir(parents=True, exist_ok=True)
        
        # Thresholds
        self.MEMORY_SIMILARITY_THRESHOLD: float = 0.70
        self.CONFIDENCE_BOOST_ON_VERIFY: float = 0.05


settings = Settings()
