<h1 align="center">🌿 Touch Grass Bingo</h1>

<p align="center">
  <b>A mobile-first daily nature bingo card powered by open-weight AI vision.</b><br>
  Step outside, photograph real-world Sri Lankan flora & fauna, and let AI verify your finds.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Built%20For-Hacktoberfest%202026-orange?style=flat-square" alt="Hacktoberfest 2026" />
  <img src="https://img.shields.io/badge/Hosted%20on-Render-46E3B7?style=flat-square&logo=render" alt="Render" />
  <img src="https://img.shields.io/badge/AI-OpenCLIP%20ViT--B--32-brightgreen?style=flat-square" alt="OpenCLIP" />
  <img src="https://img.shields.io/badge/CPU--Only-No%20GPU%20Needed-blue?style=flat-square" alt="CPU Only" />
  <img src="https://img.shields.io/badge/Privacy-No%20Photos%20Stored-green?style=flat-square" alt="Privacy First" />
</p>

---

##  What is it?

**Touch Grass Bingo** is a gamified nature walk app that generates a fresh **3×3 bingo card** every day filled with **Sri Lankan outdoor nature items** — coconut trees, ant trails, spider webs, jackfruit leaves, and more.

Tap any tile → snap a photo with your phone camera → an open-weight vision AI (**OpenCLIP ViT-B-32**) verifies your photo in real time using **zero-shot classification** (no training, no fine-tuning needed).

Complete 3 in a row to score a **BINGO** 🎉, and fill the full card to become a **Garden Master** 🏆.

---

##  Features

| Feature | Detail |
|---|---|
| 🌿 **Daily Nature Card** | Fresh 9-item card every day, seeded by date (all players share the same card) |
| 🤖 **AI Verification** | OpenCLIP ViT-B-32 zero-shot classification on CPU — no GPU needed |
| 📷 **Camera Integration** | HTML5 `capture="environment"` triggers phone camera directly |
| 📦 **Client-side Compression** | Canvas scales images to 512px before upload — saves RAM & bandwidth |
| 🔒 **Privacy First** | Photos are verified in-memory and **never saved on the server** |
| 🏆 **Bingo Line Detection** | Rows, columns, and diagonals tracked with win detection |
| 📤 **Share Your Walk** | Web Share API with emoji grid card for social sharing |
| 🌏 **Sri Lanka Localized** | Items in both **Sinhala** (සිංහල) and English |
| 🔊 **Web Audio Chimes** | Synthesized sound feedback via Web Audio API — zero external files |
| 📴 **Progress Persisted** | Progress saved in `localStorage` and resets automatically at midnight (SL time) |

---

##  Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Browser (Mobile)                │
│  ┌──────────────────────────────────────────────┐   │
│  │  index.html + styles.css + app.js (Vanilla)  │   │
│  │  Canvas compression → 512px JPEG upload      │   │
│  │  localStorage for progress (privacy-first)   │   │
│  └─────────────────┬────────────────────────────┘   │
└────────────────────│────────────────────────────────┘
                     │ POST /api/verify  GET /api/card
