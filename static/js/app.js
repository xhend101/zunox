// ==============================
// ZUNOX — App Logic
// ==============================

// State
let currentMode = 'simple';       // 'simple' | 'custom'
let currentType = 'instrumental'; // 'instrumental' | 'vocal'
let currentGender = 'm';
let currentModel = 'V5_5';
let apiKeys = [];
let tracks = [];
let pollingIntervals = {};
let currentSongIndex = 0;
let currentPlaylist = [];
let isPlaying = false;

// ==============================
// INIT
// ==============================

document.addEventListener('DOMContentLoaded', () => {
  selectModel('V5_5');
  loadApiKeys();
  loadTracks();
  loadPresets();
  setupCharCounters();
  setInterval(refreshPendingTracks, 10000);
});

function setupCharCounters() {
  const simplePrompt = document.getElementById('simple-prompt');
  const lyricsArea = document.getElementById('custom-lyrics');

  simplePrompt?.addEventListener('input', () => {
    document.getElementById('simple-prompt-count').textContent = simplePrompt.value.length;
  });

  lyricsArea?.addEventListener('input', () => {
    document.getElementById('lyrics-count').textContent = lyricsArea.value.length;
  });
}

// ==============================
// NAVIGATION
// ==============================

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.getElementById(`nav-${page}`)?.classList.add('active');

  if (page === 'library') renderLibrary();
  closeSidebar();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function closeSidebar() {
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

// ==============================
// MODE / TYPE / GENDER / MODEL
// ==============================

function setMode(mode) {
  currentMode = mode;
  document.getElementById('btn-simple').classList.toggle('active', mode === 'simple');
  document.getElementById('btn-custom').classList.toggle('active', mode === 'custom');
  document.getElementById('simple-fields').style.display = mode === 'simple' ? 'block' : 'none';
  document.getElementById('custom-fields').style.display = mode === 'custom' ? 'block' : 'none';
  updateVocalFields();
}

function setType(type) {
  currentType = type;
  document.getElementById('btn-instrumental').classList.toggle('active', type === 'instrumental');
  document.getElementById('btn-vocal').classList.toggle('active', type === 'vocal');
  updateVocalFields();
}

function setGender(gender) {
  currentGender = gender;
  document.getElementById('btn-male').classList.toggle('active', gender === 'm');
  document.getElementById('btn-female').classList.toggle('active', gender === 'f');
}

function updateVocalFields() {
  const isVocal = currentType === 'vocal';
  const isCustom = currentMode === 'custom';

  document.getElementById('vocal-gender-section').style.display = isVocal ? 'flex' : 'none';
  document.getElementById('vocal-gender-section').style.flexDirection = 'column';

  if (isCustom) {
    document.getElementById('lyrics-section').style.display = isVocal ? 'block' : 'none';
  }
}

function selectModel(model) {
  currentModel = model;
  document.querySelectorAll('.model-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`model-${model}`)?.classList.add('active');
}

function addStyle(style) {
  const input = document.getElementById('custom-style');
  const current = input.value.trim();
  if (!current) {
    input.value = style;
  } else if (!current.toLowerCase().includes(style.toLowerCase())) {
    input.value = current + ', ' + style;
  }
  input.focus();
}

function toggleAdvanced() {
  const content = document.getElementById('advanced-content');
  const arrow = document.getElementById('advanced-arrow');
  const isOpen = content.style.display !== 'none';
  content.style.display = isOpen ? 'none' : 'block';
  arrow.classList.toggle('open', !isOpen);
}

// ==============================
// API KEYS
// ==============================

async function loadApiKeys() {
  try {
    const stored = localStorage.getItem('zunox_api_keys');
    apiKeys = stored ? JSON.parse(stored) : [];
    updateApiKeySelect();
    updateApiStatus();

    // Prefill settings textarea
    document.getElementById('api-keys-input').value = apiKeys.join('\n');
  } catch (e) {
    console.error('Failed to load API keys:', e);
    apiKeys = [];
  }
}

function updateApiKeySelect() {
  const select = document.getElementById('api-key-select');
  select.innerHTML = '<option value="">— Select API Key —</option>';
  apiKeys.forEach((key, i) => {
    const masked = key.length > 8 ? key.slice(0, 6) + '...' + key.slice(-4) : '****';
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `Key ${i + 1}: ${masked}`;
    select.appendChild(opt);
  });
  if (apiKeys.length > 0) select.value = apiKeys[0];
}

function updateApiStatus() {
  const dot = document.querySelector('.status-dot');
  const text = document.getElementById('api-status-text');
  if (apiKeys.length > 0) {
    dot.classList.add('online');
    text.textContent = `${apiKeys.length} key${apiKeys.length > 1 ? 's' : ''} configured`;
  } else {
    dot.classList.remove('online');
    text.textContent = 'No API Key';
  }
}

async function saveApiKeys() {
  const raw = document.getElementById('api-keys-input').value;
  try {
    const keys = raw.split('\n').map(k => k.trim()).filter(k => k);
    const uniqueKeys = [...new Set(keys)];
    localStorage.setItem('zunox_api_keys', JSON.stringify(uniqueKeys));
    showToast(`✅ Saved ${uniqueKeys.length} API key${uniqueKeys.length !== 1 ? 's' : ''}`, 'success');
    await loadApiKeys();
  } catch (e) {
    showToast('❌ Failed to save keys', 'error');
  }
}

async function checkAllCredits() {
  if (apiKeys.length === 0) {
    showToast('⚠️ No API keys to check. Save keys first.', 'error');
    return;
  }
  showToast('🔍 Checking credits...', 'info');

  try {
    const res = await fetch('/api/keys/check-credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: apiKeys })
    });
    const data = await res.json();

    const resultsDiv = document.getElementById('credits-results');
    const listDiv = document.getElementById('credits-list');
    resultsDiv.style.display = 'block';
    listDiv.innerHTML = '';

    data.results.forEach(item => {
      const el = document.createElement('div');
      el.className = `credit-item${item.removed ? ' credit-removed' : ''}`;
      const masked = item.key.length > 8 ? item.key.slice(0, 6) + '...' + item.key.slice(-6) : item.key;

      let amountHtml;
      if (item.status === 'error') {
        amountHtml = `<span class="credit-amount error">❌ ${item.msg}</span>`;
      } else if (item.removed) {
        amountHtml = `<span class="credit-amount low">${item.credits} credits <span class="removed-label">removed</span></span>`;
      } else {
        amountHtml = `<span class="credit-amount">${item.credits} credits ✓</span>`;
      }

      el.innerHTML = `<span class="credit-key">${masked}</span>${amountHtml}`;
      listDiv.appendChild(el);
    });

    if (data.removed > 0) {
      const validKeys = data.results.filter(r => !r.removed).map(r => r.key);
      localStorage.setItem('zunox_api_keys', JSON.stringify(validKeys));
      await loadApiKeys();
      showToast(`⚠️ ${data.removed} key${data.removed > 1 ? 's' : ''} removed (< ${data.min_credits} credits). ${data.remaining} key${data.remaining !== 1 ? 's' : ''} remaining.`, 'info');
    } else {
      showToast(`✅ All ${data.remaining} key${data.remaining !== 1 ? 's' : ''} have sufficient credits.`, 'success');
    }
  } catch (e) {
    showToast('❌ Failed to check credits', 'error');
  }
}

// ==============================
// GENERATE MUSIC
// ==============================

async function generateMusic() {
  const selectedKey = document.getElementById('api-key-select').value;
  const apiKey = selectedKey || (apiKeys.length > 0 ? apiKeys[0] : null);

  if (!apiKey) {
    showToast('⚠️ Please add an API key in Settings first.', 'error');
    showPage('settings');
    return;
  }

  const loopCount = parseInt(document.getElementById('loop-count')?.value) || 1;
  
  // Build payload template
  const basePayload = {
    apiKey,
    customMode: currentMode === 'custom',
    instrumental: currentType === 'instrumental',
    model: currentModel,
  };

  if (currentMode === 'simple') {
    const prompt = document.getElementById('simple-prompt').value.trim();
    if (!prompt) { showToast('⚠️ Please enter a description.', 'error'); return; }
    basePayload.prompt = prompt;
  } else {
    const title = document.getElementById('custom-title').value.trim();
    const style = document.getElementById('custom-style').value.trim();
    if (!title) { showToast('⚠️ Please enter a song title.', 'error'); return; }
    if (!style) { showToast('⚠️ Please enter a style/genre.', 'error'); return; }
    
    basePayload.title = title;
    basePayload.style = style;

    if (currentType === 'vocal') {
      const lyrics = document.getElementById('custom-lyrics').value.trim();
      if (!lyrics) { showToast('⚠️ Please enter lyrics for vocal mode.', 'error'); return; }
      basePayload.lyrics = lyrics;
      basePayload.vocalGender = currentGender;
    }
    
    const negativeTags = document.getElementById('negative-tags').value.trim();
    if (negativeTags) basePayload.negativeTags = negativeTags;

    const advContent = document.getElementById('advanced-content');
    if (advContent.style.display !== 'none') {
      basePayload.styleWeight = parseFloat(document.getElementById('style-weight').value);
      basePayload.weirdnessConstraint = parseFloat(document.getElementById('weirdness').value);
    }
  }

  setGenerateLoading(true);
  
  // Save preset before generating
  savePreset(basePayload);
  
  for (let i = 0; i < loopCount; i++) {
    try {
      if (i > 0) {
        showToast(`🔄 Loop ${i+1}/${loopCount} starting...`, 'info');
        await new Promise(r => setTimeout(r, 1000)); // Small delay between batch calls
      }
      
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(basePayload)
      });
      const data = await res.json();

      if (data.success && data.taskId) {
        if (i === 0) {
          showToast('🎵 Generation started!', 'success');
          showGenerationStatus(basePayload.title || basePayload.prompt || 'Track');
        }
        
        const entry = {
          taskId: data.taskId,
          title: data.title || basePayload.title || basePayload.prompt || 'Untitled',
          model: data.model || basePayload.model || 'V5_5',
          instrumental: data.instrumental !== undefined ? data.instrumental : basePayload.instrumental,
          style: data.style || basePayload.style || '',
          status: 'pending',
          songs: [],
          createdAt: Math.floor(Date.now() / 1000),
        };
        tracks.unshift(entry);
        saveTracks();
        renderRecentTracks();
        updateLibraryBadge();
        
        startPolling(data.taskId, apiKey);
      } else {
        showToast(`❌ ${data.error || 'Generation failed'}`, 'error');
        if (loopCount === 1) setGenerateLoading(false);
      }
    } catch (e) {
      showToast('❌ Network error.', 'error');
      if (loopCount === 1) setGenerateLoading(false);
    }
  }
  
  // Reload tracks to show new entries
  loadTracks();
}

