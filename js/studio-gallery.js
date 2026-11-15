import { galleryItems, portraitItems } from './studio-gallery-data.js?v=reads3';

export const turnCard = (index, direction = 1) => ((index + direction) % (portraitItems.length + 1) + portraitItems.length + 1) % (portraitItems.length + 1);
export const galleryFor = category => category === 'All' ? [...galleryItems] : galleryItems.filter(item => item.category === category);
let sharedGallery;
function openGallery(from, category = 'All', itemId = null) {
  sharedGallery ||= createGallery(); sharedGallery.open(from, category, itemId);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function button(label, className, text = label) {
  const node = element('button', className, text); node.type = 'button'; node.setAttribute('aria-label', label); return node;
}
function photograph(item, lazy = true) {
  const image = element('img'); image.src = item.poster || (lazy && item.preview) || item.src; image.alt = item.alt;
  image.width = item.width; image.height = item.height; image.decoding = 'async';
  if (lazy) image.loading = 'lazy';
  return image;
}

// Native modal semantics keep the page behind the gallery inert. Gallery
// tiles load lazily, and video files are requested only when opened.
function createGallery() {
  const dialog = element('dialog', 's-gallery'); dialog.setAttribute('aria-labelledby', 's-gallery-title');
  const header = element('header', 's-gallery-header');
  const heading = element('div');
  heading.append(element('p', 's-gallery-eyebrow', 'KEITH RWEZAHURA / GALLERY'));
  const title = element('h1', '', 'Project pictures'); title.id = 's-gallery-title'; heading.append(title);
  const close = button('Close gallery', 's-gallery-close', 'Close ×');
  header.append(heading, close);
  const overview = element('section', 's-gallery-overview');
  const intro = element('div', 's-gallery-intro');
  intro.append(element('p', '', 'Projects, campus, volunteering and life outside engineering.'));
  const count = element('p', 's-gallery-count'); count.setAttribute('role', 'status'); intro.append(count);
  const filters = element('nav', 's-gallery-filters'); filters.setAttribute('aria-label', 'Filter gallery');
  const grid = element('div', 's-gallery-grid');
  overview.append(intro, filters, grid);
  const detail = element('section', 's-gallery-detail'); detail.hidden = true;
  const detailBar = element('div', 's-gallery-detail-bar');
  const back = button('Back to all pictures', 's-gallery-back', '← All pictures');
  const position = element('span', 's-gallery-position');
  const pager = element('div', 's-gallery-pager');
  const previous = button('Previous picture', '', '←'), next = button('Next picture', '', '→');
  pager.append(previous, position, next); detailBar.append(back, pager);
  const media = element('div', 's-gallery-media');
  const caption = element('div', 's-gallery-caption');
  const categoryLabel = element('p', 's-gallery-eyebrow'), itemTitle = element('h2'), description = element('p', 's-gallery-description');
  caption.append(categoryLabel, itemTitle, description); detail.append(detailBar, media, caption);
  dialog.append(header, overview, detail); document.body.append(dialog);
  let visible = galleryFor('All'), selected = -1, opener = null, selectedTile = null;
  const filterButtons = new Map();
  function stopVideo() {
    const video = media.querySelector('video');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    media.replaceChildren();
  }
  function showPicture(index, focus = true) {
    selected = (index + visible.length) % visible.length;
    const item = visible[selected]; stopVideo();
    overview.hidden = true; detail.hidden = false;
    if (item.type === 'video') {
      const video = element('video');
      Object.assign(video, { src: item.src, poster: item.poster, controls: true, muted: true, playsInline: true, preload: 'metadata' });
      video.setAttribute('muted', ''); video.setAttribute('aria-label', item.alt); media.append(video);
    } else media.append(photograph(item, false));
    categoryLabel.textContent = item.category + (item.type === 'video' ? ' / VIDEO · MUTED' : '');
    itemTitle.textContent = item.title;
    description.textContent = item.description || ''; description.hidden = !item.description;
    position.textContent = `${selected + 1} / ${visible.length}`;
    if (focus) back.focus({ preventScroll: true });
  }
  function showGrid() {
    stopVideo(); selected = -1; detail.hidden = true; overview.hidden = false;
    (selectedTile?.isConnected ? selectedTile : close).focus({ preventScroll: true });
  }
  function filterGallery(category) {
    visible = galleryFor(category); grid.replaceChildren(); selectedTile = null;
    for (const [name, control] of filterButtons) control.setAttribute('aria-pressed', String(name === category));
    const photos = visible.filter(item => item.type === 'image').length, videos = visible.length - photos;
    count.textContent = `${photos} photos${videos ? ` · ${videos} videos` : ''}`;
    visible.forEach((item, index) => {
      const tile = button(`View ${item.title}`, 's-gallery-tile', '');
      tile.dataset.galleryId = item.id;
      const imageWrap = element('span', 's-gallery-image'); imageWrap.append(photograph(item));
      if (item.type === 'video') imageWrap.append(element('span', 's-gallery-play', '▶ Video'));
      const label = element('span', 's-gallery-tile-label');
      label.append(element('small', '', item.category), element('strong', '', item.title));
      tile.append(imageWrap, label);
      tile.addEventListener('click', () => { selectedTile = tile; showPicture(index); }); grid.append(tile);
    });
  }
  for (const category of ['All', ...new Set(galleryItems.map(item => item.category))]) {
    const control = button(category === 'All' ? 'Show all pictures' : `Show ${category} pictures`, '', category);
    control.addEventListener('click', () => filterGallery(category));
    filterButtons.set(category, control); filters.append(control);
  }
  const closeGallery = () => dialog.close();
  close.addEventListener('click', closeGallery); back.addEventListener('click', showGrid);
  previous.addEventListener('click', () => showPicture(selected - 1, false));
  next.addEventListener('click', () => showPicture(selected + 1, false));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); selected >= 0 ? showGrid() : closeGallery();
    } else if (selected >= 0 && !event.target.closest('video') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation(); showPicture(selected + (event.key === 'ArrowRight' ? 1 : -1), false);
    }
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); selected >= 0 ? showGrid() : closeGallery(); });
  dialog.addEventListener('close', () => {
    stopVideo(); document.body.classList.remove('s-gallery-open');
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  });
  return {
    open(from, category = 'All', itemId = null) {
      opener = from; selected = -1; detail.hidden = true; overview.hidden = false;
      filterGallery(category); document.body.classList.add('s-gallery-open');
      dialog.showModal(); overview.scrollTop = 0; close.focus({ preventScroll: true });
      const index = visible.findIndex(item => item.id === itemId);
      if (index >= 0) {
        selectedTile = grid.children[index]; showPicture(index);
      }
    },
  };
}