┌────────────────────▼────────────────────────────────┐
│              FastAPI (Uvicorn, 1 worker)             │
│  ┌───────────────────────────────────────────────┐  │
│  │  OpenCLIP ViT-B-32 (CPU-only, laion2b)        │  │
│  │  Pre-computed text embeddings at startup       │  │
│  │  Zero-shot image × text cosine similarity     │  │
│  └───────────────────────────────────────────────┘  │
│              Deployed on Render (Docker)             │
└─────────────────────────────────────────────────────┘
```

### Key Technical Decisions

- **ViT-B-32 over larger models** — Fits within Render Starter's ~512MB RAM limit on CPU.
- **Pre-computed text embeddings** — All 25 item prompts + distractors are embedded once at startup. Each request only encodes the image and runs a dot product, cutting per-request CPU time by ~40%.
- **EXIF orientation correction** — `PIL.ImageOps.exif_transpose()` prevents mobile portrait photos from being analyzed sideways.
- **Isolated `random.Random(seed)`** — Prevents daily card seeding from mutating Python's global random state (thread-safe).
- **Sri Lanka timezone seeding** — Card resets at midnight `UTC+5:30` so users in Sri Lanka always get today's card.

---

##  Repository Structure

```
TouchGrass/
├── app/
│   ├── static/
│   │   ├── index.html       # Mobile-first single-page app (PWA ready)
│   │   ├── styles.css       # Light botanical nature design system
│   │   ├── app.js           # Vanilla JS: camera, canvas, bingo logic, streak, audio, confetti
│   │   ├── sw.js            # Service worker for offline shell caching
│   │   ├── manifest.json    # Web App Manifest for mobile home-screen install
│   │   ├── icon-192.png     # PWA icon 192x192
│   │   ├── icon-512.png     # PWA icon 512x512
│   │   └── screenshot.png   # Social / OpenGraph preview banner
│   ├── items.json           # 25 localized items (Sinhala + English, prompts, distractors)
│   ├── main.py              # FastAPI: /api/card, /api/verify, /healthz, /manifest.json
│   └── model.py             # OpenCLIP loader + precompute + zero-shot verify_image()
├── evaluation/
│   ├── eval.py              # Zero-shot accuracy & latency CPU benchmark suite
│   └── benchmark_summary.md # Measured benchmark report
├── tests/
│   └── test_api.py          # pytest unit tests (6 tests, all passing)
├── Dockerfile               # CPU-only PyTorch, model weights baked in at build time
├── render.yaml              # Render Blueprint: 1-click deploy config
├── requirements.txt         # Dependencies (no CUDA wheels)
├── pytest.ini               # Test config
└── README.md
```

---

##  Performance & Accuracy Benchmark

Evaluated using `python -m evaluation.eval` on standard low-memory CPU hardware:

| Item # | Nature Target | Avg CPU Latency | Verification Status |
|---|---|---|---|
| #1 | **Red Blossom (රතු මල)** | 104.8 ms | Verified |
| #2 | **Coconut Palm (පොල් ගස)** | 93.5 ms | Verified |
| #3 | **Fern Leaf (මීවන පත්‍රය)** | 83.0 ms | Verified |
| #5 | **Banana Tree (කෙසෙල් ගස)** | 95.4 ms | Verified |
| #7 | **Stream / Water (දිය පහර)** | 80.5 ms | Verified |
| #10 | **Tree Bark (ගස් පොත්ත)** | 80.8 ms | Verified |
| **Overall** | **Benchmark Average** | **89.7 ms** | **100% Deterministic** |

> **Key Takeaway:** With all 25 text embeddings precomputed at startup, live image verification runs in **under 90ms on standard CPU**, eliminating the need for expensive GPU hosting.

---

##  Running Locally

### Prerequisites
- Python 3.10+
- ~2GB disk (for OpenCLIP model weights, downloaded once automatically)

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/touch-grass-bingo.git
cd touch-grass-bingo

# 2. Create a virtual environment
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# 3. Install CPU-only PyTorch first (avoids downloading 2GB+ CUDA wheels)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

# 4. Install remaining dependencies
pip install -r requirements.txt

# 5. Start the server
uvicorn app.main:app --host 127.0.0.1 --port 8000

# 6. Open http://127.0.0.1:8000 in your browser
```

> **Note:** The first startup downloads OpenCLIP weights (~350MB). Subsequent startups are fast.

---

##  Running Tests

```bash
pip install pytest httpx
pytest -v tests/
```

Tests cover: health check endpoint, card generation (9 items, deterministic seed, no leaked prompts), invalid file handling (wrong MIME type, empty file, missing item), and end-to-end zero-shot inference.

---

##  Docker

```bash
# Build (downloads model weights into the image at build time)
docker build -t touch-grass-bingo .

# Run
docker run -p 10000:10000 touch-grass-bingo
```

---

##  Deploy to Render

This repo includes a [`render.yaml`](render.yaml) Render Blueprint for **1-click deployment**.

1. Fork / push this repo to GitHub
2. Go to [render.com](https://render.com) → **New → Blueprint**
3. Connect your GitHub repo
4. Render reads `render.yaml` automatically and creates the service
5. First build takes ~5–8 minutes (downloads & bakes model weights)
6. Your app is live! 🎉

**Render config highlights:**
- Runtime: Docker
- Region: Singapore (closest to Sri Lanka)
- Health check: `GET /healthz`
- Workers: 1 (memory-optimized for Starter plan)

---

##  How the AI Works

Touch Grass Bingo uses **zero-shot image classification** with [OpenCLIP](https://github.com/mlfoundations/open_clip).

For each item, the app defines a **target prompt** and a list of **negative distractor prompts**:

```json
{
  "name_en": "Moss on a Rock",
  "prompt": "a photo of green moss growing on a hard rock surface outdoors",
  "distractors": ["green grass", "a green leaf", "green paint on a wall"],
  "threshold": 0.5
}
```

When you upload a photo:
1. The image is encoded to a feature vector by OpenCLIP's vision transformer.
2. Pre-computed text feature vectors for the target + distractors are retrieved from the startup cache.
3. Cosine similarities are computed and normalized via softmax.
4. ✅ **Match** if the target prompt has the **highest probability** AND exceeds its **confidence threshold**.

---

##  Nature Items (25 total)

Daily cards are randomly sampled from 25 Sri Lankan nature items including:
Red Flower • Moss on a Rock • Tree Bark • Puddle • Ant Trail • Yellow Leaf •
Jackfruit Leaf • Coconut Tree • Bird • Pebbles • Butterfly • Cloudy Sky •
Snail • Spider Web • Mushroom • Banana Tree • Fern Plant • Dew Drop •
Red Chilli • Snail Shell • Millipede • Earthworm • Dandelion Fluff •
Wild Berries • Stray Dog

---

##  Privacy

- Photos are processed **entirely in server memory** and discarded immediately after verification.
- No photos are ever written to disk or stored in any database.
- No user accounts, no tracking, no analytics.
- Progress is stored only in your **browser's localStorage**.

---

##  License

MIT License. See [LICENSE](LICENSE) for details.

---

<p align="center">
  Made with 🌿 for <b>DEV.to Hacktoberfest 2026 - Open-Source AI Challenge, Week 1: Touch Grass</b>
</p>
