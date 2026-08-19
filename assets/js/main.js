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
  // A troca de fonte (Google Fonts com display=swap) pode alterar a altura
  // do header DEPOIS do evento 'load' (ex: quebra de linha diferente no
  // menu). Sem isso, o cálculo do min-height do Contato ficava baseado numa
  // altura de header desatualizada, deixando um vão enorme antes do rodapé.
  // ResizeObserver reage a qualquer mudança real de altura do header.
  if (siteHeader && 'ResizeObserver' in window) {
    new ResizeObserver(updateLayout).observe(siteHeader);
  }

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

  // ---------------- Clique no menu: rola a página + centraliza (mobile) ----------------
  // Antes dependia do comportamento nativo do <a href="#..."> pra rolar a
  // página, mais a centralização do nav-scroll rodando em paralelo por
  // conta própria — em alguns navegadores mobile essas duas rolagens
  // concorrentes ficavam inconsistentes (seção errada, menu não
  // centralizava). Agora tudo parte de um único fluxo controlado por JS.
  var NAV_MOBILE_BREAKPOINT = 960;
  if (navScroll) {
    navScroll.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function (e) {
        var targetId = link.getAttribute('href');
        var targetEl = targetId && targetId.charAt(0) === '#' ? document.querySelector(targetId) : null;
        if (targetEl) {
          e.preventDefault();
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (history.pushState) history.pushState(null, '', targetId);
        }
        if (window.innerWidth < NAV_MOBILE_BREAKPOINT) {
          var navRect = navScroll.getBoundingClientRect();
          var linkRect = link.getBoundingClientRect();
          var delta = (linkRect.left + linkRect.width / 2) - (navRect.left + navRect.width / 2);
          navScroll.scrollTo({ left: navScroll.scrollLeft + delta, behavior: 'smooth' });
        }
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

    // Guarda o estado de TODAS as seções intersectando no momento (não só
    // as que mudaram neste lote) e sempre escolhe a mais próxima do topo —
    // evita a seção errada "ganhar" só por ter sido a última processada.
    var intersecting = {};
    function pickCurrent() {
      var bestId = null, bestDist = Infinity;
      Object.keys(intersecting).forEach(function (id) {
        var d = Math.abs(intersecting[id]);
        if (d < bestDist) { bestDist = d; bestId = id; }
      });
      if (bestId) setCurrent(bestId);
    }

    var spyObserver = null;
    function initSpy() {
      if (spyObserver) spyObserver.disconnect();
      intersecting = {};
      var headerH = siteHeader ? siteHeader.offsetHeight : 0;
      spyObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            intersecting[entry.target.id] = entry.boundingClientRect.top;
          } else {
            delete intersecting[entry.target.id];
          }
        });
        pickCurrent();
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

  // ---------------- Efeito de digitação humana (badge Contato) ----------------
  // Timing aleatório por caractere (não steps() uniforme do CSS) pra
  // parecer alguém digitando de verdade, com pausas maiores nos espaços.
  (function () {
    var el = document.getElementById('availTyped');
    if (!el) return;
    var fullText = el.textContent;
    el.textContent = '';

    function rand(min, max) { return min + Math.random() * (max - min); }

    function typeLoop() {
      var i = 0;
      function typeChar() {
        if (i < fullText.length) {
          i++;
          el.textContent = fullText.slice(0, i);
          var justTyped = fullText[i - 1];
          var delay = rand(55, 135);
          if (justTyped === ' ') delay += rand(70, 160);
          else if (Math.random() < 0.08) delay += rand(120, 260); // hesitação ocasional
          setTimeout(typeChar, delay);
        } else {
          setTimeout(deleteLoop, 2700); // segura o texto completo antes de apagar
        }
      }
      typeChar();
    }

    function deleteLoop() {
      var i = fullText.length;
      function delChar() {
        if (i > 0) {
          i--;
          el.textContent = fullText.slice(0, i);
          setTimeout(delChar, rand(22, 48));
        } else {
          setTimeout(typeLoop, 550); // pausa vazia antes de recomeçar
        }
      }
      delChar();
    }

    typeLoop();
  })();

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
