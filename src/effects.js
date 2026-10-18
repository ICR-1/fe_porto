// Efek visual tambahan untuk halaman utama (tanpa dependensi).
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const REVEAL = '.certificate-card, .foot-grid, .foot-bottom, .stat-card, .section-eyebrow';

// Tombol "magnet": sedikit tertarik ke kursor
const initMagnetic = () => {
  if (!finePointer() || reduceMotion()) return;
  document.querySelectorAll('#hero-button, .btn-ghost').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) * 0.22;
      const dy = (e.clientY - (r.top + r.height / 2)) * 0.32;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
};

// Reveal saat masuk viewport; elemen React yang muncul belakangan ikut dipantau
const initReveal = () => {
  if (reduceMotion() || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

  const seen = new WeakSet();
  const scan = (root) => {
    root.querySelectorAll(REVEAL).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      // stagger antar saudara
      const idx = Array.prototype.indexOf.call(el.parentElement ? el.parentElement.children : [], el);
      el.style.setProperty('--d', `${Math.min(idx, 6) * 0.08}s`);
      el.classList.add('reveal');
      io.observe(el);
    });
  };
  scan(document);
  new MutationObserver((muts) => {
    muts.forEach((m) => m.addedNodes.forEach((n) => {
      if (n.nodeType === 1) {
        if (n.matches && n.matches(REVEAL)) scan(n.parentElement || document);
        else scan(n);
      }
    }));
  }).observe(document.body, { childList: true, subtree: true });
};

export const initEffects = () => {
  initMagnetic();
  initReveal();
};
