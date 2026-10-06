import json
import random
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Dict, Any

from fastapi import FastAPI, UploadFile, File, Form, status
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.model import verify_image, precompute_item_embeddings, MODEL_NAME

# Resolve paths relative to this file
BASE_DIR = Path(__file__).resolve().parent
ITEMS_PATH = BASE_DIR / "items.json"
STATIC_DIR = BASE_DIR / "static"

# Load localized nature items
with open(ITEMS_PATH, "r", encoding="utf-8") as f:
    ALL_ITEMS: List[Dict[str, Any]] = json.load(f)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Precompute text embeddings at startup so inference on CPU is instant
    precompute_item_embeddings(ALL_ITEMS)
    yield


app = FastAPI(
    title="Touch Grass Bingo",
    description="Nature bingo card game powered by OpenCLIP zero-shot verification",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static assets
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/healthz", tags=["Health"])
async def healthz():
    """Health check endpoint for Render deployment and uptime monitors."""
    return {
        "status": "healthy",
        "service": "touch-grass-bingo",
        "model": MODEL_NAME,
        "items_loaded": len(ALL_ITEMS),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    """Direct favicon handler for browser requests."""
    return FileResponse(str(STATIC_DIR / "favicon.ico"))


@app.get("/manifest.json", include_in_schema=False)
async def manifest():
    """Direct manifest handler for PWA installation."""
    return FileResponse(str(STATIC_DIR / "manifest.json"))


@app.get("/", tags=["UI"])
async def root():
    """Serve the single-page application."""
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/api/card", tags=["Game"])
async def get_card():
    """
    Generate today's 3x3 (9 items) nature bingo card.
    Uses Sri Lanka date (UTC+5:30) as a deterministic random seed so all players
    see the same daily card on a given day without needing a database.
    """
    # Sri Lanka timezone (UTC+5:30)
    sl_timezone = timezone(timedelta(hours=5, minutes=30))
    seed_str = datetime.now(sl_timezone).strftime("%Y%m%d")

    # Use isolated Random instance to avoid mutating global random state
    rng = random.Random(seed_str)
    daily_items = rng.sample(ALL_ITEMS, 9)

    # Expose only UI fields (names and IDs); keep AI prompts and distractors server-side
    ui_items = [
        {"id": item["id"], "name_en": item["name_en"], "name_si": item["name_si"]}
        for item in daily_items
    ]

    return {"date": seed_str, "items": ui_items}


@app.post("/api/verify", tags=["Inference"])
async def verify(item_id: str = Form(...), file: UploadFile = File(...)):
    """
    Zero-shot verification of user photo against target item prompt.
    Evaluates in-memory and returns match result. Photos are never stored on disk.
    """
    item = next((i for i in ALL_ITEMS if str(i["id"]) == str(item_id)), None)
    if not item:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"match": False, "confidence": 0.0, "error": f"Item ID '{item_id}' not found."},
        )

    # Validate image input
    if not file.content_type or not file.content_type.startswith("image/"):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"match": False, "confidence": 0.0, "error": "Uploaded file must be a valid image."},
        )

    image_bytes = await file.read()
    if not image_bytes:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"match": False, "confidence": 0.0, "error": "Image file is empty."},
        )

    # Fast in-memory verification using precomputed embeddings
    result = verify_image(
        image_bytes=image_bytes,
        item_id=item["id"],
        target_prompt=item["prompt"],
        distractors=item.get("distractors", []),
        threshold=item.get("threshold", 0.5),
    )

    if result.get("error"):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=result,
        )

    return result