/**
 * ChatRoom — Client Application
 * Handles Socket.IO communication, UI rendering and settings
 */

/* ════════════════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════════════ */
const state = {
  socket: null,
  roomCode: null,
  myId: null,
  myUser: null,
  participants: [],
  typingTimeout: null,
  isTyping: false,
};

/* ════════════════════════════════════════════════════════════════════
   DOM REFS
   ═══════════════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const el = {
  screenLanding: $('screen-landing'),
  screenChat: $('screen-chat'),
  inputName: $('input-name'),
  inputCode: $('input-code'),
  btnCreate: $('btn-create'),
  btnJoin: $('btn-join'),
  landingError: $('landing-error'),
  displayRoomCode: $('display-room-code'),
  headerRoomCode: $('header-room-code'),
  btnCopyCode: $('btn-copy-code'),
  participantCount: $('participant-count'),
  participantsList: $('participants-list'),
  messagesContainer: $('messages-container'),
  messagesInner: $('messages-inner'),
  welcomeMessage: $('welcome-message'),
  msgInput: $('msg-input'),
  btnSend: $('btn-send'),
  typingIndicator: $('typing-indicator'),
  btnSettings: $('btn-settings'),
  btnSettingsClose: $('btn-settings-close'),
  settingsPanel: $('settings-panel'),
  settingsOverlay: $('settings-overlay'),
  btnLeave: $('btn-leave'),
  btnSidebarToggle: $('btn-sidebar-toggle'),
  chatSidebar: document.querySelector('.chat-sidebar'),
  fontSizeRange: $('font-size-range'),
  opacityRange: $('opacity-range'),
  toggleAnimations: $('toggle-animations'),
  bgUpload: $('bg-upload'),
  imgUpload: $('img-upload'),
  emojiPanel: $('emoji-panel'),
  btnEmojiPanel: $('btn-emoji-panel'),
  toastContainer: $('toast-container'),
};

/* ════════════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════════ */
function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function toast(msg, type = 'info', duration = 3000) {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  el.toastContainer.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => t.remove(), 300);
  }, duration);
}

function showError(msg) {
  el.landingError.textContent = msg;
  el.landingError.classList.remove('hidden');
  setTimeout(() => el.landingError.classList.add('hidden'), 4000);
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
}

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem('chatroom-settings') || '{}');
  if (saved.theme) applyTheme(saved.theme);
  if (saved.fontSize) { document.documentElement.style.setProperty('--font-size', saved.fontSize + 'px'); el.fontSizeRange.value = saved.fontSize; }
  if (saved.opacity) { applyOpacity(saved.opacity); el.opacityRange.value = saved.opacity; }
  if (saved.animations === false) { document.body.classList.add('no-animations'); el.toggleAnimations.checked = false; }
  if (saved.bgImage) { document.getElementById('screen-chat').style.backgroundImage = `url(${saved.bgImage})`; }
  if (saved.bgPreset) applyBgPreset(saved.bgPreset, false);
}

function saveSettings(key, value) {
  const s = JSON.parse(localStorage.getItem('chatroom-settings') || '{}');
  s[key] = value;
  localStorage.setItem('chatroom-settings', JSON.stringify(s));
}

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  document.querySelectorAll('[data-theme-toggle]').forEach(b => {
    b.classList.toggle('active', b.dataset.themeToggle === theme);
  });
  saveSettings('theme', theme);
}

function applyOpacity(val) {
  document.documentElement.style.setProperty('--glass-opacity', val / 100);
}

const BG_PRESETS = {
  default:  'linear-gradient(135deg,#0d0d14,#13131f)',
  midnight: 'linear-gradient(135deg,#0a0a1a,#0d1a2e)',
  forest:   'linear-gradient(135deg,#050f0a,#0a1f14)',
  ember:    'linear-gradient(135deg,#120808,#1a0d0d)',
  aurora:   'linear-gradient(135deg,#080d14,#0d0820)',
  light1:   'linear-gradient(135deg,#f0f2f5,#e8eaf0)',
};

function applyBgPreset(key, save = true) {
  const chatEl = document.getElementById('screen-chat');
  chatEl.style.backgroundImage = BG_PRESETS[key] || BG_PRESETS.default;
  chatEl.style.backgroundColor = '';
  document.querySelectorAll('.bg-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.bg === key);
  });
  if (save) {
    saveSettings('bgPreset', key);
    saveSettings('bgImage', null);
  }
}

