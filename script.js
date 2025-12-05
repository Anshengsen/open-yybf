/**
 * G.A.T. PLAYER v2.2 (Final Polished)
 * Features: 
 * - Auto Cyber-Gradient generation for missing covers
 * - Blob based image decoding (High Performance)
 * - 3 Visualizer Modes
 * - High DPI Canvas support
 */

const state = {
    files: [],
    playlist: [], 
    currentIndex: -1,
    audioCtx: null,
    analyser: null,
    source: null,
    isPlaying: false,
    gainNode: null,
    visualizerMode: 0, // 0: Bars, 1: Mirror, 2: Scope
    modes: ['BARS', 'MIRROR', 'SCOPE'],
    animationId: null
};

// DOM Elements
const elements = {
    audio: new Audio(),
    fileInput: document.getElementById('folder-input'),
    playlistContainer: document.getElementById('playlist-container'),
    trackCount: document.getElementById('track-count'),
    visualizer: document.getElementById('visualizer'),
    canvasCtx: document.getElementById('visualizer').getContext('2d'),
    visModeBtn: document.getElementById('vis-mode-btn'),
    btnPlay: document.getElementById('btn-play'),
    btnPrev: document.getElementById('btn-prev'),
    btnNext: document.getElementById('btn-next'),
    seekBar: document.getElementById('seek-bar'),
    seekFill: document.getElementById('seek-fill'),
    volBar: document.getElementById('volume-bar'),
    timeCurrent: document.getElementById('time-current'),
    timeTotal: document.getElementById('time-total'),
    titleDisplay: document.getElementById('current-title'),
    artistDisplay: document.getElementById('current-artist')
};

// --- Theme Manager ---
const savedTheme = localStorage.getItem('gat_theme');
if(savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const theme = e.target.dataset.setTheme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('gat_theme', theme);
        if(state.isPlaying) visualize(); 
    });
});

// --- Audio Engine ---
function initAudioEngine() {
    if (!state.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        state.audioCtx = new AudioContext();
        state.analyser = state.audioCtx.createAnalyser();
        state.analyser.fftSize = 512; 
        state.gainNode = state.audioCtx.createGain();
        
        state.source = state.audioCtx.createMediaElementSource(elements.audio);
        state.source.connect(state.analyser);
        state.analyser.connect(state.gainNode);
        state.gainNode.connect(state.audioCtx.destination);
        
        const savedVol = localStorage.getItem('gat_volume');
        if (savedVol) {
            elements.volBar.value = savedVol;
            state.gainNode.gain.value = savedVol * savedVol;
        }
        visualize();
    }
}

// --- File Ingestion ---
elements.fileInput.addEventListener('change', async (e) => {
    initAudioEngine();
    const rawFiles = Array.from(e.target.files).filter(f => 
        f.name.match(/\.(mp3|wav|ogg|flac|m4a)$/i)
    );

    if (rawFiles.length === 0) return;

    state.files = rawFiles;
    state.playlist = []; 
    elements.playlistContainer.innerHTML = ''; 
    elements.trackCount.textContent = `(${state.files.length})`;

    processFilesChunked(rawFiles, 0);
});

