/**
 * TOUCH GRASS BINGO — CORE FRONTEND CONTROLLER
 * Zero heavy frameworks. Pure vanilla JS, Web Audio API, Canvas compression, and HTML5 camera.
 */

// State
let currentCardData = null;
let currentItemId = null;
let currentTileElement = null;
let tempThumbnailDataUrl = null;
let soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
let completedLinesCount = 0;

// Winning lines on a 3x3 grid (indices 0 to 8)
const WINNING_LINES = [
    [0, 1, 2], // Row 1
    [3, 4, 5], // Row 2
    [6, 7, 8], // Row 3
    [0, 3, 6], // Col 1
    [1, 4, 7], // Col 2
    [2, 5, 8], // Col 3
    [0, 4, 8], // Diagonal 1
    [2, 4, 6]  // Diagonal 2
];

// Audio Synthesizer using Web Audio API (Zero external audio files needed)
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function playTone(freq, type, duration, delay = 0) {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        setTimeout(() => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration);
        }, delay * 1000);
    } catch (e) {
        console.warn("Audio playback not supported", e);
    }
}

function soundTap() {
    playTone(520, 'sine', 0.08);
}

function soundSuccess() {
    playTone(523.25, 'triangle', 0.15, 0);      // C5
    playTone(659.25, 'triangle', 0.18, 0.1);    // E5
    playTone(783.99, 'triangle', 0.3, 0.2);     // G5
    playTone(1046.50, 'triangle', 0.45, 0.3);   // C6
}

function soundBingo() {
    // Joyful major fanfaric chime
    [440, 554, 659, 880, 1108].forEach((f, idx) => {
        playTone(f, 'sine', 0.25, idx * 0.09);
    });
}

function soundFail() {
    playTone(280, 'sawtooth', 0.2, 0);
    playTone(220, 'sawtooth', 0.3, 0.15);
}

// Storage helpers
function getSavedCompleted() {
    try {
        return JSON.parse(localStorage.getItem('completedItems') || '[]');
    } catch {
        return [];
    }
}

function getSavedPhotos() {
    try {
        return JSON.parse(localStorage.getItem('cardPhotos') || '{}');
    } catch {
        return {};
    }
}

// Streak tracking helpers
function getSavedStreak() {
    return parseInt(localStorage.getItem('bingoStreak') || '1', 10);
}

function updateStreakUI() {
    const streakEl = document.getElementById('streak-count');
    if (streakEl) {
        streakEl.textContent = getSavedStreak();
    }
}

function recordDailyActivity(todayStr) {
    if (!todayStr) return;
    const lastActive = localStorage.getItem('lastActiveDate');
    let streak = getSavedStreak();

    if (lastActive === todayStr) {
        return;
    }

    if (lastActive) {
        const parseDate = (s) => new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
        const diffMs = parseDate(todayStr) - parseDate(lastActive);
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
            streak += 1;
        } else if (diffDays > 1) {
            streak = 1;
        }
    } else {
        streak = 1;
    }

    localStorage.setItem('bingoStreak', String(streak));
    localStorage.setItem('lastActiveDate', todayStr);
    updateStreakUI();
}

// Language Mode: 'en' (English primary), 'en-only' (English only), 'si' (Sinhala primary)
let currentLangMode = localStorage.getItem('langMode') || 'en';

function applyLanguageMode(mode) {
    currentLangMode = mode;
    localStorage.setItem('langMode', mode);
    const langLabel = document.getElementById('lang-label');
    if (langLabel) {
        if (mode === 'en') langLabel.textContent = 'EN';
        else if (mode === 'en-only') langLabel.textContent = 'EN ONLY';
        else langLabel.textContent = 'සිං';
    }

    const appWrapper = document.querySelector('.app-wrapper');
    if (appWrapper) {
        appWrapper.classList.toggle('lang-en-only', mode === 'en-only');
    }

    if (currentCardData && currentCardData.items) {
        renderGrid(currentCardData.items);
    }
}

