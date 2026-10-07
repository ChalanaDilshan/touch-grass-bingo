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
let activeSwapItem = null;
let activeSwapIndex = null;
let availableSwapItems = [];

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

function soundSwap() {
    playTone(587.33, 'triangle', 0.12, 0);
    playTone(880, 'triangle', 0.2, 0.08);
}

// Storage helpers
function getSavedCardItems(date) {
    try {
        const raw = localStorage.getItem(`bingoCardItems_${date}`);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveCardItems(date, items) {
    localStorage.setItem(`bingoCardItems_${date}`, JSON.stringify(items));
}
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
    updateHomeViewUI();
}

function saveCompleted(items, photos) {
    localStorage.setItem('completedItems', JSON.stringify(items));
    if (photos) {
        localStorage.setItem('cardPhotos', JSON.stringify(photos));
    }
}

// ─── VIEW ROUTING CONTROLLER (HOME VS GAME) ───
let currentView = 'home';

function switchView(viewName, updateHistory = true) {
    currentView = (viewName === 'game') ? 'game' : 'home';

    const homeView = document.getElementById('home-view');
    const gameView = document.getElementById('game-view');
    const navHomeBtn = document.getElementById('nav-home-btn');
    const navPlayBtn = document.getElementById('nav-play-btn');

    if (currentView === 'game') {
        if (homeView) homeView.classList.add('hidden');
        if (gameView) gameView.classList.remove('hidden');
        if (navHomeBtn) navHomeBtn.classList.remove('active');
        if (navPlayBtn) navPlayBtn.classList.add('active');
        if (updateHistory && window.location.hash !== '#play') {
            window.location.hash = 'play';
        }
    } else {
        if (homeView) homeView.classList.remove('hidden');
        if (gameView) gameView.classList.add('hidden');
        if (navHomeBtn) navHomeBtn.classList.add('active');
        if (navPlayBtn) navPlayBtn.classList.remove('active');
        if (updateHistory && window.location.hash !== '#home' && window.location.hash !== '') {
            window.location.hash = 'home';
        }
        updateHomeViewUI();
    }

    // Ensure user starts at top of the switched view
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupRouting() {
    const hash = (window.location.hash || '').toLowerCase();
    if (hash === '#play' || hash === '#game') {
        switchView('game', false);
    } else {
        switchView('home', false);
    }

    window.addEventListener('hashchange', () => {
        const h = (window.location.hash || '').toLowerCase();
        if (h === '#play' || h === '#game') {
            switchView('game', false);
        } else {
            switchView('home', false);
        }
    });
}

function updateHomeViewUI() {
    // 1. Streak & Bingos
    const streak = getSavedStreak();
    const streakEl = document.getElementById('home-streak-count');
    if (streakEl) streakEl.textContent = streak;

    const bingosEl = document.getElementById('home-bingos-count');
    if (bingosEl) {
        bingosEl.textContent = `${completedLinesCount} ${completedLinesCount === 1 ? 'Bingo' : 'Bingos'}`;
    }

    // 2. Date display
    const dateEl = document.getElementById('home-date-display');
    if (dateEl && currentCardData && currentCardData.date) {
        let formatted = currentCardData.date;
        if (formatted.length === 8) {
            const y = formatted.slice(0, 4);
            const m = formatted.slice(4, 6);
            const d = formatted.slice(6, 8);
            const dateObj = new Date(`${y}-${m}-${d}`);
            formatted = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        }
        dateEl.textContent = `📅 ${formatted}`;
    }

    // 3. Completed items & progress
    const completed = getSavedCompleted();
    const count = completed.length;
    const percent = Math.round((count / 9) * 100);

    const progressFill = document.getElementById('home-progress-fill');
    if (progressFill) progressFill.style.width = `${percent}%`;

    const progressCounter = document.getElementById('home-progress-counter');
    if (progressCounter) {
        progressCounter.textContent = `${count} of 9 items found (${percent}%)`;
    }

    // 4. Hero Visual Floating Live Tip
    const heroTipEl = document.getElementById('hero-floating-tip-text');
    if (heroTipEl) {
        if (count === 9) {
            heroTipEl.textContent = "All 9 items verified! You're today's Garden Master 🏆";
        } else if (count > 0) {
            heroTipEl.textContent = `${count} of 9 items found — ${9 - count} discoveries left outside!`;
        } else {
            heroTipEl.textContent = "9 nature discoveries waiting outside right now";
        }
    }

    // 5. Status Title & Subtitle & CTA Button
    const titleEl = document.getElementById('home-status-title');
    const subtitleEl = document.getElementById('home-status-subtitle');
    const btnTextEl = document.getElementById('home-play-btn-text');
    const navBadgeEl = document.getElementById('nav-badge-progress');

    if (navBadgeEl) {
        if (count > 0) {
            navBadgeEl.textContent = `${count}/9`;
            navBadgeEl.classList.remove('hidden');
        } else {
            navBadgeEl.classList.add('hidden');
        }
    }

    if (count === 9) {
        if (titleEl) titleEl.textContent = "🏆 Garden Master Achieved!";
        if (subtitleEl) subtitleEl.textContent = "Incredible job! You found all 9 items and completed today's nature card.";
        if (btnTextEl) btnTextEl.textContent = "View Completed Board";
    } else if (count > 0) {
        if (titleEl) titleEl.textContent = `Active Walk: ${count} of 9 Items Found!`;
        if (subtitleEl) subtitleEl.textContent = `You're on your way to a Bingo! ${9 - count} nature items left to spot today.`;
        if (btnTextEl) btnTextEl.textContent = "Resume Bingo Walk";
    } else {
        if (titleEl) titleEl.textContent = "Today's Nature Board is Ready!";
        if (subtitleEl) subtitleEl.textContent = "9 exciting nature items are waiting to be spotted in your garden or neighborhood.";
        if (btnTextEl) btnTextEl.textContent = "Start Today's Bingo Walk";
    }

    // 6. Render sneak peek chips of today's items
    const chipsContainer = document.getElementById('home-items-preview');
    if (chipsContainer && currentCardData && currentCardData.items) {
        chipsContainer.innerHTML = '';
        currentCardData.items.forEach(item => {
            const isDone = completed.includes(String(item.id));
            const chip = document.createElement('span');
            chip.className = `preview-chip ${isDone ? 'done' : ''}`;
            const name = (currentLangMode === 'si') ? item.name_si : item.name_en;
            chip.innerHTML = `${isDone ? '✓' : '🍃'} ${escapeHtml(name)}`;
            chip.title = isDone ? 'Verified! Tap to view on board' : 'Tap to focus on board';
            chip.style.cursor = 'pointer';
            chip.addEventListener('click', () => {
                soundTap();
                switchView('game');
                setTimeout(() => {
                    const targetTile = document.getElementById(`tile-${item.id}`);
                    if (targetTile) {
                        targetTile.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        targetTile.classList.add('tile-pulse-highlight');
                        setTimeout(() => targetTile.classList.remove('tile-pulse-highlight'), 1600);
                    }
                }, 120);
            });
            chipsContainer.appendChild(chip);
        });
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    updateSoundButtonUI();
    updateStreakUI();
    setupRouting();
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

    // Feedback modal "Can't find? Swap" button
    const cantFindModalBtn = document.getElementById('modal-cannot-find-btn');
    if (cantFindModalBtn) {
        cantFindModalBtn.addEventListener('click', () => {
            closeFeedbackModal();
            if (currentItemId && currentCardData && currentCardData.items) {
                const idx = currentCardData.items.findIndex(i => String(i.id) === String(currentItemId));
                if (idx !== -1) {
                    const item = currentCardData.items[idx];
                    openSwapModal(item, idx);
                }
            }
        });
    }

    // Swap modal controls
    const closeSwapBtn = document.getElementById('close-swap-modal-btn');
    if (closeSwapBtn) closeSwapBtn.addEventListener('click', closeSwapModal);

    const cancelSwapBtn = document.getElementById('cancel-swap-btn');
    if (cancelSwapBtn) cancelSwapBtn.addEventListener('click', closeSwapModal);

    const randomSwapBtn = document.getElementById('swap-random-btn');
    if (randomSwapBtn) randomSwapBtn.addEventListener('click', handleRandomSwap);

    const searchInput = document.getElementById('swap-search-input');
    if (searchInput) searchInput.addEventListener('input', handleSwapSearch);

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

    // Navigation & Home View Event Listeners
    const navHomeBtn = document.getElementById('nav-home-btn');
    if (navHomeBtn) {
        navHomeBtn.addEventListener('click', () => {
            soundTap();
            switchView('home');
        });
    }

    const navPlayBtn = document.getElementById('nav-play-btn');
    if (navPlayBtn) {
        navPlayBtn.addEventListener('click', () => {
            soundTap();
            switchView('game');
        });
    }

    const brandHomeLink = document.getElementById('brand-home-link');
    if (brandHomeLink) {
        brandHomeLink.addEventListener('click', () => {
            soundTap();
            switchView('home');
        });
        brandHomeLink.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                soundTap();
                switchView('home');
            }
        });
    }

    const homePlayBtn = document.getElementById('home-play-btn');
    if (homePlayBtn) {
        homePlayBtn.addEventListener('click', () => {
            soundTap();
            switchView('game');
        });
    }

    const homeBottomPlayBtn = document.getElementById('home-bottom-play-btn');
    if (homeBottomPlayBtn) {
        homeBottomPlayBtn.addEventListener('click', () => {
            soundTap();
            switchView('game');
        });
    }

    const footerHomeBtn = document.getElementById('footer-home-btn');
    if (footerHomeBtn) {
        footerHomeBtn.addEventListener('click', () => {
            soundTap();
            switchView('home');
        });
    }

    const footerPlayBtn = document.getElementById('footer-play-btn');
    if (footerPlayBtn) {
        footerPlayBtn.addEventListener('click', () => {
            soundTap();
            switchView('game');
        });
    }

    // Home screen interactive stat buttons
    const homeStreakBtn = document.getElementById('home-streak-btn');
    if (homeStreakBtn) {
        homeStreakBtn.addEventListener('click', () => {
            soundTap();
            const streak = getSavedStreak();
            showToast(`🔥 ${streak}-day outdoor streak! Step outside daily to keep your streak glowing!`);
        });
    }

    const homeBingosBtn = document.getElementById('home-bingos-btn');
    if (homeBingosBtn) {
        homeBingosBtn.addEventListener('click', () => {
            soundTap();
            if (completedLinesCount > 0) {
                showToast(`🏆 ${completedLinesCount} ${completedLinesCount === 1 ? 'Bingo' : 'Bingos'} completed today! Great job!`);
            } else {
                showToast("🎯 No Bingos yet today! Connect 3 nature finds in a row on the card to win!");
            }
        });
    }
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

        // Synchronize date and reset progress if new calendar day
        const savedDate = localStorage.getItem('bingoDate');
        if (savedDate !== data.date) {
            localStorage.setItem('bingoDate', data.date);
            localStorage.setItem('completedItems', JSON.stringify([]));
            localStorage.setItem('cardPhotos', JSON.stringify({}));
            saveCardItems(data.date, data.items);
            currentCardData = data;
        } else {
            const savedItems = getSavedCardItems(data.date);
            if (savedItems && Array.isArray(savedItems) && savedItems.length === 9) {
                currentCardData = { date: data.date, items: savedItems };
            } else {
                saveCardItems(data.date, data.items);
                currentCardData = data;
            }
        }

        // Format date display
        renderHeaderMeta(currentCardData.date);
        renderGrid(currentCardData.items);

        loadingState.classList.add('hidden');
        gridContainer.classList.remove('hidden');
        checkBingoLines(false); // initial count without triggering fanfare
        updateHomeViewUI();
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

        const swapBtnHtml = !isDone ? `
            <button class="tile-swap-btn" type="button" data-index="${index}" title="Can't find? Swap for another item" aria-label="Can't find ${escapeHtml(primaryName)}? Swap item">
                <span class="swap-icon">🔄</span>
                <span class="swap-label-full">Can't find?</span>
                <span class="swap-label-short">Swap</span>
            </button>
        ` : `<span class="tile-leaf-icon">🌿</span>`;

        tile.innerHTML = `
            ${thumbHtml}
            ${badgeHtml}
            <div class="tile-top">
                <span class="tile-num-tag">#${index + 1}</span>
                ${swapBtnHtml}
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

        // Swap button click handler
        const swapBtn = tile.querySelector('.tile-swap-btn');
        if (swapBtn) {
            swapBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                soundTap();
                openSwapModal(item, index);
            });
        }

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
    const progressText = document.getElementById('progress-text');
    if (progressText) progressText.textContent = `${count} of 9 items found (${percent}%)`;

    updateHomeViewUI();
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

    const cantFindBtn = document.getElementById('modal-cannot-find-btn');

    if (success) {
        badge.textContent = "VERIFIED MATCH";
        badge.className = "result-badge badge-success";
        icon.textContent = "🌿";
        retryBtn.classList.add('hidden');
        if (cantFindBtn) cantFindBtn.classList.add('hidden');
    } else {
        badge.textContent = "AI FEEDBACK";
        badge.className = "result-badge badge-error";
        icon.textContent = "🔍";
        retryBtn.classList.remove('hidden');
        if (cantFindBtn) cantFindBtn.classList.remove('hidden');
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

// Cannot Find / Swap Modal Controllers
async function openSwapModal(item, index) {
    if (!item) return;
    activeSwapItem = item;
    activeSwapIndex = index;

    const modal = document.getElementById('swap-modal');
    const targetNameEl = document.getElementById('swap-target-name');
    const titleEl = document.getElementById('swap-modal-title');
    const searchInput = document.getElementById('swap-search-input');
    const listEl = document.getElementById('swap-items-list');
    const loadingEl = document.getElementById('swap-list-loading');

    const primaryName = currentLangMode === 'si' ? item.name_si : item.name_en;
    const subName = currentLangMode === 'si' ? item.name_en : item.name_si;
    if (targetNameEl) {
        targetNameEl.textContent = `${primaryName}${subName ? ` (${subName})` : ''}`;
    }

    if (titleEl) {
        titleEl.textContent = currentLangMode === 'si'
            ? `"${primaryName}" හොයාගන්න අමාරුද?`
            : `Can't Find "${primaryName}"?`;
    }

    if (searchInput) {
        searchInput.value = '';
    }

    modal.classList.remove('hidden');

    // Fetch available items not currently on card
    if (listEl) listEl.innerHTML = '';
    if (loadingEl) loadingEl.classList.remove('hidden');

    const currentIds = (currentCardData?.items || []).map(i => String(i.id)).join(',');

    try {
        const response = await fetch(`/api/card/available?current_ids=${encodeURIComponent(currentIds)}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        availableSwapItems = data.items || [];
        renderAvailableItemsList(availableSwapItems);
    } catch (err) {
        console.error("Failed to fetch available items", err);
        if (listEl) {
            listEl.innerHTML = `<div class="swap-no-results">Could not load nature items list. You can still use the Random Replacement button above!</div>`;
        }
    } finally {
        if (loadingEl) loadingEl.classList.add('hidden');
    }
}

function closeSwapModal() {
    const modal = document.getElementById('swap-modal');
    if (modal) modal.classList.add('hidden');
    activeSwapItem = null;
    activeSwapIndex = null;
}

function renderAvailableItemsList(items) {
    const listEl = document.getElementById('swap-items-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!items || items.length === 0) {
        listEl.innerHTML = `<div class="swap-no-results">No matching nature items found in list.</div>`;
        return;
    }

    items.forEach(targetItem => {
        const card = document.createElement('div');
        card.className = 'swap-item-card';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');

        const primaryName = (currentLangMode === 'si') ? targetItem.name_si : targetItem.name_en;
        const subName = (currentLangMode === 'si') ? targetItem.name_en : targetItem.name_si;

        card.innerHTML = `
            <div class="swap-item-info">
                <div class="swap-item-primary">🍃 ${escapeHtml(primaryName)}</div>
                ${subName && currentLangMode !== 'en-only' ? `<div class="swap-item-sub">${escapeHtml(subName)}</div>` : ''}
            </div>
            <div class="swap-item-action-badge">
                <span>Select</span>
                <span>→</span>
            </div>
        `;

        const doSelect = () => {
            soundTap();
            handleTargetSwap(targetItem);
        };

        card.addEventListener('click', doSelect);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                doSelect();
            }
        });

        listEl.appendChild(card);
    });
}

function handleSwapSearch(e) {
    const query = (e.target.value || '').trim().toLowerCase();
    if (!query) {
        renderAvailableItemsList(availableSwapItems);
        return;
    }

    const filtered = availableSwapItems.filter(item => {
        const en = (item.name_en || '').toLowerCase();
        const si = (item.name_si || '').toLowerCase();
        return en.includes(query) || si.includes(query);
    });

    renderAvailableItemsList(filtered);
}

async function handleRandomSwap() {
    if (!activeSwapItem || activeSwapIndex === null) return;
    soundTap();

    const currentIds = (currentCardData?.items || []).map(i => String(i.id));
    const randomBtn = document.getElementById('swap-random-btn');
    if (randomBtn) {
        randomBtn.disabled = true;
        randomBtn.textContent = "Selecting… ⏳";
    }

    try {
        const response = await fetch('/api/card/swap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                replace_id: String(activeSwapItem.id),
                current_ids: currentIds
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Server responded with ${response.status}`);
        }

        const data = await response.json();
        if (data.replacement) {
            applyItemSwap(data.replacement);
        }
    } catch (err) {
        console.error("Failed to swap item randomly", err);
        showToast(`Could not swap item: ${err.message}`);
    } finally {
        if (randomBtn) {
            randomBtn.disabled = false;
            randomBtn.innerHTML = `<span class="btn-icon">🎲</span><span>Get Random Replacement</span>`;
        }
    }
}