function setGenerateLoading(loading) {
  const btn = document.getElementById('generate-btn');
  const text = document.getElementById('btn-text');
  btn.disabled = loading;
  text.textContent = loading ? 'Generating...' : 'Generate Music';
  if (loading) {
    btn.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px;margin-right:8px"></div><span>Generating...</span>`;
  } else {
    btn.innerHTML = `<span class="btn-icon">✨</span><span id="btn-text">Generate Music</span>`;
  }
}

// ==============================
// GENERATION STATUS UI
// ==============================

let progressInterval = null;
let progressVal = 0;

function showGenerationStatus(title) {
  const status = document.getElementById('generation-status');
  status.style.display = 'block';
  document.getElementById('status-title').textContent = `Generating: ${title}`;
  document.getElementById('status-sub').textContent = 'This may take 1–3 minutes';
  progressVal = 5;
  document.getElementById('progress-fill').style.width = '5%';

  // Reset stages
  ['stage-text', 'stage-first', 'stage-complete'].forEach(id => {
    document.getElementById(id).className = 'stage';
  });

  clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (progressVal < 90) {
      progressVal += Math.random() * 2;
      document.getElementById('progress-fill').style.width = Math.min(progressVal, 90) + '%';
    }
  }, 1500);
}

function updateGenerationStage(stage) {
  // Hide lyrics stage for instrumental
  const stageText = document.getElementById('stage-text');
  if (currentType === 'instrumental') {
    stageText.style.display = 'none';
  } else {
    stageText.style.display = 'block';
  }

  if (stage === 'text' && currentType !== 'instrumental') {
    stageText.className = 'stage active';
  } else if (stage === 'first') {
    if (currentType !== 'instrumental') stageText.className = 'stage done';
    document.getElementById('stage-first').className = 'stage active';
  } else if (stage === 'complete') {
    if (currentType !== 'instrumental') stageText.className = 'stage done';
    document.getElementById('stage-first').className = 'stage done';
    document.getElementById('stage-complete').className = 'stage done';
  }
}