function saveCompleted(items, photos) {
    localStorage.setItem('completedItems', JSON.stringify(items));
    if (photos) {
        localStorage.setItem('cardPhotos', JSON.stringify(photos));
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    updateSoundButtonUI();
    updateStreakUI();
    applyLanguageMode(currentLangMode);
    setupEventListeners();
    loadDailyCard();
}

function setupEventListeners() {
    // Language toggle
    const langBtn = document.getElementById('lang-toggle-btn');
    if (langBtn) {
        langBtn.addEventListener('click', () => {
            soundTap();
            if (currentLangMode === 'en') {
                applyLanguageMode('en-only');
                showToast("Language: English Only 🇬🇧");
            } else if (currentLangMode === 'en-only') {
                applyLanguageMode('si');
                showToast("Language: Sinhala Primary 🇱🇰");
            } else {
                applyLanguageMode('en');
                showToast("Language: English Primary 🌿");
            }
        });
    }

    // Streak button
    const streakBtn = document.getElementById('streak-pill-btn');
    if (streakBtn) {
        streakBtn.addEventListener('click', () => {
            const streak = getSavedStreak();
            showToast(`🔥 ${streak}-day outdoor streak! Step outside daily to keep your fire glowing!`);
        });
    }

    // Sound toggle
    document.getElementById('sound-toggle-btn').addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        localStorage.setItem('soundEnabled', soundEnabled);
        updateSoundButtonUI();
        if (soundEnabled) soundTap();
    });

    // Share progress
    document.getElementById('share-card-btn').addEventListener('click', () => {
        openShareModal();
    });

    // Native Share / Copy text buttons in modal
    document.getElementById('native-share-btn').addEventListener('click', handleNativeShare);
    document.getElementById('copy-text-btn').addEventListener('click', copyShareText);
    document.getElementById('close-share-modal-btn').addEventListener('click', () => {
        document.getElementById('share-modal').classList.add('hidden');
    });

    // Feedback modal buttons
    document.getElementById('close-modal-btn').addEventListener('click', closeFeedbackModal);
    document.getElementById('modal-ok-btn').addEventListener('click', closeFeedbackModal);
    document.getElementById('modal-retry-camera-btn').addEventListener('click', () => {
        closeFeedbackModal();
        if (currentItemId && currentTileElement) {
            triggerCamera(currentItemId, currentTileElement);
        }
    });

    // Full Win modal buttons
    document.getElementById('win-close-btn').addEventListener('click', () => {
        document.getElementById('win-modal').classList.add('hidden');
    });
    document.getElementById('win-share-btn').addEventListener('click', () => {
        document.getElementById('win-modal').classList.add('hidden');
        openShareModal();
    });

    // Retry button on error card
    document.getElementById('retry-btn').addEventListener('click', loadDailyCard);

    // Camera input change event
    document.getElementById('camera-input').addEventListener('change', handleCameraFile);
}

function updateSoundButtonUI() {
    const icon = document.getElementById('sound-icon');
    icon.textContent = soundEnabled ? '🔊' : '🔇';
}

// Fetch Card from Backend
async function loadDailyCard() {
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const gridContainer = document.getElementById('grid-container');

    loadingState.classList.remove('hidden');
    errorState.classList.add('hidden');
    gridContainer.classList.add('hidden');

    try {
        const response = await fetch('/api/card');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        currentCardData = data;

        // Synchronize date and reset progress if new calendar day
        const savedDate = localStorage.getItem('bingoDate');
        if (savedDate !== data.date) {
            localStorage.setItem('bingoDate', data.date);
            localStorage.setItem('completedItems', JSON.stringify([]));
            localStorage.setItem('cardPhotos', JSON.stringify({}));
        }

        // Format date display
        renderHeaderMeta(data.date);
        renderGrid(data.items);

        loadingState.classList.add('hidden');
        gridContainer.classList.remove('hidden');
        checkBingoLines(false); // initial count without triggering fanfare
    } catch (err) {
        console.error("Failed to load daily card", err);
        loadingState.classList.add('hidden');
        errorState.classList.remove('hidden');
        document.getElementById('error-message').textContent =
            "Could not connect to the Touch Grass server. Please verify your connection and try again.";
    }
}

