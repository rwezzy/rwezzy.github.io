import { applyGesture, classifyGesture, gesturePath, CHANNELS, INITIAL_TV_STATE } from './omniring-gestures.js?v=tv1';

export function mountOmniRingDemo(root) {
  const pad = root.querySelector('.or-gesture-pad'), canvas = root.querySelector('.or-room-canvas');
  if (!pad || !canvas || root.dataset.gesturesMounted) return () => {};
  root.dataset.gesturesMounted = 'true';
  const context = pad.getContext('2d');
  const status = root.querySelector('[data-gesture-status]');
  const loading = root.querySelector('[data-room-loading]'), error = root.querySelector('[data-room-error]');
  let state = { ...INITIAL_TV_STATE }, points = [], pointer = null, lastGesture = null;
  let width = 320, height = 220, visible = false, disposed = false, graphicsFailed = false, room = null, starting = null;
  const listeners = [];
  const listen = (target, event, callback, options) => { target.addEventListener(event, callback, options); listeners.push(() => target.removeEventListener(event, callback, options)); };
  const say = message => { if (status) status.textContent = message; };
  const showState = () => {
    const power = root.querySelector('[data-tv-power]'), volume = root.querySelector('[data-tv-volume]'), channel = root.querySelector('[data-tv-channel]');
    if (power) power.textContent = state.power ? 'On' : 'Standby';
    if (volume) volume.textContent = `${state.volume}%`;
    if (channel) channel.textContent = `${String(state.channel + 1).padStart(2, '0')} · ${CHANNELS[state.channel]}`;
    root.dataset.tvPower = state.power ? 'on' : 'off';
    if (!graphicsFailed) room?.update({ ...state });
  };
  function paint() {
    if (!context) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#121e2a'; context.fillRect(0, 0, width, height);
    context.strokeStyle = '#213649'; context.lineWidth = 1;
    for (let x = 20; x < width; x += 24) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
    for (let y = 20; y < height; y += 24) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
    if (!points.length) {
      context.textAlign = 'center'; context.fillStyle = '#bed0df'; context.font = '500 14px system-ui, sans-serif';
      context.fillText('Draw a gesture here', width / 2, height / 2 - 6);
      context.font = '12px system-ui, sans-serif'; context.fillStyle = '#90a9bc';
      context.fillText('Release to send it to the room', width / 2, height / 2 + 18);
      return;
    }
    context.strokeStyle = lastGesture ? '#9fe7e4' : '#b8b1ff'; context.lineWidth = 3.5; context.lineJoin = 'round'; context.lineCap = 'round';
    context.shadowColor = '#80b9db'; context.shadowBlur = 6;
    context.beginPath(); points.forEach((point, i) => i ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.stroke();
    context.shadowBlur = 0;
    context.fillStyle = '#f0f7ff'; context.beginPath(); context.arc(points[0].x, points[0].y, 4, 0, Math.PI * 2); context.fill();
  }
  function resize() {
    const bounds = pad.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const scaleX = bounds.width / width, scaleY = bounds.height / height;
    points = points.map(point => ({ x: point.x * scaleX, y: point.y * scaleY }));
    width = bounds.width; height = bounds.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    pad.width = Math.round(width * dpr); pad.height = Math.round(height * dpr);
    paint(); room?.resize();
  }
  function setActive() { room?.setActive(visible && !document.hidden && !graphicsFailed); }
  function showGraphicsFailure(failure) {
    if (disposed) return;
    graphicsFailed = true; room?.setActive(false);
    if (loading) loading.hidden = true;
    if (error) { error.hidden = false; error.textContent = 'The 3D room is unavailable in this browser. You can still try the simulated gestures and read the TV state below.'; }
    console.warn('OmniRing concept scene unavailable:', failure);
  }
  async function start() {
    if (disposed || starting) return starting;
    if (loading) loading.hidden = false;
    starting = import('./omniring-living-room.js?v=tv1').then(({ createLivingRoom }) => createLivingRoom(canvas, { onError: showGraphicsFailure })).then(instance => {
      if (disposed) { instance.dispose(); return; }
      room = instance; room.update({ ...state }); setActive(); room.resize();
      if (loading) loading.hidden = true;
    }).catch(showGraphicsFailure);
    return starting;
  }
  function commit() {
    lastGesture = classifyGesture(points, { minExtent: Math.max(24, Math.min(width, height) * .12) });
    const next = applyGesture(state, lastGesture); state = next.state;
    root.dataset.lastGesture = lastGesture || 'unrecognized';
    say(next.message); showState(); paint();
  }
  function position(event) { const rect = pad.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  function addPoint(event) {
    const point = position(event), previous = points.at(-1);
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 1) points.push(point);
  }
  function cancel() {
    if (pointer === null) return;
    const id = pointer; pointer = null;
    if (pad.hasPointerCapture?.(id)) pad.releasePointerCapture(id);
    points = []; lastGesture = null; say('Gesture cancelled. Draw again when ready.'); paint();
  }
  pad.style.touchAction = 'none';
  listen(pad, 'pointerdown', event => {
    if (pointer !== null || event.isPrimary === false || event.button !== 0) return;
    event.preventDefault(); pointer = event.pointerId; points = []; lastGesture = null;
    pad.setPointerCapture(pointer); addPoint(event); say('Drawing… release to recognize the gesture.'); paint(); start();
  });
  listen(pad, 'pointermove', event => {
    if (event.pointerId !== pointer) return;
    event.preventDefault();
    for (const sample of event.getCoalescedEvents?.() || [event]) addPoint(sample);
    addPoint(event); paint();
  });
  listen(pad, 'pointerup', event => {
    if (event.pointerId !== pointer) return;
    addPoint(event); const id = pointer; pointer = null;
    if (pad.hasPointerCapture(id)) pad.releasePointerCapture(id);
    commit();
  });
  listen(pad, 'pointercancel', cancel);
  listen(pad, 'lostpointercapture', cancel);
  for (const button of root.querySelectorAll('[data-gesture]')) listen(button, 'click', () => {
    cancel(); resize(); points = gesturePath(button.dataset.gesture, width, height); commit(); start();
  });
  const reset = root.querySelector('[data-gesture-reset]');
  if (reset) listen(reset, 'click', () => {
    cancel(); state = { ...INITIAL_TV_STATE }; points = []; lastGesture = null;
    root.dataset.lastGesture = ''; say('Room reset. Draw a circle to turn on the TV.'); showState(); paint();
  });
  const sizeObserver = new ResizeObserver(resize); sizeObserver.observe(pad);
  const visibilityObserver = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) { resize(); start(); }
    setActive();
  }, { rootMargin: '120px' });
  visibilityObserver.observe(canvas);
  listen(document, 'visibilitychange', () => { if (document.hidden) cancel(); setActive(); });
  listen(window, 'pagehide', event => { if (event.persisted) room?.setActive(false); else dispose(); });
  listen(window, 'pageshow', () => { setActive(); resize(); });
  function dispose() {
    if (disposed) return;
    disposed = true; cancel(); sizeObserver.disconnect(); visibilityObserver.disconnect();
    listeners.forEach(remove => remove()); room?.dispose();
    delete root.dataset.gesturesMounted;
  }
  resize(); showState(); say('Draw a circle to turn on the TV.');
  return dispose;
}

const root = document.querySelector('#demo-gesture[data-living-room]');
if (root) mountOmniRingDemo(root);
