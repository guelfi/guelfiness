(function () {
  'use strict';

  var THEME_KEY = 'guelfiness-theme';
  var root = document.documentElement;

  // ---------------- Scroll offset (header fixo, 2 linhas) ----------------
  var siteHeader = document.querySelector('.site-header');
  function updateScrollOffset() {
    if (!siteHeader) return;
    root.style.scrollPaddingTop = (siteHeader.offsetHeight + 12) + 'px';
  }
  updateScrollOffset();
  window.addEventListener('resize', updateScrollOffset);
  window.addEventListener('load', updateScrollOffset);

  // ---------------- Carrossel infinito do menu (mobile) ----------------
  // 3 cópias dos links em fila (.nav-set); rola sozinho, arrastar com o dedo
  // assume o controle, e 3s depois de soltar (clicando ou não) volta a girar.
  // No desktop (>=960px) só a 1ª cópia é exibida, centralizada — sem carrossel.
  (function () {
    var navScroll = document.getElementById('navScroll');
    if (!navScroll) return;
    var sets = navScroll.querySelectorAll('.nav-set');
    if (sets.length < 3) return;

    var CAROUSEL_BREAKPOINT = 960;
    var SPEED = 0.55;
    var RESUME_DELAY = 3000;
    var setWidth = 0;
    var paused = false;
    var resumeTimer = null;

    function isCarouselActive() {
      return window.innerWidth < CAROUSEL_BREAKPOINT;
    }

    function measure() {
      setWidth = sets[0].offsetWidth;
      if (setWidth > 0 && isCarouselActive()) {
        navScroll.scrollLeft = setWidth;
      }
    }

    function wrap() {
      if (setWidth <= 0) return;
      if (navScroll.scrollLeft >= setWidth * 2) navScroll.scrollLeft -= setWidth;
      else if (navScroll.scrollLeft <= 0) navScroll.scrollLeft += setWidth;
    }

    function tick() {
      if (isCarouselActive() && !paused) {
        navScroll.scrollLeft += SPEED;
        wrap();
      }
      requestAnimationFrame(tick);
    }

    function pause() {
      paused = true;
      if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
    }
    function scheduleResume() {
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(function () { paused = false; }, RESUME_DELAY);
    }

    navScroll.addEventListener('pointerdown', pause);
    navScroll.addEventListener('touchstart', pause, { passive: true });
    navScroll.addEventListener('pointerup', scheduleResume);
    navScroll.addEventListener('touchend', scheduleResume, { passive: true });
    navScroll.addEventListener('touchcancel', scheduleResume, { passive: true });
    navScroll.addEventListener('scroll', wrap);
    window.addEventListener('resize', measure);
    window.addEventListener('load', measure);

    measure();
    requestAnimationFrame(tick);
  })();

  // ---------------- Theme toggle ----------------
  var themeToggle = document.getElementById('themeToggle');
  function currentTheme() {
    return root.getAttribute('data-theme') || 'dark';
  }
  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      setTheme(currentTheme() === 'light' ? 'dark' : 'light');
    });
  }


  // ---------------- Project filter ----------------
  var filterButtons = document.querySelectorAll('.filter-btn');
  var projectCards = document.querySelectorAll('.project-card');
  filterButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filterButtons.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var filter = btn.getAttribute('data-filter');
      projectCards.forEach(function (card) {
        var status = card.getAttribute('data-status');
        var show = filter === 'all' || filter === status;
        card.classList.toggle('hidden', !show);
      });
    });
  });

  // ---------------- Experience toggle ----------------
  var expToggle = document.getElementById('expToggle');
  var expMore = document.getElementById('exp-more');
  if (expToggle && expMore) {
    expToggle.addEventListener('click', function () {
      var open = expMore.classList.toggle('open');
      expToggle.textContent = open
        ? 'Ocultar trajetória completa'
        : 'Ver trajetória completa (1995 — 2013)';
    });
  }

  // ---------------- Footer year ----------------
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------------- Reveal on scroll ----------------
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }
})();