function renderHeaderMeta(dateStr) {
    // Convert YYYYMMDD to human readable string
    let formatted = dateStr;
    if (dateStr && dateStr.length === 8) {
        const y = dateStr.slice(0, 4);
        const m = dateStr.slice(4, 6);
        const d = dateStr.slice(6, 8);
        const dateObj = new Date(`${y}-${m}-${d}`);
        formatted = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }
    document.getElementById('date-display').textContent = `📅 ${formatted}`;
}

// Render the 3x3 Bingo Grid
function renderGrid(items) {
    const grid = document.getElementById('bingo-grid');
    grid.innerHTML = '';

    const completed = getSavedCompleted();
    const photos = getSavedPhotos();

    items.forEach((item, index) => {
        const isDone = completed.includes(String(item.id));
        const photoThumb = photos[String(item.id)];

        const tile = document.createElement('div');
        tile.className = `card-tile ${isDone ? 'completed' : ''}`;
        tile.id = `tile-${item.id}`;
        tile.setAttribute('role', 'gridcell');

        const primaryName = (currentLangMode === 'si') ? item.name_si : item.name_en;
        const subName = (currentLangMode === 'si') ? item.name_en : item.name_si;
        const primaryClass = (currentLangMode === 'si') ? 'card-si card-primary' : 'card-en card-primary';
        const subClass = (currentLangMode === 'si') ? 'card-en card-sub' : 'card-si card-sub';

        tile.setAttribute('aria-label', `${primaryName} (${subName})`);

        // Optional photo thumbnail background on completed tiles
        const thumbHtml = (isDone && photoThumb)
            ? `<img src="${photoThumb}" class="tile-thumbnail-bg" alt="Photo of ${item.name_en}" />`
            : '';

        const badgeHtml = isDone ? `<div class="completed-badge-icon" title="Verified">✓</div>` : '';

        tile.innerHTML = `
            ${thumbHtml}
            ${badgeHtml}
            <div class="tile-top">
                <span class="tile-num-tag">#${index + 1}</span>
                <span class="tile-leaf-icon">${isDone ? '🌿' : '🍃'}</span>
            </div>
            <div class="tile-body">
                <div class="${primaryClass}">${escapeHtml(primaryName)}</div>
                <div class="${subClass}">${escapeHtml(subName)}</div>
            </div>
            <button class="tile-scan-btn" aria-label="${isDone ? 'Already found' : 'Tap to scan with camera'}">
                <span class="scan-btn-inner">
                    <span class="scan-btn-icon">${isDone ? '🌿' : '📷'}</span>
                    <span class="scan-label-full">${isDone ? 'Found ✓' : 'Tap to scan'}</span>
                    <span class="scan-label-short">${isDone ? 'Done ✓' : 'Scan'}</span>
                </span>
                <span class="scan-btn-arrow">›</span>
            </button>
        `;

        tile.addEventListener('click', () => {
            soundTap();
            if (isDone) {
                showToast(`Already verified: ${primaryName} ✅`);
            } else {
                triggerCamera(item.id, tile);
            }
        });

        grid.appendChild(tile);
    });

    updateProgressUI();
}

function updateProgressUI() {
    const completed = getSavedCompleted();
    const count = completed.length;
    const percent = Math.round((count / 9) * 100);

    // The fill div is nested inside the progress-bar-track element
    const fillEl = document.querySelector('.progress-bar-fill');
    if (fillEl) fillEl.style.width = `${percent}%`;
    document.getElementById('progress-text').textContent = `${count} of 9 items found (${percent}%)`;
}

// Camera Trigger
function triggerCamera(itemId, tileElement) {
    currentItemId = String(itemId);
    currentTileElement = tileElement;
    tempThumbnailDataUrl = null;

    const input = document.getElementById('camera-input');
    input.value = ''; // Reset input to allow selecting same file
    input.click();
}