function completeGenerationStatus() {
  clearInterval(progressInterval);
  document.getElementById('progress-fill').style.width = '100%';
  setTimeout(() => {
    document.getElementById('generation-status').style.display = 'none';
    document.getElementById('progress-fill').style.width = '0';
  }, 2000);
  setGenerateLoading(false);
}

// ==============================
// POLLING
// ==============================

function startPolling(taskId, apiKey) {
  if (pollingIntervals[taskId]) return;
  let attempts = 0;
  pollingIntervals[taskId] = setInterval(async () => {
    attempts++;
    if (attempts > 60) {
      clearInterval(pollingIntervals[taskId]);
      delete pollingIntervals[taskId];
      updateTrackInStorage(taskId, { status: 'error' });
      showToast('⏱ Generation is taking longer than expected. Check Library later.', 'info');
      setGenerateLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/track/${taskId}?apiKey=${encodeURIComponent(apiKey)}`);
      const data = await res.json();

      if (data.success && data.track) {
        const trackUpdates = data.track;
        updateTrackInStorage(taskId, {
          status: trackUpdates.status,
          songs: trackUpdates.songs || []
        });

        if (trackUpdates.status === 'complete' || trackUpdates.status === 'success') {
          clearInterval(pollingIntervals[taskId]);
          delete pollingIntervals[taskId];
          completeGenerationStatus();
          showToast('🎉 Music generated! Check your library.', 'success');
        } else if (trackUpdates.status === 'error') {
          clearInterval(pollingIntervals[taskId]);
          delete pollingIntervals[taskId];
          completeGenerationStatus();
          showToast('❌ Generation failed. Please try again.', 'error');
        } else if (trackUpdates.status) {
          updateGenerationStage(trackUpdates.status);
        }
      }
    } catch (e) {
      // ignore polling errors
    }
  }, 8000);
}

function updateTrackInStorage(taskId, updates) {
  const index = tracks.findIndex(t => t.taskId === taskId);
  if (index !== -1) {
    tracks[index] = { ...tracks[index], ...updates };
    saveTracks();
    renderRecentTracks();
    updateLibraryBadge();
    if (document.getElementById('page-library').style.display === 'block') {
      renderLibrary();
    }
  }
}

async function refreshPendingTracks() {
  const pending = tracks.filter(t => t.status === 'pending' || t.status === 'text' || t.status === 'first');
  if (pending.length === 0) return;
  const apiKey = document.getElementById('api-key-select').value || (apiKeys.length > 0 ? apiKeys[0] : null);
  if (!apiKey) return;
  
  for (const t of pending) {
    if (!pollingIntervals[t.taskId]) {
      startPolling(t.taskId, apiKey);
    }
  }
}

async function refreshAllTracks() {
  refreshPendingTracks();
  showToast('🔄 Library polling refreshed', 'info');
}

// ==============================
// TRACKS / LIBRARY
// ==============================

function loadTracks() {
  try {
    const stored = localStorage.getItem('zunox_tracks');
    tracks = stored ? JSON.parse(stored) : [];
    renderRecentTracks();
    updateLibraryBadge();
  } catch (e) {
    console.error('Failed to load tracks:', e);
    tracks = [];
  }
}

function saveTracks() {
  try {
    localStorage.setItem('zunox_tracks', JSON.stringify(tracks));
  } catch (e) {
    console.error('Failed to save tracks:', e);
  }
}

function updateLibraryBadge() {
  const badge = document.getElementById('library-badge');
  if (tracks.length > 0) {
    badge.textContent = tracks.length;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function renderRecentTracks() {
  const container = document.getElementById('recent-tracks');
  const empty = document.getElementById('empty-recent');
  const recent = tracks.slice(0, 5);

  if (recent.length === 0) {
    empty.style.display = 'block';
    container.querySelectorAll('.track-card').forEach(c => c.remove());
    return;
  }

  empty.style.display = 'none';
  container.querySelectorAll('.track-card').forEach(c => c.remove());

  recent.forEach(track => {
    const el = createTrackCard(track, false);
    container.appendChild(el);
  });
}

function renderLibrary() {
  const container = document.getElementById('library-tracks');
  const empty = document.getElementById('empty-library');
  const query = document.getElementById('library-search')?.value.toLowerCase() || '';

  const filtered = tracks.filter(t => {
    const name = (t.title || '').toLowerCase();
    const style = (t.style || '').toLowerCase();
    return !query || name.includes(query) || style.includes(query);
  });

  container.querySelectorAll('.track-card').forEach(c => c.remove());

  if (filtered.length === 0) {
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';

  filtered.forEach(track => {
    const el = createTrackCard(track, true);
    container.appendChild(el);
  });
}

function filterLibrary() {
  renderLibrary();
}

function createTrackCard(track, isGrid) {
  const el = document.createElement('div');
  el.className = `track-card${isGrid ? ' track-card-grid' : ''}`;
  el.dataset.taskId = track.taskId;

  const statusBadge = getStatusBadge(track.status);
  const timeStr = formatTimestamp(track.createdAt);
  const songs = track.songs || [];

  let songsHtml = '';
  if (songs.length > 0 && track.status === 'complete') {
    songsHtml = `<div class="song-list">`;
    songs.forEach((song, i) => {
      const audioUrl = song.local_url || song.audioUrl || song.audio_url || song.streamAudioUrl || song.stream_audio_url || '';
      const isLocal = !!song.local_url;
      const imgUrl = song.imageUrl || song.image_url || '';
      const duration = formatDuration(song.duration || 0);
      const songTitle = song.title || track.title || `Track ${i + 1}`;
      
      const savedBadge = isLocal ? '<span class="saved-badge" title="Saved to output_audio folder">💾 Saved</span>' : '';

      songsHtml += `
        <div class="song-item">
          <div class="song-main">
            <button class="btn-mini btn-play" onclick="playSong('${escapeHtml(audioUrl)}','${escapeHtml(songTitle)}','${escapeHtml(track.style || '')}','${escapeHtml(imgUrl)}', event)">▶</button>
            <div class="song-info">
              <div class="song-title">${escapeHtml(songTitle)}</div>
              <div class="song-duration">${duration} #${i + 1} ${savedBadge}</div>
            </div>
          </div>
          <div class="song-actions">
            <button class="btn-mini" onclick="downloadSong(event, '${escapeHtml(audioUrl)}', '${escapeHtml(track.title || track.prompt || 'track')}', '${timeStr}', ${i + 1})" title="Download">⬇</button>
          </div>
        </div>`;
    });
    songsHtml += '</div>';
  }

  const coverContent = songs.length > 0 && (songs[0].imageUrl || songs[0].image_url)
    ? `<img src="${escapeHtml(songs[0].imageUrl || songs[0].image_url)}" alt="cover" onerror="this.parentElement.textContent='🎵'">`
    : '🎵';

  el.innerHTML = `
    <div class="track-card-header">
      <div class="track-cover">${coverContent}</div>
      <div class="track-info">
        <div class="track-header-row">
          <div class="track-name" title="${escapeHtml(track.title || 'Untitled')}">${escapeHtml(track.title || 'Untitled')}</div>
          <div class="track-time">${timeStr}</div>
        </div>
        <div class="track-meta">
          ${statusBadge}
          <span class="track-badge ${track.instrumental ? 'badge-instrumental' : 'badge-vocal'}">${track.instrumental ? 'Instrumental' : 'Vocal'}</span>
          ${track.model ? `<span class="track-badge badge-model">${track.model.replace('_', '.')}</span>` : ''}
          ${track.style ? `<span class="track-style-text">${escapeHtml(track.style)}</span>` : ''}
        </div>
      </div>
      <div class="track-card-actions">
        <button class="btn-mini" onclick="regenerateTrack('${track.taskId}', event)" title="Regenerate">🔄</button>
        <button class="btn-mini" onclick="deleteTrack('${track.taskId}', event)" title="Delete">🗑</button>
      </div>
    </div>
    ${songsHtml}
  `;

  return el;
}

function getStatusBadge(status) {
  const map = {
    pending: ['badge-pending', 'Pending'],
    text: ['badge-pending', 'Writing'],
    first: ['badge-pending', 'Composing'],
    complete: ['badge-complete', 'Complete'],
    error: ['badge-error', 'Error'],
  };
  const [cls, label] = map[status] || ['badge-pending', status ? status.toUpperCase() : 'UNKNOWN'];
  return `<span class="track-badge ${cls}">${label}</span>`;
}

async function deleteTrack(taskId, event) {
  event?.stopPropagation();
  try {
    tracks = tracks.filter(t => t.taskId !== taskId);
    saveTracks();
    renderRecentTracks();
    renderLibrary();
    updateLibraryBadge();
    showToast('🗑 Track removed', 'info');
  } catch (e) {
    showToast('❌ Failed to delete track', 'error');
  }
}

// ==============================
// AUDIO PLAYER
// ==============================

function playSong(url, title, style, imgUrl, event) {
  event?.stopPropagation();
  if (!url) { showToast('⚠️ Audio URL not available yet.', 'error'); return; }

  const audio = document.getElementById('main-audio');
  const player = document.getElementById('audio-player');
  const playBtn = document.getElementById('play-pause-btn');
  const titleEl = document.getElementById('player-title');
  const styleEl = document.getElementById('player-style');
  const coverEl = document.getElementById('player-cover');

  titleEl.textContent = title || 'Unknown';
  styleEl.textContent = style || '';

  if (imgUrl) {
    coverEl.innerHTML = `<img src="${escapeHtml(imgUrl)}" alt="cover" onerror="this.parentElement.textContent='🎵'">`;
  } else {
    coverEl.textContent = '🎵';
  }

  audio.src = url;
  audio.volume = document.getElementById('volume-slider').value;
  audio.play();
  isPlaying = true;
  playBtn.textContent = '⏸';
  player.style.display = 'flex';
}

function togglePlay() {
  const audio = document.getElementById('main-audio');
  const playBtn = document.getElementById('play-pause-btn');
  if (audio.paused) {
    audio.play();
    isPlaying = true;
    playBtn.textContent = '⏸';
  } else {
    audio.pause();
    isPlaying = false;
    playBtn.textContent = '▶';
  }
}

function playPrev() {
  if (currentPlaylist.length === 0) return;
  currentSongIndex = (currentSongIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
  const song = currentPlaylist[currentSongIndex];
  playSong(song.url, song.title, song.style, song.imgUrl, null);
}

function playNext() {
  if (currentPlaylist.length === 0) return;
  currentSongIndex = (currentSongIndex + 1) % currentPlaylist.length;
  const song = currentPlaylist[currentSongIndex];
  playSong(song.url, song.title, song.style, song.imgUrl, null);
}

function onAudioEnded() {
  document.getElementById('play-pause-btn').textContent = '▶';
  isPlaying = false;
}

function updateProgress() {
  const audio = document.getElementById('main-audio');
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  document.getElementById('player-progress-fill').style.width = pct + '%';
  document.getElementById('player-current').textContent = formatDuration(audio.currentTime);
}

function updateDuration() {
  const audio = document.getElementById('main-audio');
  document.getElementById('player-duration').textContent = formatDuration(audio.duration);
}

function seekAudio(event) {
  const bar = document.getElementById('player-progress-bar');
  const audio = document.getElementById('main-audio');
  if (!audio.duration) return;
  const rect = bar.getBoundingClientRect();
  const pct = (event.clientX - rect.left) / rect.width;
  audio.currentTime = pct * audio.duration;
}

function setVolume(val) {
  document.getElementById('main-audio').volume = parseFloat(val);
}

function closePlayer() {
  const audio = document.getElementById('main-audio');
  audio.pause();
  audio.src = '';
  document.getElementById('audio-player').style.display = 'none';
  isPlaying = false;
}

// ==============================
// TOAST NOTIFICATIONS
// ==============================

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==============================
// UTILITIES
// ==============================

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTimestamp(unix) {
  const d = unix ? new Date(unix * 1000) : new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const yy = d.getFullYear().toString().slice(-2);
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const h = pad(d.getHours());
  const m = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  return `${yy}${mm}${dd}-${h}${m}${s}`;
}

function downloadSong(event, url, baseName, timeStr, index) {
  event?.stopPropagation();
  if (!url) return;
  
  // Clean basename: max 6 words, alphanumeric only for filename
  const cleanName = baseName.split(/\s+/).slice(0, 6).join('_').replace(/[^a-z0-9_]/gi, '');
  const fileName = `${cleanName}_${timeStr}_#${index}.mp3`;
  
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.target = '_blank'; // Fallback if download attribute fails on some browsers
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function regenerateTrack(taskId, event) {
  event?.stopPropagation();
  const track = tracks.find(t => t.taskId === taskId);
  if (!track) return;
  
  applyPresetData(track);
  showToast('📋 Form prefilled. Adjust and click Generate.', 'info');
}

// ==============================
// PRESETS (LocalStorage)
// ==============================

function savePreset(payload) {
  try {
    let presets = JSON.parse(localStorage.getItem('zunox_presets') || '[]');
    
    // Create a preset object (clone payload but remove apiKey)
    const preset = { ...payload, timestamp: Math.floor(Date.now() / 1000) };
    delete preset.apiKey;
    
    // Remove if already exists (prevent duplicate identical presets at top)
    const existingIndex = presets.findIndex(p => 
      p.title === preset.title && 
      p.prompt === preset.prompt && 
      p.style === preset.style && 
      p.customMode === preset.customMode
    );
    if (existingIndex !== -1) presets.splice(existingIndex, 1);
    
    presets.unshift(preset);
    presets = presets.slice(0, 10); // Keep 10
    
    localStorage.setItem('zunox_presets', JSON.stringify(presets));
    renderPresets();
  } catch (e) {
    console.error('Failed to save preset:', e);
  }
}

function loadPresets() {
  renderPresets();
}

function renderPresets() {
  const container = document.getElementById('presets-list');
  const section = document.getElementById('presets-section');
  
  try {
    const presets = JSON.parse(localStorage.getItem('zunox_presets') || '[]');
    if (presets.length === 0) {
      section.style.display = 'none';
      return;
    }
    
    section.style.display = 'block';
    container.innerHTML = '';
    
    presets.forEach((p, i) => {
      const div = document.createElement('div');
      div.className = 'preset-item';
      
      const title = p.title || p.prompt || 'Untitled';
      const modeIcon = p.customMode ? '🛠️' : '✨';
      const time = formatTimestamp(p.timestamp);
      
      div.innerHTML = `
        <div class="track-icon-badge" style="cursor:default">${modeIcon}</div>
        <div class="preset-info">
          <div class="preset-title">${escapeHtml(title)}</div>
          <div class="preset-meta">
            <span>${p.instrumental ? '🎸' : '🎤'} ${p.instrumental ? 'Inst.' : 'Vocal'}</span>
            <span>• ${p.model.replace('V', 'v').replace('_', '.')}</span>
            <span>• ${time}</span>
          </div>
        </div>
        <button class="preset-load-btn" onclick="applyPreset(${i})">Load</button>
      `;
      container.appendChild(div);
    });
  } catch (e) {
    section.style.display = 'none';
  }
}

function applyPreset(index) {
  try {
    const presets = JSON.parse(localStorage.getItem('zunox_presets') || '[]');
    const preset = presets[index];
    if (!preset) return;
    
    applyPresetData(preset);
    showToast('📋 Preset loaded!', 'success');
  } catch (e) {}
}

function applyPresetData(data) {
  showPage('generate');
  
  // Basic settings
  if (data.instrumental) setType('instrumental');
  else setType('vocal');
  
  if (data.customMode) {
    setMode('custom');
    document.getElementById('custom-title').value = data.title || '';
    document.getElementById('custom-style').value = data.style || '';
    if (data.lyrics) document.getElementById('custom-lyrics').value = data.lyrics;
    if (data.negativeTags) document.getElementById('negative-tags').value = data.negativeTags;
    
    // Advanced
    if (data.styleWeight !== undefined || data.weirdnessConstraint !== undefined) {
      const advContent = document.getElementById('advanced-content');
      advContent.style.display = 'block';
      document.getElementById('advanced-arrow').classList.add('open');
      
      if (data.styleWeight !== undefined) {
        document.getElementById('style-weight').value = data.styleWeight;
        document.getElementById('style-weight-val').textContent = data.styleWeight;
      }
      if (data.weirdnessConstraint !== undefined) {
        document.getElementById('weirdness').value = data.weirdnessConstraint;
        document.getElementById('weirdness-val').textContent = data.weirdnessConstraint;
      }
    }
  } else {
    setMode('simple');
    document.getElementById('simple-prompt').value = data.prompt || data.title || '';
  }
  
  if (data.model) selectModel(data.model);
  if (data.vocalGender && data.vocalGender === 'f') setGender('f');
  else if (data.vocalGender === 'm') setGender('m');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