/* ════════════════════════════════════════════════════════════════════
   SOCKET.IO CONNECTION
   ═══════════════════════════════════════════════════════════════════ */
function connectSocket() {
  state.socket = io();

  state.socket.on('connect', () => {
    state.myId = state.socket.id;
  });

  state.socket.on('disconnect', () => {
    toast('Conexão perdida. Tentando reconectar...', 'error');
  });

  state.socket.on('room-update', (snapshot) => {
    if (!snapshot) return;
    state.participants = snapshot.participants;
    renderParticipants(snapshot);
  });

  state.socket.on('new-message', (message) => {
    renderMessage(message);
  });

  state.socket.on('user-joined', ({ user }) => {
    appendSystemMsg(`${user.name} entrou na sala ✦`);
  });

  state.socket.on('user-left', ({ user }) => {
    appendSystemMsg(`${user.name} saiu da sala`);
  });

  state.socket.on('user-typing', ({ name, isTyping }) => {
    el.typingIndicator.textContent = isTyping ? `${name} está digitando...` : '';
  });
}

/* ════════════════════════════════════════════════════════════════════
   ROOM ACTIONS
   ═══════════════════════════════════════════════════════════════════ */
function createRoom() {
  const name = el.inputName.value.trim();
  if (!name) { showError('Por favor, insira seu nome.'); el.inputName.focus(); return; }

  state.socket.emit('create-room', { name }, (res) => {
    if (res.error) { showError(res.error); return; }
    state.roomCode = res.code;
    state.myUser = res.user;
    enterChatScreen(res.code);
    toast(`Sala ${res.code} criada! Compartilhe o código com seus amigos.`, 'success', 5000);
  });
}

function joinRoom() {
  const name = el.inputName.value.trim();
  const code = el.inputCode.value.trim();
  if (!name) { showError('Por favor, insira seu nome.'); el.inputName.focus(); return; }
  if (!code || !/^\d{4}$/.test(code)) { showError('Código deve ter 4 números.'); el.inputCode.focus(); return; }

  state.socket.emit('join-room', { name, code }, (res) => {
    if (res.error) { showError(res.error); return; }
    state.roomCode = res.code;
    state.myUser = res.user;
    enterChatScreen(res.code);
    toast(`Você entrou na sala ${res.code}!`, 'success');
  });
}

function leaveRoom() {
  state.socket.emit('leave-room');
  state.roomCode = null;
  state.myUser = null;
  state.participants = [];
  el.messagesInner.innerHTML = '';
  el.messagesInner.appendChild(createWelcomeMsg());
  el.participantsList.innerHTML = '';
  showScreen('landing');
}

function enterChatScreen(code) {
  el.displayRoomCode.textContent = code;
  el.headerRoomCode.textContent = code;
  showScreen('chat');
}

/* ════════════════════════════════════════════════════════════════════
   MESSAGING
   ═══════════════════════════════════════════════════════════════════ */
function sendMessage(text, type = 'text') {
  if (!text.trim()) return;
  state.socket.emit('send-message', { text, type }, (res) => {
    if (res?.error) toast(res.error, 'error');
  });
}

function handleSend() {
  const text = el.msgInput.value.trim();
  if (!text) return;
  sendMessage(text);
  el.msgInput.value = '';
  el.msgInput.style.height = 'auto';
  stopTyping();
}

let lastSenderId = null;
let lastMsgGroup = null;

function renderMessage(msg) {
  const isOwn = msg.senderId === state.myId;

  // Hide welcome if present
  const welcome = $('welcome-message');
  if (welcome) welcome.style.display = 'none';

  // Group consecutive messages from same sender
  if (lastSenderId === msg.senderId && lastMsgGroup) {
    const bubble = createBubble(msg, isOwn);
    lastMsgGroup.appendChild(bubble);
  } else {
    const group = createMessageGroup(msg, isOwn);
    lastMsgGroup = group;
    el.messagesInner.appendChild(group);
  }

  lastSenderId = msg.senderId;
  scrollToBottom();
}