// Client-Side Canvas Image Processing & Downscaling
function handleCameraFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (currentTileElement) {
        currentTileElement.classList.add('verifying');
    }
    showToast("Analyzing photo with OpenCLIP... ⏳");

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            // 1. Generate compressed JPEG for zero-shot upload (max 512px)
            const MAX_UPLOAD = 512;
            let w = img.width;
            let h = img.height;

            if (w > h && w > MAX_UPLOAD) {
                h = Math.round(h * (MAX_UPLOAD / w));
                w = MAX_UPLOAD;
            } else if (h > MAX_UPLOAD) {
                w = Math.round(w * (MAX_UPLOAD / h));
                h = MAX_UPLOAD;
            }

            const canvas = document.getElementById('resize-canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);

            // 2. Generate small thumbnail (160px) for tile display
            const THUMB_SIZE = 160;
            let tw = img.width;
            let th = img.height;
            if (tw > th) {
                th = Math.round(th * (THUMB_SIZE / tw));
                tw = THUMB_SIZE;
            } else {
                tw = Math.round(tw * (THUMB_SIZE / th));
                th = THUMB_SIZE;
            }
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = tw;
            thumbCanvas.height = th;
            const thumbCtx = thumbCanvas.getContext('2d');
            thumbCtx.drawImage(img, 0, 0, tw, th);
            tempThumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.75);

            // Convert canvas to blob and upload
            canvas.toBlob((blob) => {
                if (blob) {
                    verifyWithServer(blob);
                } else {
                    handleVerificationError("Failed to compress image.");
                }
            }, 'image/jpeg', 0.82);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// Send Image to Verification Endpoint
