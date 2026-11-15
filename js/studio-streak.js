// Calendar counter anchored to the streak supplied by Keith, not a Duolingo API.
const BASE_STREAK = 414;
const BASE_DAY = Date.UTC(2026, 10, 15);
const DAY_MS = 86_400_000;
const calendar = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric',
});

export function calculateStreak(now = new Date()) {
  const parts = Object.fromEntries(calendar.formatToParts(now).map(({ type, value }) => [type, value]));
  const day = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  return BASE_STREAK + Math.max(0, Math.round((day - BASE_DAY) / DAY_MS));
}

export function mountStreak(element) {
  const doc = element.ownerDocument;
  const win = doc.defaultView;
  const refresh = () => { element.textContent = String(calculateStreak()); };
  const onVisible = () => { if (!doc.hidden) refresh(); };
  refresh();
  // Date arithmetic handles missed days and daylight saving time. Focus and
  // visibility refresh immediately when a sleeping tab returns.
  const timer = win.setInterval(refresh, 60_000);
  win.addEventListener('focus', refresh);
  doc.addEventListener('visibilitychange', onVisible);
  return () => {
    win.clearInterval(timer);
    win.removeEventListener('focus', refresh);
    doc.removeEventListener('visibilitychange', onVisible);
  };
}