function createMessageGroup(msg, isOwn) {
  const group = document.createElement('div');
  group.className = `message-group ${isOwn ? 'own' : 'other'}`;

  // Meta (name, time, avatar) only for others
  if (!isOwn) {
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.style.background = msg.user.color;
    avatar.textContent = msg.user.initials;
    const nameEl = document.createElement('span');
    nameEl.className = 'msg-name';
    nameEl.textContent = msg.user.name;
    const timeEl = document.createElement('span');
    timeEl.className = 'msg-time';
    timeEl.textContent = formatTime(msg.timestamp);
    meta.append(avatar, nameEl, timeEl);
    group.appendChild(meta);
  } else {
    const timeEl = document.createElement('span');
    timeEl.className = 'msg-time';
    timeEl.style.cssText = 'font-size:0.7rem;color:var(--text-muted);padding:0 4px;margin-bottom:4px;';
    timeEl.textContent = formatTime(msg.timestamp);
    group.appendChild(timeEl);
  }

  const bubble = createBubble(msg, isOwn);
  group.appendChild(bubble);
  return group;
}

function createBubble(msg, isOwn) {
  const row = document.createElement('div');
  row.className = 'message-row';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (msg.type === 'image') {
    const img = document.createElement('img');
    img.src = msg.text;
    img.alt = 'imagem';
    img.onclick = () => window.open(msg.text, '_blank');
    bubble.appendChild(img);
  } else {
    bubble.textContent = msg.text;
  }

  row.appendChild(bubble);
  return row;
}

function appendSystemMsg(text) {
  const d = document.createElement('div');
  d.className = 'system-msg';
  d.textContent = text;
  el.messagesInner.appendChild(d);
  lastSenderId = null; // break grouping
  scrollToBottom();
}

function createWelcomeMsg() {
  const d = document.createElement('div');
  d.id = 'welcome-message';
  d.className = 'welcome-message';
  d.innerHTML = '<div class="welcome-icon">✦</div><p>A conversa começa agora.<br/>Seja o primeiro a dizer algo.</p>';
  return d;
}

function scrollToBottom() {
  el.messagesContainer.scrollTop = el.messagesContainer.scrollHeight;
}

/* ── Typing indicator ─────────────────────────────────────────────── */
function startTyping() {
  if (!state.isTyping) {
    state.isTyping = true;
    state.socket?.emit('typing', true);
  }
  clearTimeout(state.typingTimeout);
  state.typingTimeout = setTimeout(stopTyping, 1800);
}

function stopTyping() {
  if (state.isTyping) {
    state.isTyping = false;
    state.socket?.emit('typing', false);
  }
  clearTimeout(state.typingTimeout);
}

/* ════════════════════════════════════════════════════════════════════
   PARTICIPANTS RENDER
   ═══════════════════════════════════════════════════════════════════ */
function renderParticipants(snapshot) {
  el.participantCount.textContent = snapshot.count;
  el.participantsList.innerHTML = '';
  snapshot.participants.forEach(p => {
    const item = document.createElement('div');
    item.className = 'participant-item';
    const av = document.createElement('div');
    av.className = 'participant-avatar';
    av.style.background = p.color;
    av.textContent = p.initials;
    const name = document.createElement('span');
    name.className = 'participant-name';
    name.textContent = p.name;
    item.append(av, name);
    if (p.id === snapshot.hostId) {
      const badge = document.createElement('span');
      badge.className = 'participant-badge';
      badge.textContent = 'host';
      item.appendChild(badge);
    }
    el.participantsList.appendChild(item);
  });
}

/* ════════════════════════════════════════════════════════════════════
   IMAGE UPLOAD
   ═══════════════════════════════════════════════════════════════════ */
