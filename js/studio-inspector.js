/* Modeless controls for the studio's 3D objects. Geometry stays in studio-scene. */
let inspectorSequence = 0;

export function createStudioInspector({
  onClose = () => {},
  onSelectPart = () => {},
  onToggleExploded = () => {},
  onOpenProject = () => {},
} = {}) {
  const prefix = `studio-inspector-${++inspectorSequence}`;
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (className, text) => {
    const node = element('button', className, text);
    node.type = 'button';
    return node;
  };

  const panel = element('section', 'studio-inspector');
  panel.hidden = true;
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-labelledby', `${prefix}-title`);

  const header = element('header', 'si-header');
  const heading = element('div', 'si-heading');
  const eyebrow = element('p', 'si-eyebrow', 'Object inspector');
  const title = element('h2', 'si-title');
  title.id = `${prefix}-title`;
  title.tabIndex = -1;
  heading.append(eyebrow, title);
  const close = button('si-close', '×');
  close.setAttribute('aria-label', 'Close object inspector');
  header.append(heading, close);

  const content = element('div', 'si-content');
  const description = element('p', 'si-description');
  const sectionHeading = element('div', 'si-section-heading');
  const partsLabel = element('h3', 'si-parts-title', 'Components');
  partsLabel.id = `${prefix}-parts-label`;
  const stateLabel = element('span', 'si-state');
  sectionHeading.append(partsLabel, stateLabel);
  const hint = element('p', 'si-hint', 'Choose a part here or in the model.');
  const partsList = element('div', 'si-parts');
  partsList.setAttribute('role', 'group');
  partsList.setAttribute('aria-labelledby', partsLabel.id);
  const detail = element('div', 'si-detail');
  detail.id = `${prefix}-detail`;
  detail.hidden = true;
  detail.setAttribute('aria-live', 'polite');
  detail.setAttribute('aria-atomic', 'true');
  const detailTitle = element('h3', 'si-detail-title');
  const detailDescription = element('p', 'si-detail-description');
  detail.append(detailTitle, detailDescription);
  content.append(description, sectionHeading, hint, partsList, detail);

  const footer = element('footer', 'si-footer');
  const toggle = button('si-toggle', 'Explode parts');
  toggle.setAttribute('aria-pressed', 'false');
  const project = button('si-project', 'View project ↗');
  footer.append(toggle, project);
  panel.append(header, content, footer);
  document.body.append(panel);

  // The accessible description lives in the panel. This visual duplicate never
  // intercepts a pointer or announces the same part a second time.
  const annotation = element('div', 'studio-annotation');
  annotation.hidden = true;
  annotation.setAttribute('aria-hidden', 'true');
  const svgElement = (tag, className) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    node.setAttribute('class', className);
    return node;
  };
  const leader = svgElement('svg', 'si-leader');
  leader.setAttribute('focusable', 'false');
  const leaderHalo = svgElement('path', 'si-leader-halo');
  const leaderLine = svgElement('path', 'si-leader-line');
  const leaderRing = svgElement('circle', 'si-leader-ring');
  leaderRing.setAttribute('r', '8');
  const leaderDot = svgElement('circle', 'si-leader-dot');
  leaderDot.setAttribute('r', '3.5');
  leader.append(leaderHalo, leaderLine, leaderRing, leaderDot);
  const annotationCard = element('div', 'si-annotation-card');
  const annotationLabel = element('span', 'si-annotation-label', 'Selected component');
  const annotationTitle = element('strong', 'si-annotation-title');
  const annotationDescription = element('p', 'si-annotation-description');
  annotationCard.append(annotationLabel, annotationTitle, annotationDescription);
  annotation.append(leader, annotationCard);
  document.body.append(annotation);

  let currentId = null;
  let selectedId = null;
  let exploded = false;
  let returnFocus = null;
  let disposed = false;
  let anchors = null;
  let annotationPartId = null;
  const parts = new Map();

  function updateAnnotation() {
    const part = parts.get(selectedId);
    const viewport = anchors?.viewport;
    const point = anchors?.parts?.find(item => String(item.id) === selectedId);
    if (disposed || panel.hidden || !exploded || !part || !point?.visible || !viewport ||
        ![point.x, point.y, viewport.left, viewport.top, viewport.width, viewport.height].every(Number.isFinite) ||
        viewport.width <= 0 || viewport.height <= 0) {
      annotation.hidden = true;
      return;
    }
    const screenWidth = globalThis.innerWidth || viewport.left + viewport.width;
    const screenHeight = globalThis.innerHeight || viewport.top + viewport.height;
    const bounds = {
      left: Math.max(0, viewport.left), top: Math.max(0, viewport.top),
      right: Math.min(screenWidth, viewport.left + viewport.width),
      bottom: Math.min(screenHeight, viewport.top + viewport.height),
    };
    const panelBounds = panel.getBoundingClientRect();
    const headerBounds = document.querySelector('.s-header')?.getBoundingClientRect();
    const inside = (rect, x, y, gap = 0) => x >= rect.left - gap && x <= rect.right + gap && y >= rect.top - gap && y <= rect.bottom + gap;
    // Never move the source dot to a convenient but false position. If the real
    // projected component is offscreen or covered by controls, omit the callout.
    if (!inside(bounds, point.x, point.y) || inside(panelBounds, point.x, point.y) ||
        (headerBounds && inside(headerBounds, point.x, point.y))) {
      annotation.hidden = true;
      return;
    }
    const padding = 14;
    const safe = { left: bounds.left + padding, top: bounds.top + padding, right: bounds.right - padding, bottom: bounds.bottom - padding };
    if (headerBounds && headerBounds.bottom > safe.top && headerBounds.top < safe.bottom) safe.top = headerBounds.bottom + padding;
    const mobile = screenWidth <= 760;
    if (mobile) safe.bottom = Math.min(safe.bottom, panelBounds.top - padding);
    else safe.right = Math.min(safe.right, panelBounds.left - padding);
    const availableWidth = safe.right - safe.left;
    const availableHeight = safe.bottom - safe.top;
    if (availableWidth < 144 || availableHeight < 72) {
      annotation.hidden = true;
      return;
    }

    if (annotationPartId !== selectedId) {
      annotationPartId = selectedId;
      annotationTitle.textContent = part.title;
      annotationDescription.textContent = part.description;
      annotationDescription.hidden = !part.description;
    }
    annotation.style.left = `${viewport.left}px`;
    annotation.style.top = `${viewport.top}px`;
    annotation.style.width = `${viewport.width}px`;
    annotation.style.height = `${viewport.height}px`;
    annotationCard.style.width = `${Math.min(mobile ? 184 : 236, availableWidth)}px`;
    annotation.hidden = false;
    const measured = annotationCard.getBoundingClientRect();
    const width = measured.width, height = measured.height;
    if (!width || !height || height > availableHeight) {
      annotation.hidden = true;
      return;
    }
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const gap = mobile ? 24 : 38;
    const projectedRect = item => {
      const rect = item.rect;
      if (rect && [rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite) && rect.right > rect.left && rect.bottom > rect.top) return rect;
      // Point-only clients still get a small protected region around the dot.
      return { left: item.x - 12, top: item.y - 12, right: item.x + 12, bottom: item.y + 12 };
    };
    const sourceBounds = projectedRect(point);
    const obstacles = anchors.parts.filter(item => item.visible && Number.isFinite(item.x) && Number.isFinite(item.y))
      .map(item => ({ ...projectedRect(item), selected: String(item.id) === selectedId }));
    const overlap = (a, b, margin = 8) => Math.max(0, Math.min(a.right, b.right + margin) - Math.max(a.left, b.left - margin)) *
      Math.max(0, Math.min(a.bottom, b.bottom + margin) - Math.max(a.top, b.top - margin));
    const left = sourceBounds.left - width - gap, right = sourceBounds.right + gap;
    const above = sourceBounds.top - height - gap, below = sourceBounds.bottom + gap;
    const centeredX = point.x - width / 2, centeredY = point.y - height / 2;
    const candidates = [
      { x: right, y: centeredY }, { x: left, y: centeredY },
      { x: centeredX, y: above }, { x: centeredX, y: below },
      { x: left, y: above }, { x: right, y: above },
      { x: left, y: below }, { x: right, y: below },
      // Large components can occupy all four immediate neighbours. Check the
      // free canvas corners too before accepting any overlap with another part.
      { x: safe.left, y: safe.top }, { x: safe.right - width, y: safe.top },
      { x: safe.left, y: safe.bottom - height }, { x: safe.right - width, y: safe.bottom - height },
    ].map(candidate => {
      const x = clamp(candidate.x, safe.left, safe.right - width);
      const y = clamp(candidate.y, safe.top, safe.bottom - height);
      const rect = { left: x, top: y, right: x + width, bottom: y + height };
      const coveredArea = obstacles.reduce((area, obstacle) => area + overlap(rect, obstacle) * (obstacle.selected ? 8 : 1), 0);
      const distance = Math.hypot(x + width / 2 - point.x, y + height / 2 - point.y);
      return { ...rect, score: distance + coveredArea * 20 + (inside(rect, point.x, point.y, 10) ? 100000 : 0) };
    });
    const box = candidates.reduce((best, candidate) => candidate.score < best.score ? candidate : best);
    annotationCard.style.left = `${box.left - viewport.left}px`;
    annotationCard.style.top = `${box.top - viewport.top}px`;

    const endpoints = [
      { x: box.left, y: clamp(point.y, box.top + 12, box.bottom - 12), dx: -16, dy: 0 },
      { x: box.right, y: clamp(point.y, box.top + 12, box.bottom - 12), dx: 16, dy: 0 },
      { x: clamp(point.x, box.left + 12, box.right - 12), y: box.top, dx: 0, dy: -16 },
      { x: clamp(point.x, box.left + 12, box.right - 12), y: box.bottom, dx: 0, dy: 16 },
    ];
    const end = endpoints.reduce((best, candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) < Math.hypot(best.x - point.x, best.y - point.y) ? candidate : best);
    const local = (x, y) => `${(x - viewport.left).toFixed(1)} ${(y - viewport.top).toFixed(1)}`;
    const path = `M ${local(point.x, point.y)} L ${local(end.x + end.dx, end.y + end.dy)} L ${local(end.x, end.y)}`;
    leader.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);
    leaderHalo.setAttribute('d', path);
    leaderLine.setAttribute('d', path);
    for (const dot of [leaderRing, leaderDot]) {
      dot.setAttribute('cx', String(point.x - viewport.left));
      dot.setAttribute('cy', String(point.y - viewport.top));
    }
  }

  // Scene projections use CSS client pixels, in the same space as a canvas's
  // getBoundingClientRect(). This method never invents or extrapolates anchors.
  function updateAnchors(payload) {
    if (disposed) return;
    anchors = payload && Array.isArray(payload.parts) ? payload : null;
    if (payload && Object.hasOwn(payload, 'selectedId')) selectPart(payload.selectedId);
    updateAnnotation();
  }

  function selectPart(id) {
    if (disposed) return;
    const nextId = id == null ? null : String(id);
    if (nextId !== null && !parts.has(nextId)) return;
    if (nextId === selectedId) return;
    selectedId = nextId;
    for (const [partId, part] of parts) {
      const selected = partId === selectedId;
      part.button.setAttribute('aria-pressed', String(selected));
      if (selected) part.button.setAttribute('aria-describedby', detail.id);
      else part.button.removeAttribute('aria-describedby');
    }
    const part = parts.get(selectedId);
    detail.hidden = !part;
    detailTitle.textContent = part?.title || '';
    detailDescription.textContent = part?.description || '';
    updateAnnotation();
  }

  function setExploded(value) {
    if (disposed) return;
    exploded = Boolean(value);
    toggle.textContent = exploded ? 'Assemble model' : 'Explode parts';
    toggle.setAttribute('aria-pressed', String(exploded));
    stateLabel.textContent = exploded ? 'Exploded' : 'Assembled';
    updateAnnotation();
  }

  function show({ id, title: objectTitle, description: objectDescription, parts: objectParts = [], exploded: isExploded = false } = {}) {
    if (disposed) return;
    if (panel.hidden) returnFocus = document.activeElement;
    currentId = id == null ? '' : String(id);
    panel.dataset.objectId = currentId;
    title.textContent = String(objectTitle || 'Object');
    close.setAttribute('aria-label', `Close ${title.textContent} inspector`);
    description.textContent = String(objectDescription || '');
    description.hidden = !description.textContent;
    parts.clear();
    annotationPartId = null;
    annotation.hidden = true;
    partsList.replaceChildren();
    selectedId = null;
    detail.hidden = true;
    detailTitle.textContent = '';
    detailDescription.textContent = '';

    for (const data of objectParts) {
      if (data?.id == null) continue;
      const partId = String(data.id);
      if (parts.has(partId)) continue;
      const partTitle = String(data.title || partId);
      const partDescription = String(data.description || '');
      const control = button('si-part');
      control.dataset.partId = partId;
      control.setAttribute('aria-pressed', 'false');
      const number = element('span', 'si-part-number', String(parts.size + 1).padStart(2, '0'));
      number.setAttribute('aria-hidden', 'true');
      const label = element('span', 'si-part-label', partTitle);
      const arrow = element('span', 'si-part-arrow', '↗');
      arrow.setAttribute('aria-hidden', 'true');
      control.append(number, label, arrow);
      control.addEventListener('click', () => {
        if (disposed || panel.hidden) return;
        selectPart(partId);
        onSelectPart(partId, currentId);
      });
      parts.set(partId, { button: control, title: partTitle, description: partDescription });
      partsList.append(control);
    }
    sectionHeading.hidden = parts.size === 0;
    hint.hidden = parts.size === 0;
    partsList.hidden = parts.size === 0;
    toggle.disabled = parts.size === 0;
    setExploded(isExploded);
    panel.hidden = false;
    content.scrollTop = 0;
    title.focus({ preventScroll: true });
    updateAnnotation();
  }

  function hide() {
    if (disposed || panel.hidden) return;
    const restore = panel.contains(document.activeElement);
    panel.hidden = true;
    annotation.hidden = true;
    anchors = null;
    if (restore && returnFocus?.isConnected && !returnFocus.disabled && !returnFocus.closest('[hidden], [inert]')) {
      returnFocus.focus?.({ preventScroll: true });
    }
    returnFocus = null;
  }

  function requestClose() {
    if (disposed || panel.hidden) return;
    hide();
    onClose(currentId);
  }
  function handleEscape(event) {
    if (panel.hidden || event.key !== 'Escape' || event.isComposing) return;
    // Consume this Escape before the page shell can also navigate home.
    event.preventDefault();
    event.stopPropagation();
    requestClose();
  }
  close.addEventListener('click', requestClose);
  toggle.addEventListener('click', () => {
    if (disposed || panel.hidden || toggle.disabled) return;
    setExploded(!exploded);
    onToggleExploded(exploded, currentId);
  });
  project.addEventListener('click', () => {
    if (disposed || panel.hidden) return;
    hide();
    onOpenProject(currentId);
  });
  document.addEventListener('keydown', handleEscape, true);

  function dispose() {
    if (disposed) return;
    hide();
    disposed = true;
    document.removeEventListener('keydown', handleEscape, true);
    panel.remove();
    annotation.remove();
    parts.clear();
  }

  return { show, selectPart, setExploded, updateAnchors, hide, dispose };
}
