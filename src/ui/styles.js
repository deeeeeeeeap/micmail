export const APP_STYLES = String.raw`
:root {
  color-scheme: light;
  --bg: #f7f9fc;
  --bg-2: #eef3ff;
  --surface: rgba(255, 255, 255, 0.84);
  --surface-strong: #ffffff;
  --surface-soft: #f8fafc;
  --text: #172033;
  --muted: #64748b;
  --line: rgba(148, 163, 184, 0.24);
  --brand: #667eea;
  --brand-2: #764ba2;
  --brand-soft: rgba(102, 126, 234, 0.12);
  --pink: #f5576c;
  --green: #059669;
  --amber: #d97706;
  --red: #dc2626;
  --shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
  --shadow-soft: 0 6px 22px rgba(15, 23, 42, 0.06);
  --radius-lg: 24px;
  --radius: 16px;
  --radius-sm: 10px;
}

* {
  box-sizing: border-box;
}

html {
  min-height: 100%;
}

body {
  margin: 0;
  min-height: 100vh;
  color: var(--text);
  background:
    radial-gradient(circle at 8% 8%, rgba(102, 126, 234, 0.16), transparent 28%),
    radial-gradient(circle at 92% 12%, rgba(245, 87, 108, 0.12), transparent 28%),
    linear-gradient(135deg, #ffffff 0%, var(--bg) 48%, var(--bg-2) 100%);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
  line-height: 1.5;
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

.navbar {
  position: sticky;
  top: 0;
  z-index: 20;
  background: rgba(255, 255, 255, 0.82);
  border-bottom: 1px solid var(--line);
  backdrop-filter: blur(22px);
  box-shadow: 0 1px 18px rgba(15, 23, 42, 0.06);
}

.navbar-inner {
  width: min(1440px, calc(100vw - 32px));
  height: 66px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 220px;
}

.brand-icon {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: var(--brand);
  background: linear-gradient(145deg, rgba(102, 126, 234, 0.12), rgba(118, 75, 162, 0.08));
  border: 1px solid rgba(102, 126, 234, 0.12);
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.1);
}

.brand-title {
  margin: 0;
  font-size: 22px;
  line-height: 1;
  letter-spacing: -0.03em;
  background: linear-gradient(135deg, var(--brand), var(--brand-2));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.brand-subtitle {
  margin-top: 3px;
  color: var(--muted);
  font-size: 12px;
}

.nav-pills {
  display: flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: var(--shadow-soft);
}

.nav-pill {
  border: 0;
  border-radius: 999px;
  padding: 10px 18px;
  color: var(--muted);
  background: transparent;
  font-size: 13px;
  font-weight: 700;
  transition: transform 160ms ease, background 160ms ease, color 160ms ease;
}

.nav-pill.active {
  color: var(--brand);
  background: var(--brand-soft);
}

.nav-pill:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.9);
}

.shell {
  width: min(1440px, calc(100vw - 32px));
  margin: 24px auto 40px;
}

.hero {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 20px;
  align-items: end;
  margin-bottom: 18px;
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--pink);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.hero h1 {
  margin: 0;
  max-width: 820px;
  font-size: clamp(34px, 4.6vw, 68px);
  line-height: 0.98;
  letter-spacing: -0.06em;
}

.hero p {
  margin: 14px 0 0;
  max-width: 760px;
  color: var(--muted);
  font-size: 15px;
}

.hero-actions,
.toolbar,
.form-row,
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin: 18px 0;
}

.card,
.panel,
.metric,
.modal-card,
.toast {
  border: 1px solid rgba(255, 255, 255, 0.78);
  background: var(--surface);
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(20px);
}

.metric {
  min-height: 112px;
  padding: 18px;
  border-radius: var(--radius);
}

.metric-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.metric strong {
  display: block;
  margin-top: 12px;
  font-size: 34px;
  letter-spacing: -0.05em;
}

.metric small {
  display: block;
  margin-top: 4px;
  color: var(--muted);
}

.workspace {
  display: grid;
  grid-template-columns: minmax(310px, 0.9fr) minmax(380px, 1fr) minmax(430px, 1.12fr);
  gap: 16px;
  align-items: start;
}

.panel {
  min-width: 0;
  min-height: 720px;
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.panel-head {
  padding: 18px 20px;
  border-bottom: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.58);
}

.panel-head h2,
.panel-head h3 {
  margin: 0;
  font-size: 18px;
  letter-spacing: -0.02em;
}

.panel-head p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.panel-body {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.card {
  border-radius: var(--radius);
}

.soft-card {
  padding: 14px;
}

.stack {
  display: grid;
  gap: 12px;
}

details.card {
  overflow: hidden;
}

summary {
  list-style: none;
  padding: 15px 16px;
  cursor: pointer;
  font-weight: 800;
}

summary::-webkit-details-marker {
  display: none;
}

.collapsible-body {
  display: grid;
  gap: 12px;
  padding: 0 16px 16px;
}

label {
  display: grid;
  gap: 7px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 11px 12px;
  color: var(--text);
  background: rgba(255, 255, 255, 0.78);
  outline: none;
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

textarea {
  min-height: 94px;
  resize: vertical;
}

input:focus,
select:focus,
textarea:focus {
  border-color: rgba(102, 126, 234, 0.55);
  box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
  background: #fff;
}

.btn {
  border: 0;
  border-radius: 999px;
  padding: 10px 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  color: #334155;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: var(--shadow-soft);
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
  transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.11);
}

.btn.primary {
  color: #fff;
  background: linear-gradient(135deg, var(--brand), var(--brand-2));
}

.btn.danger {
  color: #fff;
  background: linear-gradient(135deg, #fb7185, var(--pink));
}

.btn.success {
  color: #fff;
  background: linear-gradient(135deg, #10b981, #059669);
}

.btn.small {
  min-height: 34px;
  padding: 7px 12px;
  font-size: 12px;
}

.group-list,
.account-list,
.message-list,
.sync-list {
  display: grid;
  gap: 10px;
}

.group-item,
.account-item,
.message-item,
.sync-item {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 14px;
  text-align: left;
  background: rgba(255, 255, 255, 0.72);
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.group-item:hover,
.account-item:hover,
.message-item:hover {
  transform: translateY(-1px);
  border-color: rgba(102, 126, 234, 0.26);
  box-shadow: var(--shadow-soft);
}

.group-item.active,
.account-item.active,
.message-item.active {
  border-color: rgba(102, 126, 234, 0.5);
  background: rgba(102, 126, 234, 0.1);
}

.item-top,
.message-top,
.detail-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.email,
.subject,
.detail-title {
  margin: 0;
  min-width: 0;
  font-weight: 850;
  letter-spacing: -0.02em;
  word-break: break-word;
}

.detail-title {
  font-size: clamp(22px, 2.2vw, 34px);
}

.meta,
.muted,
.preview {
  color: var(--muted);
  font-size: 13px;
}

.preview {
  margin-top: 8px;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 4px 10px;
  color: var(--muted);
  background: rgba(100, 116, 139, 0.1);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.pill.success {
  color: var(--green);
  background: rgba(5, 150, 105, 0.1);
}

.pill.waiting {
  color: var(--amber);
  background: rgba(217, 119, 6, 0.1);
}

.pill.error {
  color: var(--red);
  background: rgba(220, 38, 38, 0.1);
}

.detail-wrap {
  display: grid;
  gap: 14px;
}

.detail-frame {
  width: 100%;
  min-height: 420px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: #fff;
}

.empty {
  padding: 28px 18px;
  border: 1px dashed rgba(100, 116, 139, 0.26);
  border-radius: var(--radius);
  color: var(--muted);
  text-align: center;
  background: rgba(255, 255, 255, 0.5);
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
  padding: 14px 16px;
  border-radius: 16px;
  animation: fadeInUp 180ms ease both;
}

.toast.error {
  border-color: rgba(220, 38, 38, 0.22);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(10px);
}

.modal-card {
  width: min(520px, 100%);
  border-radius: 24px;
  padding: 22px;
  animation: fadeInUp 180ms ease both;
}

.modal-card h3 {
  margin: 0 0 8px;
}

.modal-card p {
  margin: 0 0 16px;
  color: var(--muted);
}

.login-shell {
  width: min(760px, calc(100vw - 32px));
  margin: 12vh auto;
}

.login-card {
  margin-top: 18px;
  padding: 22px;
}

.table-note {
  padding: 12px 14px;
  border-radius: 14px;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.6);
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1180px) {
  .workspace {
    grid-template-columns: 1fr;
  }

  .panel {
    min-height: auto;
  }
}

@media (max-width: 820px) {
  .navbar-inner,
  .shell {
    width: min(100vw - 20px, 1440px);
  }

  .navbar-inner {
    height: auto;
    padding: 10px 0;
    align-items: flex-start;
    flex-direction: column;
  }

  .nav-pills {
    width: 100%;
    overflow-x: auto;
  }

  .hero,
  .metrics {
    grid-template-columns: 1fr;
  }

  .hero h1 {
    font-size: 40px;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr;
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