function processFilesChunked(files, index) {
    if (index >= files.length) return;

    const chunkSize = 5; 
    const limit = Math.min(index + chunkSize, files.length);

    for (let i = index; i < limit; i++) {
        const file = files[i];
        
        // 初始元数据
        const trackData = {
            index: i,
            file: file,
            title: file.name,
            artist: 'Unknown Unit',
            cover: null
        };

        // 立即创建卡片（显示默认生成的渐变背景）
        const card = createCard(trackData);
        elements.playlistContainer.appendChild(card);
        state.playlist.push(trackData);

        // 尝试读取 ID3 标签
        if(typeof jsmediatags !== 'undefined') {
            new jsmediatags.Reader(file)
                .setTagsToRead(["title", "artist", "picture"])
                .read({
                    onSuccess: (tag) => {
                        const tags = tag.tags;
                        if (tags.title) trackData.title = tags.title;
                        if (tags.artist) trackData.artist = tags.artist;
                        if (tags.picture) {
                            try {
                                const { data, format } = tags.picture;
                                let byteArray = new Uint8Array(data);
                                let blob = new Blob([byteArray], { type: format });
                                trackData.cover = URL.createObjectURL(blob);
                            } catch (err) {
                                console.warn("Cover decode failed:", err);
                            }
                        }
                        // 更新界面（如果有封面，会覆盖掉默认渐变）
                        updateCard(trackData);
                    },
                    onError: (error) => {
                        // console.log('No tags found for:', file.name);
                    }
                });
        }
    }

    if (limit < files.length) {
        requestAnimationFrame(() => processFilesChunked(files, limit));
    }
}

// --- UI Generation (Enhanced) ---
function createCard(track) {
    const div = document.createElement('div');
    div.className = 'track-card';
    div.id = `card-${track.index}`;
    div.onclick = () => playTrack(track.index);
    
    // 核心新增：生成确定性的随机赛博渐变色（基于索引）
    // 这样即使没有封面，每首歌看起来也不一样
    const hue1 = (track.index * 137) % 360; // 伪随机色相
    const hue2 = (hue1 + 40) % 360;
    const placeholderStyle = `background: linear-gradient(135deg, hsl(${hue1}, 60%, 20%), hsl(${hue2}, 70%, 10%));`;

    div.innerHTML = `
        <div class="card-art" id="art-${track.index}" style="${placeholderStyle}">
            <span style="opacity:0.5; font-size:1.5rem; text-shadow:0 0 10px rgba(255,255,255,0.5);">♪</span>
        </div>
        <div class="card-title" id="title-${track.index}">${track.title}</div>
        <div class="card-artist" id="artist-${track.index}">${track.artist}</div>
    `;
    return div;
}

function updateCard(track) {
    const titleEl = document.getElementById(`title-${track.index}`);
    const artistEl = document.getElementById(`artist-${track.index}`);
    const artEl = document.getElementById(`art-${track.index}`);

    if(titleEl) titleEl.textContent = track.title;
    if(artistEl) artistEl.textContent = track.artist;
    
    // 只有当真的读取到了图片时，才替换掉默认的渐变背景
    if(artEl && track.cover) {
        artEl.innerHTML = `<img src="${track.cover}" alt="Cover" style="width:100%;height:100%;object-fit:cover;display:block;">`;
        // 清除之前的背景样式，防止透出
        artEl.style.background = 'none';
        artEl.style.border = 'none';
    }
}

// --- Playback Control ---
function playTrack(index) {
    if (index < 0 || index >= state.playlist.length) return;

    state.currentIndex = index;
    const track = state.playlist[index];
    
    document.querySelectorAll('.track-card').forEach(c => c.classList.remove('active'));
    document.getElementById(`card-${index}`).classList.add('active');

    elements.titleDisplay.textContent = track.title;
    elements.artistDisplay.textContent = track.artist;

    elements.audio.src = URL.createObjectURL(track.file);
    
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
        state.audioCtx.resume();
    }

    elements.audio.play()
        .then(() => {
            state.isPlaying = true;
            updatePlayButton();
        })
        .catch(err => console.error("Playback failed:", err));
}

function togglePlay() {
    if (state.files.length === 0) return;
    
    if (elements.audio.paused) {
        if (state.currentIndex === -1) playTrack(0);
        else elements.audio.play();
        state.isPlaying = true;
    } else {
        elements.audio.pause();
        state.isPlaying = false;
    }
    updatePlayButton();
}

function updatePlayButton() {
    elements.btnPlay.textContent = state.isPlaying ? "||" : "| |";
}

