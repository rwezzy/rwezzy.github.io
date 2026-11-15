// Keep the antialiased canvas sharp without letting a high-DPI, full-screen
// presentation allocate several times more pixels than the desk needs.
export function drawingBufferSize(width, height, pixelRatio = 1, pixelBudget = 1800000) {
  const w = Math.max(1, width), h = Math.max(1, height);
  const scale = Math.min(Math.max(1, pixelRatio), 1.5, Math.sqrt(pixelBudget / (w * h)));
  return { width: Math.max(1, Math.floor(w * scale)), height: Math.max(1, Math.floor(h * scale)) };
}