export function mountPortraitStack(host) {
  if (!host || host.dataset.cardStack) return;
  host.dataset.cardStack = 'ready'; host.classList.add('s-portrait-stack');
  host.replaceChildren();
  const deck = element('div', 's-portrait-deck'); deck.setAttribute('aria-label', 'Portrait card stack');
  const cards = portraitItems.map((item, index) => {
    const card = button(`Portrait ${index + 1}: show next card`, 's-portrait-card', '');
    card.append(photograph(item, false)); return card;
  });
  const galleryCard = button('Open project pictures', 's-portrait-card s-portrait-gallery', '');
  const preview = element('span', 's-portrait-mosaic'); preview.setAttribute('aria-hidden', 'true');
  for (const id of ['personal-robotics-desk', 'personal-viam-hackathon-win', 'ngamba-island-sanctuary-group', 'urban-arbor-planting']) {
    const image = photograph(galleryItems.find(item => item.id === id)); image.alt = ''; preview.append(image);
  }
  const galleryLabel = element('span', 's-portrait-gallery-label');
  galleryLabel.append(element('small', '', 'THE FULL GALLERY'), element('strong', '', 'Project pictures'), element('span', '', 'Open the gallery ↗'));
  galleryCard.append(preview, galleryLabel); cards.push(galleryCard); deck.append(...cards);
  const controls = element('div', 's-portrait-controls');
  const previous = button('Previous portrait card', '', '←'), next = button('Next portrait card', '', '→');
  const counter = element('span', 's-portrait-count'); counter.setAttribute('role', 'status');
  controls.append(previous, counter, next);
  const hint = element('figcaption', 's-portrait-hint', 'Click a portrait to turn the next card.');
  host.append(deck, controls, hint);
  let current = 0, turning = false, pointer = null, ignoreClick = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function update() {
    cards.forEach((card, index) => {
      const depth = (index - current + cards.length) % cards.length;
      card.dataset.depth = String(depth); card.disabled = depth !== 0;
      card.setAttribute('aria-hidden', String(depth !== 0));
    });
    counter.textContent = `${String(current + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
    hint.textContent = current === portraitItems.length ? 'Projects, people and the days around them.' : 'Click a portrait to turn the next card.';
  }
  async function advance(direction = 1) {
    if (turning) return;
    turning = true; const old = cards[current], restoreFocus = document.activeElement === old;
    let animation;
    if (!reduced.matches && old.animate) {
      animation = old.animate([{ transform: 'translateX(0) rotate(0deg)', opacity: 1 }, { transform: `translateX(${-direction * 35}%) rotate(${-direction * 12}deg)`, opacity: 0 }], { duration: 220, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      try { await animation.finished; } catch (_) { /* Reduced/closed views can cancel a frame. */ }
    }
    current = turnCard(current, direction); update(); animation?.cancel();
    if (restoreFocus) cards[current].focus({ preventScroll: true });
    turning = false;
  }
  cards.forEach((card, index) => {
    card.addEventListener('click', event => {
      if (event.detail && performance.now() < ignoreClick) return;
      if (index === portraitItems.length) openGallery(card);
      else advance();
    });
  });
  previous.addEventListener('click', () => advance(-1)); next.addEventListener('click', () => advance(1));
  host.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); advance(event.key === 'ArrowLeft' ? -1 : 1); }
  });
  deck.addEventListener('pointerdown', event => { pointer = { x: event.clientX, y: event.clientY }; });
  deck.addEventListener('pointercancel', () => { pointer = null; });
  deck.addEventListener('pointerup', event => {
    if (!pointer) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y; pointer = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) { ignoreClick = performance.now() + 500; advance(dx < 0 ? 1 : -1); }
  });
  update();
}

if (typeof document !== 'undefined') {
  mountPortraitStack(document.querySelector('.intro__side .portrait'));
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-gallery-category], [data-gallery-item]');
    if (!trigger || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const item = galleryItems.find(item => item.id === trigger.dataset.galleryItem);
    const category = trigger.dataset.galleryCategory || item?.category || 'All';
    if (!galleryFor(category).length) return;
    event.preventDefault(); openGallery(trigger, category, item?.id);
  });
}
