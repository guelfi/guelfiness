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
