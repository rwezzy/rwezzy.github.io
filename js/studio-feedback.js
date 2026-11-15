// Small, decorative icons keep labels readable and accessible.
(() => {
  // Keep the native pointer precise; the halo has no lag or trailing animation.
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const halo = document.createElement('span');
  halo.className = 's-pointer-halo';
  halo.setAttribute('aria-hidden', 'true');
  document.body.append(halo);
  const hideHalo = () => halo.classList.remove('is-visible');
  document.addEventListener('pointermove', event => {
    const target = event.target;
    const control = target.closest('a[href],button:not(:disabled),summary,[role="button"],input,select');
    const sceneHit = target.id === 's-scene' && target.style.cursor === 'pointer';
    if (!finePointer.matches || event.pointerType === 'touch' || (!control && !sceneHit)) {
      hideHalo(); return;
    }
    halo.style.transform = `translate3d(${event.clientX}px,${event.clientY}px,0)`;
    halo.classList.add('is-visible');
  }, { passive: true });
  document.addEventListener('pointerleave', hideHalo);
  document.addEventListener('pointerdown', hideHalo, { passive: true });
  document.addEventListener('scroll', hideHalo, { passive: true, capture: true });
  document.addEventListener('keydown', hideHalo);
  window.addEventListener('blur', hideHalo);
  finePointer.addEventListener('change', hideHalo);
  const shapes = {
    resume: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/>',
    linkedin: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 10v7M12 17v-7M12 13c0-4 5-4 5 0v4"/><circle cx="8" cy="7" r=".7"/>',
    contact: '<rect x="3" y="5" width="18" height="14" rx="4"/><path d="m4 7 8 6 8-6"/>'
  };
  document.querySelectorAll('.s-reader-actions a,.s-home-links a').forEach(link => {
    const href = link.getAttribute('href') || '';
    const key = href.includes('resume.pdf') ? 'resume' : href.includes('linkedin.com') ? 'linkedin' : href.startsWith('mailto:') ? 'contact' : null;
    if (!key) return;
    link.insertAdjacentHTML('afterbegin', `<svg class="s-link-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${shapes[key]}</svg>`);
  });
  document.addEventListener('pointerup', event => {
    if (event.pointerType !== 'touch' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (event.target.closest('button,a')) navigator.vibrate?.(8);
  }, { passive: true });
})();
