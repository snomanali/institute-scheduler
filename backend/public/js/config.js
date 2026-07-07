// js/config.js — auto-detects API base URL
const CONFIG = {
  // Same origin — frontend and API served from same Railway URL
  API_BASE: window.location.origin + '/api/v1',
};

const API = {
  token: () => localStorage.getItem('accessToken'),
  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.token()) h['Authorization'] = `Bearer ${this.token()}`;
    return h;
  },
  async request(method, path, body = null) {
    const opts = { method, headers: this.headers() };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(CONFIG.API_BASE + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, message: data.message || 'Request failed', data };
    return data;
  },
  get:    (p)    => API.request('GET',    p),
  post:   (p, b) => API.request('POST',   p, b),
  put:    (p, b) => API.request('PUT',    p, b),
  patch:  (p, b) => API.request('PATCH',  p, b),
  delete: (p)    => API.request('DELETE', p),
  async download(path, filename) {
    const res  = await fetch(CONFIG.API_BASE + path, { headers: this.headers() });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  },
};

const Auth = {
  user:  () => JSON.parse(localStorage.getItem('user') || 'null'),
  role:  () => Auth.user()?.role,
  token: () => localStorage.getItem('accessToken'),
  save(data) {
    localStorage.setItem('accessToken',  data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user',         JSON.stringify(data.user));
  },
  logout() { localStorage.clear(); window.location.href = '/index.html'; },
  requireAuth(roles = []) {
    const user = Auth.user();
    if (!user) { Auth.logout(); return false; }
    if (roles.length && !roles.includes(user.role)) {
      window.location.href = user.role === 'admin' ? '/pages/admin-dashboard.html' : '/pages/teacher-dashboard.html';
      return false;
    }
    return true;
  },
};

const UI = {
  toast(message, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`; t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
  },
  loading(btn, state) {
    if (state) { btn.dataset.original = btn.textContent; btn.disabled = true; btn.textContent = 'Please wait…'; }
    else { btn.disabled = false; btn.textContent = btn.dataset.original || btn.textContent; }
  },
  formatDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); },
  formatTime(t) { return t ? String(t).substring(0,5) : '—'; },
  statusBadge(s) {
    const m = { scheduled:'badge-blue',ongoing:'badge-green',completed:'badge-gray',cancelled:'badge-red',present:'badge-green',late:'badge-amber',absent:'badge-red',excused:'badge-blue',technical_issue:'badge-gray',pending:'badge-amber',approved:'badge-green',rejected:'badge-red',annual:'badge-blue',sick:'badge-amber',emergency:'badge-red',personal:'badge-gray',available:'badge-green',on_leave:'badge-red',off_day:'badge-gray',fully_booked:'badge-amber' };
    return `<span class="badge ${m[s]||'badge-gray'}">${s.replace(/_/g,' ')}</span>`;
  },
  platformIcon(p) { return {google_meet:'🎥',skype:'💬',microsoft_teams:'🟣',moodle:'📚',custom:'🔗'}[p]||'🔗'; },
};