function handleImageUpload(file) {
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) { toast('Imagem muito grande (máx. 4MB)', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => sendMessage(e.target.result, 'image');
  reader.readAsDataURL(file);
}

/* ════════════════════════════════════════════════════════════════════
   EVENT LISTENERS
   ═══════════════════════════════════════════════════════════════════ */
function bindEvents() {
  // Landing
  el.btnCreate.addEventListener('click', createRoom);
  el.btnJoin.addEventListener('click', joinRoom);
  el.inputName.addEventListener('keydown', e => { if (e.key === 'Enter') createRoom(); });
  el.inputCode.addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
  el.inputCode.addEventListener('input', () => {
    el.inputCode.value = el.inputCode.value.replace(/\D/g, '').slice(0, 4);
  });

  // Copy code
  el.btnCopyCode.addEventListener('click', () => {
    navigator.clipboard.writeText(state.roomCode).then(() => toast('Código copiado!', 'success'));
  });

  // Leave
  el.btnLeave.addEventListener('click', leaveRoom);

  // Send message
  el.btnSend.addEventListener('click', handleSend);
  el.msgInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
  el.msgInput.addEventListener('input', () => {
    // Auto resize textarea
    el.msgInput.style.height = 'auto';
    el.msgInput.style.height = Math.min(el.msgInput.scrollHeight, 100) + 'px';
    startTyping();
  });

  // Image upload
  el.imgUpload.addEventListener('change', e => handleImageUpload(e.target.files[0]));

  // Emoji panel
  el.btnEmojiPanel.addEventListener('click', () => el.emojiPanel.classList.toggle('hidden'));
  document.addEventListener('click', e => {
    if (!el.emojiPanel.contains(e.target) && e.target !== el.btnEmojiPanel)
      el.emojiPanel.classList.add('hidden');
  });
  // Emoji click
  el.emojiPanel.querySelectorAll('.emoji-grid > *').forEach(em => {
    em.style.cursor = 'pointer';
    em.addEventListener('click', () => {
      el.msgInput.value += em.textContent;
      el.msgInput.focus();
      el.emojiPanel.classList.add('hidden');
    });
  });

  // Settings
  el.btnSettings.addEventListener('click', () => {
    el.settingsPanel.classList.remove('hidden');
    el.settingsOverlay.classList.remove('hidden');
  });
  const closeSettings = () => {
    el.settingsPanel.classList.add('hidden');
    el.settingsOverlay.classList.add('hidden');
  };
  el.btnSettingsClose.addEventListener('click', closeSettings);
  el.settingsOverlay.addEventListener('click', closeSettings);

  // Theme toggles
  document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.themeToggle));
  });

  // Animations toggle
  el.toggleAnimations.addEventListener('change', () => {
    document.body.classList.toggle('no-animations', !el.toggleAnimations.checked);
    saveSettings('animations', el.toggleAnimations.checked);
  });

  // Font size
  el.fontSizeRange.addEventListener('input', () => {
    const v = el.fontSizeRange.value;
    document.documentElement.style.setProperty('--font-size', v + 'px');
    saveSettings('fontSize', v);
  });

  // Opacity
  el.opacityRange.addEventListener('input', () => {
    applyOpacity(el.opacityRange.value);
    saveSettings('opacity', el.opacityRange.value);
  });

  // Background swatches
  document.querySelectorAll('.bg-swatch').forEach(s => {
    s.addEventListener('click', () => applyBgPreset(s.dataset.bg));
  });

  // Background image upload
  el.bgUpload.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      document.getElementById('screen-chat').style.backgroundImage = `url(${ev.target.result})`;
      saveSettings('bgImage', ev.target.result);
      saveSettings('bgPreset', null);
      document.querySelectorAll('.bg-swatch').forEach(s => s.classList.remove('active'));
    };
    reader.readAsDataURL(file);
  });

  // Mobile sidebar toggle
  el.btnSidebarToggle?.addEventListener('click', () => {
    el.chatSidebar.classList.toggle('open');
  });

  // Close sidebar on outside click (mobile)
  el.messagesContainer.addEventListener('click', () => {
    if (window.innerWidth <= 640) el.chatSidebar.classList.remove('open');
  });
}

/* ════════════════════════════════════════════════════════════════════
   EMOJI GRID — make each character a clickable element
   ═══════════════════════════════════════════════════════════════════ */
function initEmojiGrid() {
  const emojis = [
    '😀','😂','🥲','😍','🤩','😎','🥹','😅','😭','😤','🤔','🙄','😏','🥰','😇','🤯',
    '👋','🤝','👍','👎','❤️','🔥','✨','💯','🎉','🙌','💪','🫶','😈','👀','💀','🤌',
    '🚀','🌙','⭐','🌈','💎','🎵','🎮','🍕','☕','🐱','🐶','🦊','🌸','🍀','⚡','🎯'
  ];
  const grid = el.emojiPanel.querySelector('.emoji-grid');
  grid.innerHTML = '';
  emojis.forEach(emoji => {
    const btn = document.createElement('div');
    btn.textContent = emoji;
    btn.title = emoji;
    btn.addEventListener('click', () => {
      el.msgInput.value += emoji;
      el.msgInput.focus();
      el.emojiPanel.classList.add('hidden');
    });
    grid.appendChild(btn);
  });
}

/* ════════════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════════ */
function init() {
  loadSettings();
  connectSocket();
  bindEvents();
  initEmojiGrid();
  // Default background
  const s = JSON.parse(localStorage.getItem('chatroom-settings') || '{}');
  if (!s.bgImage && !s.bgPreset) applyBgPreset('default', false);
}

document.addEventListener('DOMContentLoaded', init);
