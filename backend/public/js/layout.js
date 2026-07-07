// js/layout.js — renders sidebar + topbar for any page

function renderAdminSidebar(activePage) {
  const user = Auth.user();
  const nav = [
    { section: 'Overview' },
    { icon: '📊', label: 'Dashboard',    href: 'admin-dashboard.html' },
    { icon: '📅', label: 'Schedule',     href: 'admin-schedule.html' },
    { section: 'Manage' },
    { icon: '👩‍🏫', label: 'Teachers',   href: 'admin-teachers.html' },
    { icon: '👨‍🎓', label: 'Students',   href: 'admin-students.html' },
    { icon: '📚', label: 'Courses',      href: 'admin-courses.html' },
    { section: 'Operations' },
    { icon: '✅', label: 'Attendance',   href: 'admin-attendance.html' },
    { icon: '🏖', label: 'Leave',        href: 'admin-leave.html' },
    { icon: '📈', label: 'Reports',      href: 'admin-reports.html' },
  ];
  return buildSidebar(nav, activePage, user);
}

function renderTeacherSidebar(activePage) {
  const user = Auth.user();
  const nav = [
    { section: 'My Work' },
    { icon: '📊', label: 'Dashboard',   href: 'teacher-dashboard.html' },
    { icon: '📅', label: 'My Schedule', href: 'teacher-schedule.html' },
    { icon: '✅', label: 'Attendance',  href: 'teacher-attendance.html' },
    { section: 'Personal' },
    { icon: '🏖', label: 'Leave',       href: 'teacher-leave.html' },
    { icon: '👨‍🎓', label: 'My Students',href: 'teacher-students.html' },
  ];
  return buildSidebar(nav, activePage, user);
}

function buildSidebar(nav, activePage, user) {
  const initials = (user?.fullName || 'U').split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();
  let html = `
    <div class="sidebar-brand">
      <h2>📅 ISM</h2>
      <p>Institute Schedule Manager</p>
    </div>`;

  for (const item of nav) {
    if (item.section) {
      html += `<div class="nav-section">${item.section}</div>`;
    } else {
      const active = activePage === item.href ? 'active' : '';
      html += `<a class="nav-link ${active}" href="${item.href}">
        <span class="icon">${item.icon}</span>${item.label}
      </a>`;
    }
  }

  html += `
    <div class="sidebar-footer">
      <div class="user-chip">
        <div class="user-avatar">${initials}</div>
        <div class="user-info">
          <div class="name">${user?.fullName || 'User'}</div>
          <div class="role">${user?.role || ''}</div>
        </div>
      </div>
      <button class="btn-logout" onclick="Auth.logout()">⬅ Sign Out</button>
    </div>`;

  return html;
}

function initPage(role, activePage, title) {
  if (!Auth.requireAuth([role])) return;
  const sidebar = document.getElementById('sidebar');
  const topTitle = document.getElementById('pageTitle');
  if (sidebar) sidebar.innerHTML = role === 'admin'
    ? renderAdminSidebar(activePage)
    : renderTeacherSidebar(activePage);
  if (topTitle) topTitle.textContent = title;
}
