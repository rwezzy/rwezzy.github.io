(() => {
 const key='studio-preview-theme';
 let theme='dark';
 try { const saved=localStorage.getItem(key); if(saved==='light'||saved==='dark')theme=saved; } catch {}
 document.documentElement.dataset.theme=theme;
 document.addEventListener('DOMContentLoaded',()=>{
  const button=document.querySelector('#theme-toggle');
  const sync=()=>{
   const dark=document.documentElement.dataset.theme==='dark';
   button.textContent=dark?'Light mode':'Dark mode';
   button.setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme');
   button.setAttribute('aria-pressed',String(dark));
  };
  sync();
  button.addEventListener('click',()=>{
   const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
   document.documentElement.dataset.theme=next;
   try {localStorage.setItem(key,next);} catch {}
   sync(); window.dispatchEvent(new Event('studio-theme-change'));
  });
 });
})();
