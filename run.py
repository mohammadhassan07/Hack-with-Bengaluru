"""
MemOps SRE Unified Runner.
Starts the FastAPI backend, serves the 3D Glassmorphic Dashboard, and connects Hindsight Memory.
"""

import sys
import uvicorn
from pathlib import Path

# Ensure backend package is in python path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR / "backend"))

if __name__ == "__main__":
    print("=" * 65)
    print("[*] Starting MemOps SRE -- Autonomous Memory-Augmented SRE Engine")
    print("    Dashboard & 3D Mesh: http://localhost:8000")
    print("    API Docs:            http://localhost:8000/docs")
    print("    Hindsight Engine:    Active (Embedded Vector + Graph Store)")
    print("=" * 65)

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )
