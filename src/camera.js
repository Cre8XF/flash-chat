let stream = null;
let facingMode = 'environment';
let mediaRecorder = null;
let recordedChunks = [];
let recordTimer = null;
let recordSeconds = 0;
let isRecording = false;
let holdTimer = null;

const HOLD_MS = 400;

export function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('Kamera er ikke støttet i denne nettleseren.');
    return;
  }
  buildOverlay();
  startStream();
}

function buildOverlay() {
  document.getElementById('camera-overlay')?.remove();
  const el = document.createElement('div');
  el.id = 'camera-overlay';
  el.className = 'camera-overlay';
  el.innerHTML = `
    <video class="camera-preview" id="camera-video" autoplay playsinline muted></video>
    <button class="camera-close" id="camera-close" aria-label="Lukk">✕</button>
    <button class="flip-btn" id="flip-btn" aria-label="Vend kamera">🔄</button>
    <div class="recording-indicator" id="rec-indicator">
      <span class="rec-dot"></span>
      <span class="rec-time" id="rec-time">0:00</span>
    </div>
    <div class="camera-controls">
      <button class="capture-btn" id="capture-btn"></button>
    </div>
  `;
  document.body.appendChild(el);

  el.querySelector('#camera-close').addEventListener('click', closeCamera);
  el.querySelector('#flip-btn').addEventListener('click', flipCamera);

  const btn = el.querySelector('#capture-btn');
  btn.addEventListener('mousedown', onHoldStart);
  btn.addEventListener('touchstart', onHoldStart, { passive: false });
  btn.addEventListener('mouseup', onHoldEnd);
  btn.addEventListener('touchend', onHoldEnd);
  btn.addEventListener('mouseleave', onHoldLeave);
}

function closeCamera() {
  if (isRecording) stopRecording(false);
  stopStream();
  document.getElementById('camera-overlay')?.remove();
}

async function startStream() {
  stopStream();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode },
      audio: true,
    });
    const video = document.getElementById('camera-video');
    if (video) {
      video.srcObject = stream;
      video.style.transform = facingMode === 'user' ? 'scaleX(-1)' : '';
    }
  } catch (err) {
    console.error('Camera error:', err);
    closeCamera();
  }
}

function stopStream() {
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
}

function flipCamera() {
  if (isRecording) stopRecording(false);
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  startStream();
}

function onHoldStart(e) {
  e.preventDefault();
  holdTimer = setTimeout(() => {
    holdTimer = null;
    startRecording();
  }, HOLD_MS);
}

function onHoldEnd() {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
    takePhoto();
  } else if (isRecording) {
    stopRecording(true);
  }
}

function onHoldLeave() {
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
  if (isRecording) stopRecording(true);
}

function takePhoto() {
  const video = document.getElementById('camera-video');
  if (!video || !video.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob(blob => showResult(blob, false), 'image/jpeg', 0.92);
}

function startRecording() {
  if (!stream || isRecording) return;
  isRecording = true;
  recordedChunks = [];
  recordSeconds = 0;

  document.getElementById('capture-btn')?.classList.add('recording');
  document.getElementById('rec-indicator')?.classList.add('active');

  const mimeType = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4']
    .find(t => MediaRecorder.isTypeSupported(t)) || '';

  try {
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
  } catch {
    mediaRecorder = new MediaRecorder(stream);
  }

  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const type = mediaRecorder.mimeType || mimeType || 'video/webm';
    showResult(new Blob(recordedChunks, { type }), true);
  };
  mediaRecorder.start(100);

  recordTimer = setInterval(() => {
    recordSeconds++;
    const m = Math.floor(recordSeconds / 60);
    const s = String(recordSeconds % 60).padStart(2, '0');
    const el = document.getElementById('rec-time');
    if (el) el.textContent = `${m}:${s}`;
  }, 1000);
}

function stopRecording(emit = true) {
  isRecording = false;
  clearInterval(recordTimer);
  recordTimer = null;
  document.getElementById('capture-btn')?.classList.remove('recording');
  document.getElementById('rec-indicator')?.classList.remove('active');
  if (emit && mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

function showResult(blob, isVideo) {
  stopStream();
  const overlay = document.getElementById('camera-overlay');
  if (!overlay) return;

  const url = URL.createObjectURL(blob);
  overlay.innerHTML = `
    <div class="camera-result">
      ${isVideo
        ? `<video src="${url}" autoplay loop playsinline class="result-media"></video>`
        : `<img src="${url}" class="result-media" alt="Forhåndsvisning" />`}
      <div class="result-actions">
        <button class="result-btn result-discard" id="result-discard">Ta ny</button>
        <button class="result-btn result-send" id="result-send">Send</button>
      </div>
    </div>
  `;

  overlay.querySelector('#result-discard').addEventListener('click', () => {
    URL.revokeObjectURL(url);
    buildOverlay();
    startStream();
  });

  overlay.querySelector('#result-send').addEventListener('click', () => {
    const ext = isVideo ? (blob.type.includes('mp4') ? 'mp4' : 'webm') : 'jpg';
    window.pendingFile = new File([blob], `capture_${Date.now()}.${ext}`, { type: blob.type });
    URL.revokeObjectURL(url);
    overlay.remove();
    window.sendMessage();
  });
}
