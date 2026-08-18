(function () {
  'use strict';

  var THEME_KEY = 'guelfiness-theme';
  var root = document.documentElement;

  // ---------------- Scroll offset (header fixo, 2 linhas) ----------------
  var siteHeader = document.querySelector('.site-header');
  var siteFooter = document.querySelector('.site-footer');
  function updateScrollOffset() {
    if (!siteHeader) return;
    var offset = siteHeader.offsetHeight + 12;
    root.style.scrollPaddingTop = offset + 'px';
    // Garante espaço suficiente abaixo da última seção (Contato) para que
    // ela consiga rolar até ficar colada no header — sem isso, o navegador
    // bate no fim da página antes de completar o ajuste.
    if (siteFooter) siteFooter.style.paddingBottom = offset + 'px';
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
    var SPEED = 0.9;
    var RESUME_DELAY = 3000;
    var setWidth = 0;
    // Em vez de um par de flags "pausado/retomado" dependente de touchstart
    // sempre casar com touchend (o que falha em alguns navegadores mobile,
    // deixando o carrossel travado pra sempre), guardamos só o instante da
    // última interação e recalculamos "está pausado?" a cada quadro — assim
    // ele sempre se autorrecupera 3s depois da última interação real, não
    // importa se algum evento de "soltar" não disparar.
    var lastInteraction = 0;

    function isCarouselActive() {
      return window.innerWidth < CAROUSEL_BREAKPOINT;
    }
    function isPaused() {
      return lastInteraction > 0 && (Date.now() - lastInteraction) < RESUME_DELAY;
    }
    function markInteraction() {
      lastInteraction = Date.now();
    }

    function measure() {
      var w = sets[0].offsetWidth;
      if (w > 0) {
        setWidth = w;
        if (isCarouselActive()) navScroll.scrollLeft = setWidth;
      }
    }

    function wrap() {
      if (setWidth <= 0) return;
      if (navScroll.scrollLeft >= setWidth * 2) navScroll.scrollLeft -= setWidth;
      else if (navScroll.scrollLeft <= 0) navScroll.scrollLeft += setWidth;
    }

    function tick() {
      try {
        if (isCarouselActive() && !isPaused()) {
          navScroll.scrollLeft += SPEED;
          wrap();
        }
      } catch (e) { /* nunca deixa um erro pontual matar o loop */ }
      requestAnimationFrame(tick);
    }

    navScroll.addEventListener('pointerdown', markInteraction);
    navScroll.addEventListener('touchstart', markInteraction, { passive: true });
    navScroll.addEventListener('touchmove', markInteraction, { passive: true });
    navScroll.addEventListener('wheel', markInteraction, { passive: true });
    navScroll.addEventListener('scroll', wrap);
    window.addEventListener('resize', measure);
    window.addEventListener('load', measure);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measure);
    }
    setTimeout(measure, 300); // reflow tardio (fontes/imagens) em conexões lentas

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
