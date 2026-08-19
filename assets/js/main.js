(function () {
  'use strict';

  var THEME_KEY = 'guelfiness-theme';
  var root = document.documentElement;

  // ---------------- Scroll offset (header fixo, 2 linhas) ----------------
  var siteHeader = document.querySelector('.site-header');
  var siteFooter = document.querySelector('.site-footer');
  var contatoSection = document.getElementById('contato');
  function updateScrollOffset() {
    if (!siteHeader) return;
    root.style.scrollPaddingTop = (siteHeader.offsetHeight + 12) + 'px';
  }
  // A seção Contato (última da página) recebe altura mínima igual ao
  // espaço restante da viewport abaixo do header. Isso garante ao mesmo
  // tempo que (a) sempre há espaço suficiente pra ela rolar coladinha no
  // header, igual as outras seções, e (b) o rodapé sempre aparece
  // exatamente no fim da tela, sem sobrar vão em branco nem precisar
  // de padding artificial. Se o conteúdo da seção já for mais alto que
  // isso, o min-height não tem efeito nenhum.
  function updateContatoMinHeight() {
    if (!contatoSection || !siteHeader) return;
    contatoSection.style.minHeight = (window.innerHeight - siteHeader.offsetHeight) + 'px';
  }
  function updateLayout() {
    updateScrollOffset();
    updateContatoMinHeight();
  }
  updateLayout();
  window.addEventListener('resize', updateLayout);
  window.addEventListener('load', updateLayout);

  // ---------------- Carrossel infinito de projetos ----------------
  // Duplica os cards uma vez (loop CSS via transform: translateX(-50%)).
  // Precisa rodar ANTES do observer de "reveal" logo abaixo, senão a
  // cópia clonada nunca é observada e fica invisível pra sempre.
  var projectTrack = document.getElementById('projectGrid');
  if (projectTrack) {
    projectTrack.insertAdjacentHTML('beforeend', projectTrack.innerHTML);
    projectTrack.addEventListener('touchstart', function () {
      projectTrack.classList.add('is-paused');
    }, { passive: true });
    projectTrack.addEventListener('touchend', function () {
      setTimeout(function () { projectTrack.classList.remove('is-paused'); }, 500);
    }, { passive: true });
  }

  // ---------------- Setas do menu (mobile) ----------------
  var navScroll = document.getElementById('navScroll');
  var navArrowLeft = document.getElementById('navArrowLeft');
  var navArrowRight = document.getElementById('navArrowRight');
  if (navScroll && navArrowLeft && navArrowRight) {
    function updateNavArrows() {
      var maxScroll = navScroll.scrollWidth - navScroll.clientWidth;
      navArrowLeft.classList.toggle('is-hidden', navScroll.scrollLeft <= 4);
      navArrowRight.classList.toggle('is-hidden', maxScroll <= 4 || navScroll.scrollLeft >= maxScroll - 4);
    }
    navArrowLeft.addEventListener('click', function () {
      navScroll.scrollBy({ left: -140, behavior: 'smooth' });
    });
    navArrowRight.addEventListener('click', function () {
      navScroll.scrollBy({ left: 140, behavior: 'smooth' });
    });
    navScroll.addEventListener('scroll', updateNavArrows);
    window.addEventListener('resize', updateNavArrows);
    updateNavArrows();
  }

  // ---------------- Centraliza a opção clicada no menu (mobile) ----------------
  if (navScroll) {
    var NAV_MOBILE_BREAKPOINT = 960;
    navScroll.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        if (window.innerWidth >= NAV_MOBILE_BREAKPOINT) return; // só no mobile
        var navRect = navScroll.getBoundingClientRect();
        var linkRect = link.getBoundingClientRect();
        var delta = (linkRect.left + linkRect.width / 2) - (navRect.left + navRect.width / 2);
        navScroll.scrollTo({ left: navScroll.scrollLeft + delta, behavior: 'smooth' });
      });
    });
  }

  // ---------------- Seção ativa no menu (scrollspy) ----------------
  // Marca com destaque (cor de fonte, e borda no mobile) o link do menu
  // correspondente à seção visível no topo da área útil (logo abaixo do
  // header fixo), conforme o usuário rola a página.
  (function () {
    var sections = document.querySelectorAll('main section[id]');
    var navLinks = document.querySelectorAll('.main-nav a');
    if (!sections.length || !navLinks.length || !('IntersectionObserver' in window)) return;

    function setCurrent(id) {
      navLinks.forEach(function (a) {
        a.classList.toggle('current', a.getAttribute('href') === '#' + id);
      });
    }

    var spyObserver = null;
    function initSpy() {
      if (spyObserver) spyObserver.disconnect();
      var headerH = siteHeader ? siteHeader.offsetHeight : 0;
      spyObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) setCurrent(entry.target.id);
        });
      }, { rootMargin: '-' + (headerH + 4) + 'px 0px -70% 0px', threshold: 0 });
      sections.forEach(function (s) { spyObserver.observe(s); });
    }
    initSpy();
    window.addEventListener('resize', initSpy);
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
  filterButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filterButtons.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var filter = btn.getAttribute('data-filter');
      // busca de novo a cada clique (não guarda em cache) pra pegar
      // também os cards clonados pelo carrossel infinito
      document.querySelectorAll('.project-card').forEach(function (card) {
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