// --- Visualizer Engine (High DPI) ---
elements.visModeBtn.addEventListener('click', () => {
    state.visualizerMode = (state.visualizerMode + 1) % state.modes.length;
    elements.visModeBtn.textContent = `[ MODE: ${state.modes[state.visualizerMode]} ]`;
});

function getThemeColors() {
    const style = getComputedStyle(document.documentElement);
    return {
        primary: style.getPropertyValue('--primary').trim(),
        secondary: style.getPropertyValue('--secondary').trim() || '#005544'
    };
}

function visualize() {
    if (!state.analyser) return;
    
    const canvas = elements.visualizer;
    const ctx = elements.canvasCtx;
    const bufferLength = state.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    function draw() {
        if(!state.isPlaying && !state.audioCtx) return;
        state.animationId = requestAnimationFrame(draw);
        
        ctx.clearRect(0, 0, rect.width, rect.height);
        
        const colors = getThemeColors();
        
        if (state.visualizerMode === 0) { // BARS
            state.analyser.getByteFrequencyData(dataArray);
            const barWidth = (rect.width / bufferLength) * 2.5;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * rect.height;
                const gradient = ctx.createLinearGradient(0, rect.height - barHeight, 0, rect.height);
                gradient.addColorStop(0, colors.primary);
                gradient.addColorStop(1, 'transparent');
                ctx.fillStyle = gradient;
                ctx.fillRect(x, rect.height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }
        } 
        else if (state.visualizerMode === 1) { // MIRROR
            state.analyser.getByteFrequencyData(dataArray);
            const barWidth = (rect.width / bufferLength) * 4;
            const cy = rect.height / 2;
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 255;
                const h = v * cy * 0.8;
                ctx.fillStyle = colors.primary;
                ctx.globalAlpha = 0.6;
                const x = (rect.width / 2) + (i * (barWidth/2));
                const x2 = (rect.width / 2) - (i * (barWidth/2));
                ctx.fillRect(x, cy - h, 2, h * 2);
                ctx.fillRect(x2, cy - h, 2, h * 2);
            }
            ctx.globalAlpha = 1.0;
        } 
        else if (state.visualizerMode === 2) { // SCOPE
            state.analyser.getByteTimeDomainData(dataArray);
            ctx.lineWidth = 2;
            ctx.strokeStyle = colors.primary;
            ctx.shadowBlur = 8;
            ctx.shadowColor = colors.primary;
            ctx.beginPath();
            const sliceWidth = rect.width * 1.0 / bufferLength;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * (rect.height / 2);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                x += sliceWidth;
            }
            ctx.lineTo(rect.width, rect.height / 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }
    
    if (state.animationId) cancelAnimationFrame(state.animationId);
    draw();
}

// --- Listeners ---
elements.btnPlay.addEventListener('click', togglePlay);
elements.btnPrev.addEventListener('click', () => playTrack(state.currentIndex - 1));
elements.btnNext.addEventListener('click', () => playTrack(state.currentIndex + 1));

elements.audio.addEventListener('ended', () => {
    if (state.currentIndex < state.playlist.length - 1) {
        playTrack(state.currentIndex + 1);
    }
});

elements.audio.addEventListener('timeupdate', () => {
    if (!isNaN(elements.audio.duration)) {
        const pct = (elements.audio.currentTime / elements.audio.duration) * 100;
        elements.seekBar.value = pct;
        if(elements.seekFill) elements.seekFill.style.width = pct + "%";
        elements.timeCurrent.textContent = formatTime(elements.audio.currentTime);
        elements.timeTotal.textContent = formatTime(elements.audio.duration);
    }
});

elements.seekBar.addEventListener('input', (e) => {
    const time = (e.target.value / 100) * elements.audio.duration;
    elements.audio.currentTime = time;
});

elements.volBar.addEventListener('input', (e) => {
    const val = e.target.value;
    if(state.gainNode) state.gainNode.gain.value = val * val; 
    localStorage.setItem('gat_volume', val);
});

function formatTime(s) {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
    }
});