export function formatTime(date) {
  const now = new Date();
  const diff = now - date;
  if (diff < 60_000)   return 'nå';
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + ' min';
  if (diff < 86_400_000) return date.toLocaleTimeString('no', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('no', { day: 'numeric', month: 'short' });
}

export function formatTTL(ms) {
  if (ms <= 0) return 'utløpt';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}t ${m}m`;
  return `${m}m`;
}

export function avatarGradient(uid) {
  const colors = [
    'linear-gradient(135deg,#7b2d8b,#c9184a)',
    'linear-gradient(135deg,#1a7a6e,#0ea5e9)',
    'linear-gradient(135deg,#7c3aed,#db2777)',
    'linear-gradient(135deg,#b45309,#d97706)',
    'linear-gradient(135deg,#065f46,#059669)',
  ];
  return colors[uid.charCodeAt(0) % colors.length];
}

export function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}
