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
  // espaço que sobra na viewport abaixo do header E acima do rodapé —
  // ou seja, header + footer também entram na conta, não só o header.
  // (Bug anterior: a fórmula só descontava o header, então o rodapé
  // sempre "vazava" pra fora da tela por causa da própria altura dele.)
  // Isso garante ao mesmo tempo que (a) dá pra rolar a seção coladinha
  // no header, igual as outras, e (b) o rodapé aparece cheio, sem
  // sobrar vão nem precisar de mais rolagem.
  function updateContatoMinHeight() {
    if (!contatoSection || !siteHeader || !siteFooter) return;
    var available = window.innerHeight - siteHeader.offsetHeight - siteFooter.offsetHeight - 12;
    contatoSection.style.minHeight = Math.max(0, available) + 'px';
  }
  function updateLayout() {
    updateScrollOffset();
    updateContatoMinHeight();
  }
  updateLayout();
  window.addEventListener('resize', updateLayout);
  window.addEventListener('load', updateLayout);
  // ResizeObserver no header E no rodapé: recalcula sempre que a altura
  // real de qualquer um dos dois mudar, por qualquer motivo (troca de
  // fonte com display=swap, quebra de linha diferente, etc) — mais
  // confiável do que só confiar em load/resize, que podem disparar
  // antes da altura final se estabilizar.
  if ('ResizeObserver' in window) {
    var layoutObserver = new ResizeObserver(updateLayout);
    if (siteHeader) layoutObserver.observe(siteHeader);
    if (siteFooter) layoutObserver.observe(siteFooter);
  }

  // ---------------- Carrossel infinito de projetos ----------------
  // Duplica os cards uma vez (loop CSS via transform: translateX(-50%)).
  // Precisa rodar ANTES do observer de "reveal" logo abaixo, senão a
  // cópia clonada nunca é observada e fica invisível pra sempre.
  var projectTrack = document.getElementById('projectGrid');
  if (projectTrack) {
    projectTrack.insertAdjacentHTML('beforeend', projectTrack.innerHTML);
    var resumeCarousel = function () {
      setTimeout(function () { projectTrack.classList.remove('is-paused'); }, 500);
    };
    projectTrack.addEventListener('touchstart', function () {
      projectTrack.classList.add('is-paused');
    }, { passive: true });
    projectTrack.addEventListener('touchend', resumeCarousel, { passive: true });
    // touchcancel: o sistema pode interromper o toque (ex: notificação,
    // gesto de navegação) sem nunca disparar touchend — sem isso o
    // carrossel ficava pausado pra sempre a partir desse toque.
    projectTrack.addEventListener('touchcancel', resumeCarousel, { passive: true });
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
  //
  // Antes usava IntersectionObserver guardando a posição da seção no
  // momento em que ela cruzou o threshold — só que o observer não
  // reavalia continuamente enquanto a seção segue "intersectando" (ex:
  // seções altas, que ficam intersectando por uma rolagem inteira), então
  // essa posição guardada ficava desatualizada no meio da rolagem e podia
  // fazer o menu marcar a seção errada (bug relatado tanto no desktop
  // quanto no mobile). Agora calcula direto, a cada frame de rolagem, a
  // última seção cujo topo já passou da linha de referência — sempre com
  // a posição real e atual, sem nenhum valor em cache que possa envelhecer.
  (function () {
    var sections = Array.prototype.slice.call(document.querySelectorAll('main section[id]'));
    var navLinks = document.querySelectorAll('.main-nav a');
    if (!sections.length || !navLinks.length) return;

    function setCurrent(id) {
      navLinks.forEach(function (a) {
        a.classList.toggle('current', a.getAttribute('href') === '#' + id);
      });
    }

    var ticking = false;
    function updateCurrentSection() {
      ticking = false;
      var headerH = siteHeader ? siteHeader.offsetHeight : 0;
      var refLine = headerH + 16;
      var currentId = sections[0].id;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].getBoundingClientRect().top - refLine <= 0) {
          currentId = sections[i].id;
        } else {
          break;
        }
      }
      // Perto do fim da página força a última seção — ela pode ser mais
      // curta que a folga da linha de referência e nunca chegar a cruzá-la.
      var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom) currentId = sections[sections.length - 1].id;
      setCurrent(currentId);
    }
    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateCurrentSection);
      }
    }
    updateCurrentSection();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('load', updateCurrentSection);
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
