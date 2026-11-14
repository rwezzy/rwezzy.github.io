/**
 * What's on the laptop: a music player (Enya, by name only: no logos or cover art),
 * a circuit worked through by hand, and the IK code that moves the arm.
 */
const TRACKS = [['Orinoco Flow', 266], ['Only Time', 218], ['Caribbean Blue', 239], ['Book of Days', 176]];
const SERIF = 'Fraunces, Georgia, serif', SANS = 'Figtree, system-ui, sans-serif', MONO = '"JetBrains Mono", Consolas, monospace';

function rounded(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const time = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function drawLaptopScreen(canvas, seconds) {
  const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  g.fillStyle = '#0e1015'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#16181f'; g.fillRect(0, 0, W, 44);
  g.fillStyle = '#9aa3b5'; g.font = `500 22px ${MONO}`; g.fillText('keith@omen  ~/lite6-den', 24, 30);
  g.textAlign = 'right'; g.fillText(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), W - 24, 30); g.textAlign = 'left';

  // Left: the music player.
  const L = { x: 24, y: 64, w: 640, h: H - 88 };
  g.fillStyle = '#14161c'; rounded(g, L.x, L.y, L.w, L.h, 18); g.fill();
  const art = g.createLinearGradient(L.x + 40, L.y + 40, L.x + 360, L.y + 360);
  art.addColorStop(0, '#2b6f73'); art.addColorStop(0.5, '#6aa2a0'); art.addColorStop(1, '#e7c58f');
  g.fillStyle = art; rounded(g, L.x + 40, L.y + 40, 300, 300, 14); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3;
  for (let k = 0; k < 6; k += 1) { g.beginPath(); g.arc(L.x + 190, L.y + 190, 30 + k * 22, 0, Math.PI * 2); g.globalAlpha = 0.5 - k * 0.07; g.stroke(); }
  g.globalAlpha = 1;
  const index = Math.floor(seconds / 40) % TRACKS.length, [title, length] = TRACKS[index], position = (seconds * 1.6) % length;
  g.fillStyle = '#7d8699'; g.font = `600 20px ${SANS}`; g.fillText('NOW PLAYING', L.x + 370, L.y + 70);
  g.fillStyle = '#f4f1ea'; g.font = `italic 400 54px ${SERIF}`; g.fillText(title, L.x + 370, L.y + 140);
  g.fillStyle = '#b8c0cf'; g.font = `500 30px ${SANS}`; g.fillText('Enya', L.x + 370, L.y + 186);
  g.fillStyle = '#2a2e38'; rounded(g, L.x + 40, L.y + 380, 560, 8, 4); g.fill();
  g.fillStyle = '#58d6a5'; rounded(g, L.x + 40, L.y + 380, 560 * position / length, 8, 4); g.fill();
  g.fillStyle = '#7d8699'; g.font = `500 20px ${MONO}`; g.fillText(time(position), L.x + 40, L.y + 420); g.textAlign = 'right'; g.fillText(time(length), L.x + 600, L.y + 420); g.textAlign = 'left';
  g.fillStyle = '#f4f1ea';
  g.beginPath(); g.arc(L.x + 320, L.y + 480, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#14161c'; g.fillRect(L.x + 308, L.y + 464, 8, 32); g.fillRect(L.x + 324, L.y + 464, 8, 32);
  g.fillStyle = '#b8c0cf';
  for (const dir of [-1, 1]) { g.beginPath(); const cx = L.x + 320 + dir * 110; g.moveTo(cx + dir * 14, L.y + 480); g.lineTo(cx - dir * 10, L.y + 464); g.lineTo(cx - dir * 10, L.y + 496); g.fill(); }
  g.fillStyle = '#7d8699'; g.font = `600 18px ${SANS}`; g.fillText('UP NEXT', L.x + 40, L.y + 580);
  TRACKS.filter((_, k) => k !== index).forEach(([name], k) => {
    g.fillStyle = '#d6dbe5'; g.font = `500 26px ${SANS}`; g.fillText(name, L.x + 40, L.y + 630 + k * 54);
    g.fillStyle = '#6b7385'; g.font = `400 22px ${SANS}`; g.fillText('Enya', L.x + 360, L.y + 630 + k * 54);
  });
  // A small live spectrum.
  for (let k = 0; k < 40; k += 1) {
    const h = 12 + Math.abs(Math.sin(seconds * 2.1 + k * 0.7) * Math.cos(k * 0.31 + seconds)) * 60;
    g.fillStyle = `rgba(88,214,165,${0.35 + h / 160})`; g.fillRect(L.x + 40 + k * 14, L.y + L.h - 30 - h, 9, h);
  }

  // Right top: the circuit, worked through.
  const R = { x: 688, y: 64, w: W - 712, h: 470 };
  g.fillStyle = '#f3efe4'; rounded(g, R.x, R.y, R.w, R.h, 14); g.fill();
  g.strokeStyle = '#222'; g.lineWidth = 3; g.fillStyle = '#222';
  const ox = R.x + 50, oy = R.y + 70;
  const line = (a, b, c, d) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); };
  const resistor = (x, y) => { g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k += 1) g.lineTo(x + 10 + k * 13, y + (k % 2 ? 10 : -10)); g.lineTo(x + 90, y); g.stroke(); };
  g.beginPath(); g.arc(ox, oy + 80, 24, 0, Math.PI * 2); g.stroke(); g.font = `italic 600 22px ${SERIF}`; g.fillText('vs', ox - 12, oy + 87);
  line(ox, oy + 56, ox, oy); line(ox, oy, ox + 40, oy); resistor(ox + 40, oy); line(ox + 130, oy, ox + 200, oy);
  g.fillText('R1', ox + 70, oy - 18); g.beginPath(); g.arc(ox + 200, oy, 5, 0, Math.PI * 2); g.fill(); g.fillText('v1', ox + 190, oy - 14);
  line(ox + 200, oy, ox + 200, oy + 60); line(ox + 182, oy + 60, ox + 218, oy + 60); line(ox + 182, oy + 72, ox + 218, oy + 72); line(ox + 200, oy + 72, ox + 200, oy + 160);
  g.fillText('C1', ox + 226, oy + 74);
  line(ox + 200, oy, ox + 240, oy); resistor(ox + 240, oy); line(ox + 330, oy, ox + 380, oy); g.fillText('R2', ox + 270, oy - 18);
  g.beginPath(); g.moveTo(ox + 380, oy - 40); g.lineTo(ox + 380, oy + 40); g.lineTo(ox + 450, oy); g.closePath(); g.stroke();
  g.font = `600 18px ${MONO}`; g.fillText('+', ox + 386, oy - 12); g.fillText('−', ox + 386, oy + 26);
  line(ox + 450, oy, ox + 500, oy); g.font = `italic 600 22px ${SERIF}`; g.fillText('vout', ox + 470, oy - 14);
  line(ox, oy + 104, ox, oy + 160); line(ox, oy + 160, ox + 420, oy + 160);
  for (let k = 0; k < 3; k += 1) line(ox + 400 + k * 4, oy + 166 + k * 7, ox + 440 - k * 4, oy + 166 + k * 7);
  g.font = `italic 400 25px ${SERIF}`;
  [
    'KCL at v1:  (v1 − vs)/R1 + C1·dv1/dt + (v1 − vout)/R2 = 0',
    'H(s) = vout / vs = 1 / (1 + s·R1·C1)        (buffered)',
    'f_c = 1 / (2π·R1·C1) = 1/(2π · 10 kΩ · 10 nF) ≈ 1.59 kHz',
  ].forEach((text, k) => g.fillText(text, R.x + 40, R.y + 290 + k * 38));
  // Bode magnitude.
  const B = { x: R.x + R.w - 300, y: R.y + 26, w: 270, h: 150 };
  g.strokeStyle = '#999'; g.lineWidth = 1.5; g.strokeRect(B.x, B.y, B.w, B.h);
  g.strokeStyle = '#c0392b'; g.lineWidth = 3; g.beginPath();
  for (let k = 0; k <= 100; k += 1) {
    const f = 10 ** (1 + k / 100 * 4), mag = -10 * Math.log10(1 + (f / 1590) ** 2), x = B.x + k / 100 * B.w, y = B.y + 12 + (-mag / 50) * (B.h - 24);
    if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke(); g.fillStyle = '#555'; g.font = `500 15px ${MONO}`; g.fillText('|H| dB', B.x + 6, B.y + B.h - 8); g.fillText('−3 dB @ 1.59 kHz', B.x + 90, B.y + 30);

  // Right bottom: the code that moves the arm.
  const C = { x: 688, y: 552, w: W - 712, h: H - 576 };
  g.fillStyle = '#12141a'; rounded(g, C.x, C.y, C.w, C.h, 14); g.fill();
  g.fillStyle = '#6b7385'; g.font = `500 18px ${MONO}`; g.fillText('js/den/lite6.js', C.x + 24, C.y + 34);
  const code = [
    ['#c792ea', 'export function ', '#82aaff', 'inverse', '#d6deeb', '(target, seed) {'],
    ['#d6deeb', '  // damped least squares: dq = Jᵀ(JJᵀ + λ²I)⁻¹ e'],
    ['#c792ea', '  for ', '#d6deeb', '(let step = 0; step < 160; step++) {'],
    ['#d6deeb', '    const e = ', '#82aaff', 'error', '#d6deeb', '(forward(q).tcp, target);'],
    ['#d6deeb', '    if (', '#82aaff', 'norm', '#d6deeb', '(e) < ', '#f78c6c', '2e-4', '#d6deeb', ') break;'],
    ['#d6deeb', '    const J = ', '#82aaff', 'jacobian', '#d6deeb', '(q);  ', '#637777', '// 6 x 6'],
    ['#d6deeb', '    q = ', '#82aaff', 'clamp', '#d6deeb', '(q.map((v, j) => v + dq[j]));'],
    ['#d6deeb', '  }'],
  ];
  code.forEach((parts, row) => {
    let x = C.x + 24;
    for (let k = 0; k < parts.length; k += 2) {
      g.fillStyle = parts[k]; g.font = `400 22px ${MONO}`; g.fillText(parts[k + 1], x, C.y + 76 + row * 34); x += g.measureText(parts[k + 1]).width;
    }
  });
  if (Math.floor(seconds * 2) % 2) { g.fillStyle = '#82aaff'; g.fillRect(C.x + 70, C.y + 76 + 7 * 34 - 20, 12, 26); }
}