async function verifyWithServer(blob) {
    const formData = new FormData();
    formData.append('file', blob, 'nature_photo.jpg');
    formData.append('item_id', currentItemId);

    try {
        const response = await fetch('/api/verify', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Server responded with ${response.status}`);
        }

        const result = await response.json();
        handleVerificationResult(result);
    } catch (err) {
        console.error("Verification API failure", err);
        handleVerificationError(err.message || "Could not reach server.");
    } finally {
        if (currentTileElement) {
            currentTileElement.classList.remove('verifying');
        }
    }
}

// Handle Verification Response
function handleVerificationResult(result) {
    const targetItem = currentCardData?.items?.find(i => String(i.id) === String(currentItemId));
    const itemName = targetItem
        ? (currentLangMode === 'si' ? `${targetItem.name_si} (${targetItem.name_en})` : `${targetItem.name_en} (${targetItem.name_si})`)
        : 'Target Item';

    if (result.match) {
        soundSuccess();
        triggerConfetti(35);

        // Update local completed cache
        const completed = getSavedCompleted();
        if (!completed.includes(currentItemId)) {
            completed.push(currentItemId);
        }
        const photos = getSavedPhotos();
        if (tempThumbnailDataUrl) {
            photos[currentItemId] = tempThumbnailDataUrl;
        }
        saveCompleted(completed, photos);

        // Record daily activity for streak
        if (currentCardData && currentCardData.date) {
            recordDailyActivity(currentCardData.date);
        }

        // Update tile UI
        markTileCompleted(currentItemId, tempThumbnailDataUrl);
        document.getElementById('win-bingo-count').textContent = completedLinesCount;
        updateProgressUI();
        showToast(`Matched! ✅ ${itemName} verified!`);

        // Check for Bingo lines & full board completion
        const hadNewLines = checkBingoLines(true);

        // If completed all 9 items, celebrate grand win
        if (completed.length === 9) {
            setTimeout(() => {
                soundBingo();
                triggerConfetti(100);
                document.getElementById('win-modal').classList.remove('hidden');
            }, 600);
        } else if (!hadNewLines) {
            // Show brief congratulatory feedback modal
            showFeedbackModal({
                success: true,
                title: "Item Verified! 🌿",
                desc: `Awesome discovery! Your photo was verified as ${itemName}.`,
                confidence: result.confidence,
                tip: "Keep touching grass! Look for the next item on your card."
            });
        }
    } else {
        soundFail();
        // Friendly Explainable AI Failure
        let distractorText = "";
        if (result.top_match) {
            distractorText = `OpenCLIP detected: "${result.top_match}".`;
        }
        showFeedbackModal({
            success: false,
            title: "Not Quite a Match ❌",
            desc: `Your photo did not match "${itemName}".`,
            confidence: result.confidence || 0,
            tip: `${distractorText} Tip: Try moving closer, getting better natural lighting, or framing only the item.`
        });
    }
}

function markTileCompleted(itemId, thumbUrl) {
    const tile = document.getElementById(`tile-${itemId}`);
    if (!tile) return;

    tile.classList.add('completed');

    // Add thumbnail background
    if (thumbUrl && !tile.querySelector('.tile-thumbnail-bg')) {
        const img = document.createElement('img');
        img.src = thumbUrl;
        img.className = 'tile-thumbnail-bg';
        img.alt = 'Verified Photo';
        tile.insertBefore(img, tile.firstChild);
    }

    // Add checkmark badge
    if (!tile.querySelector('.completed-badge-icon')) {
        const badge = document.createElement('div');
        badge.className = 'completed-badge-icon';
        badge.textContent = '✓';
        tile.insertBefore(badge, tile.firstChild);
    }

    // Update leaf icon
    const leafIcon = tile.querySelector('.tile-leaf-icon');
    if (leafIcon) leafIcon.textContent = '🌿';

    // Update scan button text
    const scanBtn = tile.querySelector('.tile-scan-btn');
    if (scanBtn) {
        const inner = scanBtn.querySelector('.scan-btn-inner');
        if (inner) inner.innerHTML = '<span class="scan-btn-icon">🌿</span><span class="scan-label-full">Found ✓</span><span class="scan-label-short">Done ✓</span>';
    }
}

function handleVerificationError(errMsg) {
    soundFail();
    showToast(`Verification error: ${errMsg}`);
}

// Bingo 3-in-a-row Line Detection
function checkBingoLines(triggerAnnouncement = true) {
    if (!currentCardData || !currentCardData.items) return false;

    const completed = getSavedCompleted();
    const itemIds = currentCardData.items.map(i => String(i.id));

    let activeBingoLines = 0;
    const winningTileIndices = new Set();

    WINNING_LINES.forEach(line => {
        const isLineComplete = line.every(idx => {
            const id = itemIds[idx];
            return completed.includes(id);
        });

        if (isLineComplete) {
            activeBingoLines++;
            line.forEach(idx => winningTileIndices.add(idx));
        }
    });

    // Highlight tiles in winning lines
    itemIds.forEach((id, idx) => {
        const tile = document.getElementById(`tile-${id}`);
        if (tile) {
            if (winningTileIndices.has(idx)) {
                tile.classList.add('in-bingo-line');
            } else {
                tile.classList.remove('in-bingo-line');
            }
        }
    });

    // Update Bingo Line Counter
    document.getElementById('bingo-lines-count').textContent =
        `${activeBingoLines} ${activeBingoLines === 1 ? 'Bingo' : 'Bingos'}`;

    let isNewBingo = false;
    if (activeBingoLines > completedLinesCount) {
        isNewBingo = true;
        completedLinesCount = activeBingoLines;

        if (triggerAnnouncement) {
            soundBingo();
            triggerConfetti(60);
            showBingoBanner(activeBingoLines);
        }
    } else {
        completedLinesCount = activeBingoLines;
    }

    return isNewBingo;
}

function showBingoBanner(count) {
    const banner = document.getElementById('bingo-banner');
    document.getElementById('banner-title').textContent =
        `🎉 BINGO! (${count} ${count === 1 ? 'Line' : 'Lines'} Complete!)`;
    banner.classList.remove('hidden');

    setTimeout(() => {
        banner.classList.add('hidden');
    }, 5000);
}

// Modal Controllers
function showFeedbackModal({ success, title, desc, confidence, tip }) {
    const modal = document.getElementById('feedback-modal');
    const badge = document.getElementById('feedback-badge');
    const icon = document.getElementById('feedback-icon');
    const retryBtn = document.getElementById('modal-retry-camera-btn');

    document.getElementById('feedback-title').textContent = title;
    document.getElementById('feedback-desc').textContent = desc;

    if (success) {
        badge.textContent = "VERIFIED MATCH";
        badge.className = "result-badge badge-success";
        icon.textContent = "🌿";
        retryBtn.classList.add('hidden');
    } else {
        badge.textContent = "AI FEEDBACK";
        badge.className = "result-badge badge-error";
        icon.textContent = "🔍";
        retryBtn.classList.remove('hidden');
    }

    // Confidence breakdown
    const confSection = document.getElementById('confidence-section');
    const percent = Math.min(100, Math.max(0, Math.round((confidence || 0) * 100)));
    document.getElementById('target-percent-text').textContent = `${percent}%`;
    document.getElementById('target-meter-fill').style.width = `${percent}%`;
    document.getElementById('ai-distractor-tip').textContent = tip || "";
    confSection.classList.remove('hidden');

    modal.classList.remove('hidden');
}

function closeFeedbackModal() {
    document.getElementById('feedback-modal').classList.add('hidden');
}

// Share Modal & Formatter
function openShareModal() {
    if (!currentCardData) return;

    const completed = getSavedCompleted();
    const itemIds = currentCardData.items.map(i => String(i.id));

    // Construct 3x3 emoji grid
    let emojiGrid = "";
    for (let r = 0; r < 3; r++) {
        let rowEmojis = [];
        for (let c = 0; c < 3; c++) {
            const idx = r * 3 + c;
            rowEmojis.push(completed.includes(itemIds[idx]) ? "🟩" : "⬜");
        }
        emojiGrid += rowEmojis.join(" ") + "\n";
    }

    const shareText = `🌿 Touch Grass Bingo (${currentCardData.date})\n${emojiGrid}Score: ${completed.length}/9 items | ${completedLinesCount} Bingos\nStep outside and explore: ${window.location.origin}\n#TouchGrass #Hacktoberfest`;

    document.getElementById('share-text-preview').textContent = shareText;
    document.getElementById('share-modal').classList.remove('hidden');
}

async function handleNativeShare() {
    const text = document.getElementById('share-text-preview').textContent;
    if (navigator.share) {
        try {
            await navigator.share({
                title: "Touch Grass Bingo",
                text: text,
                url: window.location.origin
            });
            document.getElementById('share-modal').classList.add('hidden');
            return;
        } catch (e) {
            if (e.name !== 'AbortError') copyShareText();
        }
    } else {
        copyShareText();
    }
}

function copyShareText() {
    const text = document.getElementById('share-text-preview').textContent;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast("Copied card summary to clipboard! 📋");
            document.getElementById('share-modal').classList.add('hidden');
        }).catch(() => {
            showToast("Unable to copy to clipboard.");
        });
    }
}

// Toast notification
let toastTimer = null;
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.add('hidden');
    }, 3500);
}

// Lightweight Pure Vanilla JS Canvas Confetti Engine
function triggerConfetti(particleCount = 50) {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#52b788', '#74c69d', '#b7e4c7', '#f4a261', '#e76f51', '#ffffff'];
    const particles = [];

    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: canvas.width / 2 + (Math.random() - 0.5) * 200,
            y: canvas.height * 0.4 + (Math.random() - 0.5) * 100,
            vx: (Math.random() - 0.5) * 14,
            vy: (Math.random() - 0.5) * 14 - 3,
            size: Math.random() * 8 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotSpeed: (Math.random() - 0.5) * 10,
            opacity: 1
        });
    }

    let animationFrame = null;
    const startTime = Date.now();

    function render() {
        const elapsed = Date.now() - startTime;
        if (elapsed > 2800) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            cancelAnimationFrame(animationFrame);
            return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.35; // gravity
            p.vx *= 0.98; // air drag
            p.rotation += p.rotSpeed;
            p.opacity = Math.max(0, 1 - (elapsed / 2800));

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.opacity;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            ctx.restore();
        });

        animationFrame = requestAnimationFrame(render);
    }

    render();
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}