async function handleTargetSwap(targetItem) {
    if (!activeSwapItem || activeSwapIndex === null || !targetItem) return;

    const currentIds = (currentCardData?.items || []).map(i => String(i.id));

    try {
        const response = await fetch('/api/card/swap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                replace_id: String(activeSwapItem.id),
                current_ids: currentIds,
                target_id: String(targetItem.id)
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Server responded with ${response.status}`);
        }

        const data = await response.json();
        if (data.replacement) {
            applyItemSwap(data.replacement);
        }
    } catch (err) {
        console.error("Failed to swap with selected item", err);
        showToast(`Could not swap item: ${err.message}`);
    }
}

function applyItemSwap(newItem) {
    if (!currentCardData || !currentCardData.items || activeSwapIndex === null) return;

    const oldItem = currentCardData.items[activeSwapIndex];
    currentCardData.items[activeSwapIndex] = newItem;

    // Save customized card items
    saveCardItems(currentCardData.date, currentCardData.items);

    // Re-render grid
    renderGrid(currentCardData.items);

    // Audio & celebratory visual feedback
    soundSwap();

    const newTile = document.getElementById(`tile-${newItem.id}`);
    if (newTile) {
        newTile.classList.add('tile-swapped');
        setTimeout(() => {
            newTile.classList.remove('tile-swapped');
        }, 800);
    }

    const oldName = currentLangMode === 'si' ? oldItem.name_si : oldItem.name_en;
    const newName = currentLangMode === 'si' ? newItem.name_si : newItem.name_en;
    showToast(`🔄 Replaced "${oldName}" with "${newName}"!`);

    closeSwapModal();
    updateProgressUI();
    checkBingoLines(false);
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