export const APP_STYLES = `
:root {
  color-scheme: light;
  --sidebar: #101827;
  --sidebar-2: #162033;
  --sidebar-muted: #8ea0bd;
  --sidebar-text: #edf3ff;
  --bg: #f5f6fa;
  --surface: #ffffff;
  --surface-soft: #f8fafc;
  --line: #e5e7eb;
  --line-strong: #d5dae3;
  --text: #121826;
  --muted: #697386;
  --muted-2: #8a94a6;
  --primary: #4f6bed;
  --primary-weak: #eef2ff;
  --danger: #dc3e55;
  --danger-weak: #fff1f2;
  --success: #17a36b;
  --warning: #d99a20;
  --radius: 12px;
  --shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
}

* {
  box-sizing: border-box;
}

html,
body {
  min-height: 100%;
}

body {
  margin: 0;
  color: var(--text);
  background: var(--bg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
  font-size: 14px;
  line-height: 1.45;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

button:disabled,
input:disabled,
select:disabled,
textarea:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

a {
  color: inherit;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 9px 10px;
  color: var(--text);
  background: #fff;
  outline: none;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}

textarea {
  min-height: 96px;
  resize: vertical;
}

input:focus,
select:focus,
textarea:focus {
  border-color: rgba(79, 107, 237, 0.55);
  box-shadow: 0 0 0 3px rgba(79, 107, 237, 0.12);
}

label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
}

label span {
  white-space: nowrap;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  background: var(--bg);
}

.app-sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  min-width: 0;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: 18px;
  padding: 18px 14px;
  color: var(--sidebar-text);
  background:
    radial-gradient(circle at 20% 0%, rgba(79, 107, 237, 0.24), transparent 32%),
    linear-gradient(180deg, var(--sidebar-2), var(--sidebar));
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.sidebar-brand,
.login-brand {
  display: flex;
  align-items: center;
  gap: 11px;
}

.brand-mark {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 10px;
  color: #fff;
  background: linear-gradient(135deg, var(--primary), #7c8cf5);
  font-weight: 800;
  letter-spacing: -0.04em;
}

.sidebar-brand strong {
  display: block;
  font-size: 18px;
  line-height: 1.1;
}

.sidebar-brand span {
  display: block;
  margin-top: 2px;
  color: var(--sidebar-muted);
  font-size: 12px;
}

.side-nav,
.side-group-list {
  display: grid;
  gap: 4px;
}

.side-nav-item,
.side-group {
  width: 100%;
  border: 0;
  border-radius: 10px;
  color: var(--sidebar-muted);
  background: transparent;
  text-align: left;
  transition: background 140ms ease, color 140ms ease;
}

.side-nav-item {
  padding: 10px 11px;
  font-weight: 700;
}

.side-nav-item:hover,
.side-group:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.07);
}

.side-nav-item.active,
.side-group.active {
  color: #fff;
  background: rgba(79, 107, 237, 0.28);
}

.side-section {
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px;
}

.side-section-title {
  padding: 0 11px;
  color: var(--sidebar-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.side-group-list {
  min-height: 0;
  overflow: auto;
  align-content: start;
  align-items: start;
  grid-auto-rows: min-content;
  padding-right: 2px;
}

.side-group {
  min-height: 50px;
  align-self: start;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
}

.side-group strong,
.side-group small {
  display: block;
}

.side-group strong {
  color: inherit;
  font-size: 13px;
  font-weight: 700;
}

.side-group small {
  margin-top: 2px;
  color: var(--sidebar-muted);
  font-size: 11px;
}

.side-badge {
  min-width: 22px;
  height: 20px;
  padding: 0 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: #c8d3e8;
  background: rgba(255, 255, 255, 0.08);
  font-size: 11px;
  font-weight: 800;
}

.side-badge.danger {
  color: #ffd5dc;
  background: rgba(220, 62, 85, 0.22);
}

.sidebar-foot {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.sidebar-foot div {
  padding: 9px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
}

.sidebar-foot strong,
.sidebar-foot span {
  display: block;
}

.sidebar-foot strong {
  font-size: 18px;
}

.sidebar-foot span {
  color: var(--sidebar-muted);
  font-size: 11px;
}

.app-main {
  min-width: 0;
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.app-topbar {
  min-height: 68px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 12px 18px;
  background: rgba(255, 255, 255, 0.92);
  border-bottom: 1px solid var(--line);
  backdrop-filter: blur(16px);
}

.topbar-filter {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(220px, 1.4fr) minmax(130px, 0.55fr) minmax(170px, 0.8fr) minmax(110px, 0.45fr) auto;
  gap: 10px;
  align-items: end;
}

.search-field input {
  padding-left: 12px;
}

.topbar-actions,
.view-actions,
.detail-actions,
.row-actions,
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.topbar-actions {
  justify-content: flex-end;
}

.sync-summary {
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

.btn {
  min-height: 36px;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text);
  background: #fff;
  font-size: 13px;
  font-weight: 750;
  text-decoration: none;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}

.btn:hover {
  border-color: var(--line-strong);
  background: var(--surface-soft);
}

.btn.primary {
  border-color: var(--primary);
  color: #fff;
  background: var(--primary);
}

.btn.primary:hover {
  background: #405bd4;
}

.btn.text {
  border-color: transparent;
  background: transparent;
}

.btn.danger {
  border-color: var(--danger);
  color: #fff;
  background: var(--danger);
}

.danger-text {
  color: var(--danger) !important;
}

.link-btn {
  border: 0;
  padding: 0;
  color: var(--muted);
  background: transparent;
  font-size: 12px;
  font-weight: 750;
  text-decoration: none;
}

.link-btn:hover,
.primary-link {
  color: var(--primary);
}

.mail-workspace {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(380px, 0.96fr) minmax(460px, 1.04fr);
  overflow: hidden;
}

.mail-list-pane,
.mail-detail-pane,
.content-view {
  min-width: 0;
  min-height: 0;
  background: var(--surface);
}

.mail-list-pane {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border-right: 1px solid var(--line);
}

.mail-detail-pane {
  overflow: auto;
}

.pane-head,
.view-head {
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 15px 18px;
  border-bottom: 1px solid var(--line);
  background: #fff;
}

.pane-head h2,
.view-head h2 {
  margin: 0;
  font-size: 16px;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.pane-head p,
.view-head p {
  margin: 3px 0 0;
  color: var(--muted);
  font-size: 12px;
}

.mail-list,
.sync-list,
.account-manage-list {
  min-height: 0;
  overflow: auto;
}

.mail-row,
.sync-row,
.account-row {
  position: relative;
  border-bottom: 1px solid var(--line);
  background: #fff;
  transition: background 140ms ease;
}

.mail-row {
  padding: 13px 16px 12px;
}

.mail-row:hover,
.mail-row.active {
  background: #f7f9ff;
}

.mail-row.active::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--primary);
}

.mail-row-main,
.sync-row-main,
.account-row-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.mail-subject {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.mail-subject span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mail-row time {
  color: var(--muted-2);
  font-size: 12px;
  white-space: nowrap;
}

.mail-row-meta,
.account-row-meta,
.sync-row-meta {
  margin-top: 5px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
}

.mail-row-meta span,
.account-row-meta span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mail-row-bottom {
  margin-top: 7px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.mail-row-bottom p {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  color: var(--muted);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.unread-dot,
.status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  display: inline-block;
  border-radius: 999px;
  background: var(--muted-2);
}

.unread-dot {
  background: var(--primary);
}

.status-dot.success {
  background: var(--success);
}

.status-dot.waiting {
  background: var(--warning);
}

.status-dot.error {
  background: var(--danger);
}

.status-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.detail-wrap {
  min-height: 100%;
  display: grid;
  align-content: start;
  gap: 16px;
  padding: 22px 24px 28px;
}

.detail-head {
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}

.detail-head h2 {
  margin: 0;
  max-width: 920px;
  font-size: clamp(22px, 2.2vw, 30px);
  line-height: 1.18;
  letter-spacing: -0.04em;
}

.detail-head p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.frame-note {
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--muted);
  background: var(--surface-soft);
  font-size: 12px;
}

.detail-frame {
  width: 100%;
  min-height: 430px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
}

.detail-section {
  display: grid;
  gap: 10px;
}

.detail-section h3 {
  margin: 0;
  font-size: 14px;
}

.attachment-list {
  display: grid;
  gap: 8px;
}

.attachment-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}

.attachment-row strong,
.attachment-row span {
  display: block;
}

.attachment-row span {
  color: var(--muted);
  font-size: 12px;
}

.plain-preview {
  max-height: 220px;
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--muted);
  background: var(--surface-soft);
  white-space: pre-wrap;
}

.content-view {
  min-height: 0;
  overflow: auto;
  padding: 0 0 28px;
}

.sync-row,
.account-row {
  padding: 14px 18px;
}

.sync-row:hover,
.account-row:hover {
  background: var(--surface-soft);
}

.sync-row-main strong,
.account-row-main strong {
  display: block;
  font-size: 14px;
}

.sync-row-main span,
.account-row-main span {
  display: block;
  color: var(--muted);
  font-size: 12px;
}

.sync-error,
.account-error {
  margin-top: 8px;
  color: var(--danger);
  font-size: 12px;
}

.account-row.active {
  background: #f7f9ff;
}

.management-tools {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  border-bottom: 1px solid var(--line);
  background: #fff;
}

.management-tools details {
  border-right: 1px solid var(--line);
}

.management-tools summary {
  padding: 13px 18px;
  color: var(--text);
  font-weight: 750;
  cursor: pointer;
  list-style: none;
}

.management-tools summary::-webkit-details-marker {
  display: none;
}

.tool-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 0 18px 18px;
}

.tool-form textarea,
.tool-form p,
.tool-form button {
  grid-column: 1 / -1;
}

.empty {
  margin: 18px;
  padding: 20px;
  border: 1px dashed var(--line-strong);
  border-radius: 12px;
  color: var(--muted);
  background: var(--surface-soft);
  text-align: center;
}

.empty.compact {
  margin: 0;
  padding: 12px;
}

.detail-empty {
  margin: 24px;
}

.muted {
  color: var(--muted);
}

.toast-container {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 50;
  display: grid;
  gap: 10px;
}

.toast {
  width: min(420px, calc(100vw - 36px));
  padding: 13px 15px;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--text);
  background: #fff;
  box-shadow: var(--shadow);
}

.toast.error {
  border-color: rgba(220, 62, 85, 0.28);
  color: var(--danger);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(15, 23, 42, 0.36);
  backdrop-filter: blur(8px);
}

.modal-card {
  width: min(520px, 100%);
  display: grid;
  gap: 14px;
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 20px;
  background: #fff;
  box-shadow: var(--shadow);
}

.modal-card h3,
.modal-card p {
  margin: 0;
}

.modal-card p {
  color: var(--muted);
}

.login-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at 20% 10%, rgba(79, 107, 237, 0.16), transparent 34%),
    linear-gradient(135deg, #f7f8fc, #eef2f9);
}

.login-panel {
  width: min(520px, 100%);
  display: grid;
  gap: 24px;
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 28px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--shadow);
}

.login-brand h1,
.login-brand p,
.login-copy h2,
.login-copy p {
  margin: 0;
}

.login-brand h1 {
  font-size: 22px;
  line-height: 1.1;
}

.login-brand p,
.login-copy p {
  color: var(--muted);
}

.login-copy {
  display: grid;
  gap: 8px;
}

.login-copy h2 {
  font-size: 28px;
  line-height: 1.12;
  letter-spacing: -0.04em;
}

.eyebrow {
  color: var(--primary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.login-form {
  display: grid;
  gap: 12px;
}

@media (max-width: 1180px) {
  .app-shell {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .app-topbar {
    grid-template-columns: 1fr;
  }

  .topbar-actions {
    justify-content: flex-start;
  }

  .mail-workspace {
    grid-template-columns: minmax(330px, 0.9fr) minmax(360px, 1.1fr);
  }
}

@media (max-width: 900px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .app-sidebar {
    position: static;
    height: auto;
    grid-template-rows: auto auto auto auto;
  }

  .side-group-list {
    max-height: 220px;
  }

  .topbar-filter,
  .mail-workspace,
  .management-tools,
  .tool-form {
    grid-template-columns: 1fr;
  }

  .mail-list-pane {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .mail-workspace {
    overflow: visible;
  }

  .mail-list,
  .mail-detail-pane,
  .content-view {
    overflow: visible;
  }

  .topbar-actions {
    align-items: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
`;
