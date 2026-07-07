// js/config.js
// ─────────────────────────────────────────────────────────
//  Change API_BASE to your Railway URL after deployment
//  e.g. https://institute-scheduler-api.up.railway.app
// ─────────────────────────────────────────────────────────
const CONFIG = {
  API_BASE: window.location.hostname === 'localhost'
    ? 'http://localhost:5000/api/v1'
    : 'https://YOUR-APP.up.railway.app/api/v1',
};

// ── API helper ────────────────────────────────────────────
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

  // Download file (PDF, Excel, CSV)
  async download(path, filename) {
    const res = await fetch(CONFIG.API_BASE + path, { headers: this.headers() });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  },
};

// ── Auth helpers ─────────────────────────────────────────
const Auth = {
  user:  () => JSON.parse(localStorage.getItem('user') || 'null'),
  role:  () => Auth.user()?.role,

  save(data) {
    localStorage.setItem('accessToken',  data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user',         JSON.stringify(data.user));
  },

  logout() {
    localStorage.clear();
    window.location.href = '/index.html';
  },

  requireAuth(allowedRoles = []) {
    const user = Auth.user();
    if (!user || !Auth.token()) { Auth.logout(); return false; }
    if (allowedRoles.length && !allowedRoles.includes(user.role)) {
      window.location.href = user.role === 'admin' ? '/pages/admin-dashboard.html' : '/pages/teacher-dashboard.html';
      return false;
    }
    return true;
  },
};

// ── UI helpers ───────────────────────────────────────────
const UI = {
  toast(message, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
  },

  loading(btn, state) {
    if (state) {
      btn.dataset.original = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Please wait…';
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.original || btn.textContent;
    }
  },

  formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  formatTime(t) {
    if (!t) return '—';
    return String(t).substring(0, 5);
  },

  statusBadge(status) {
    const map = {
      scheduled:       'badge-blue',
      ongoing:         'badge-green',
      completed:       'badge-gray',
      cancelled:       'badge-red',
      present:         'badge-green',
      late:            'badge-amber',
      absent:          'badge-red',
      excused:         'badge-blue',
      technical_issue: 'badge-gray',
      pending:         'badge-amber',
      approved:        'badge-green',
      rejected:        'badge-red',
    };
    const cls = map[status] || 'badge-gray';
    return `<span class="badge ${cls}">${status.replace('_',' ')}</span>`;
  },

  platformIcon(platform) {
    const icons = {
      google_meet:      '🎥',
      skype:            '💬',
      microsoft_teams:  '🟣',
      moodle:           '📚',
      custom:           '🔗',
    };
    return icons[platform] || '🔗';
  },
};