export function drawKeyboard(canvas) {
  const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  g.fillStyle = '#121317'; g.fillRect(0, 0, W, H);
  const rows = [15, 14, 14, 13, 12], gap = 6, keyH = (H - 40 - gap * 6) / 6;
  for (let r = 0; r < 6; r += 1) {
    const count = r === 5 ? 9 : rows[r] ?? 12, y = 20 + r * (keyH + gap), width = (W * 0.78 - 30 - gap * (count - 1)) / count;
    for (let k = 0; k < count; k += 1) {
      const w = r === 5 && k === 4 ? width * 4.5 : width, x = 15 + k * (width + gap) + (r === 5 && k > 4 ? width * 3.5 : 0);
      g.fillStyle = '#1e2026'; rounded(g, x, y, w, keyH, 6); g.fill();
      g.strokeStyle = 'rgba(255,236,214,.55)'; g.lineWidth = 1.2; rounded(g, x + 1, y + 1, w - 2, keyH - 2, 5); g.stroke();
    }
  }
  // Number pad on the right, like a 16-inch Omen.
  for (let r = 0; r < 5; r += 1) for (let k = 0; k < 4; k += 1) {
    const x = W * 0.8 + k * ((W * 0.19) / 4), y = 20 + (r + 1) * (keyH + gap), w = W * 0.19 / 4 - gap;
    g.fillStyle = '#1e2026'; rounded(g, x, y, w, keyH, 6); g.fill();
    g.strokeStyle = 'rgba(255,236,214,.55)'; rounded(g, x + 1, y + 1, w - 2, keyH - 2, 5); g.stroke();
  }
}
