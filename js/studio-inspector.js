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

  let currentId = null;
  let selectedId = null;
  let exploded = false;
  let returnFocus = null;
  let disposed = false;
  const parts = new Map();

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
  }

  function setExploded(value) {
    if (disposed) return;
    exploded = Boolean(value);
    toggle.textContent = exploded ? 'Assemble model' : 'Explode parts';
    toggle.setAttribute('aria-pressed', String(exploded));
    stateLabel.textContent = exploded ? 'Exploded' : 'Assembled';
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
  }

  function hide() {
    if (disposed || panel.hidden) return;
    const restore = panel.contains(document.activeElement);
    panel.hidden = true;
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
    parts.clear();
  }

  return { show, selectPart, setExploded, hide, dispose };
}
