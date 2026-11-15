/* Keep reading independent of graphics downloads. Demos load on explicit request. */
(() => {
  const mode = new URLSearchParams(location.search).get('mode');
  const lightweight = mode === 'lite' || (mode !== 'full' &&
    (navigator.connection?.saveData || matchMedia('(prefers-reduced-motion: reduce)').matches));
  document.documentElement.dataset.graphics = lightweight ? 'lite' : 'full';

  function defer(element, start, { label = 'Load interactive demo', detail = 'Loads graphics only when you choose to explore.' } = {}) {
    if (!element) return Promise.resolve().then(start);
    element.classList.add('s-demo-awaiting');
    const gate = document.createElement('div'); gate.className = 's-demo-gate';
    const text = document.createElement('p'); text.textContent = detail;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    const status = document.createElement('p'); status.className = 's-demo-load-status'; status.setAttribute('role', 'status');
    gate.append(text, button, status); element.append(gate);
    const host = element.closest('.pick,.ss-lab,.ss-hardware');
    const controls = host ? [...host.querySelectorAll('button,input,select')].filter(control => control !== button && !control.disabled) : [];
    controls.forEach(control => { control.disabled = true; });
    return new Promise((resolve, reject) => {
      button.addEventListener('click', async () => {
        button.disabled = true; button.textContent = 'Loading…'; status.textContent = 'Preparing the interactive view.';
        element.setAttribute('aria-busy', 'true');
        try {
          const result = await start();
          controls.forEach(control => { control.disabled = false; });
          gate.remove(); element.classList.remove('s-demo-awaiting');
          resolve(result);
        } catch (error) {
          button.hidden = true;
          status.textContent = 'The interactive view could not load. The project description and recorded evidence remain available.';
          reject(error);
        } finally { element.removeAttribute('aria-busy'); }
      }, { once: true });
    });
  }
  window.portfolioGraphics = { lightweight, defer };
  if (lightweight) {
    const stage = document.querySelector('.s-scene-wrap');
    const photo = document.createElement('img'); photo.src = 'assets/personal/robotics-desk.webp'; photo.alt = 'My physical robotics workspace, with the arm and SoundScope prototype'; photo.width = 1600; photo.height = 1200; photo.className = 's-lightweight-photo';
    stage?.append(photo);
    const status = document.querySelector('#s-status'); if (status) status.textContent = 'Lightweight view · all pages available';
  }
  document.querySelectorAll('.s-mode-link').forEach(link => {
    const update = () => { link.href = `?mode=${lightweight ? 'full' : 'lite'}${location.hash}`; };
    link.textContent = lightweight ? 'Enable 3D desk ↗' : 'Lightweight view ↗';
    update(); link.addEventListener('click', update);
    window.addEventListener('hashchange', update);
  });
})();
