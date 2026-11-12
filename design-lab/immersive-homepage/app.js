/* ARTY IMMERSIVE HOMEPAGE — no dependencies, no API calls, no backend.
 * Works by opening index.html directly with a file:// URL.
 * Deliberately isolated from the real Arty checkout, customer and admin code.
 */
(function () {
  "use strict";

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, progress) => a + (b - a) * progress;
  const smooth = (value) => {
    const x = clamp(value, 0, 1);
    return x * x * (3 - 2 * x);
  };

  const header = $("#siteHeader");
  const scrollProgress = $("#progressBar");
  const hero = $("#top");
  const visual = $("#visualScene");
  const glow = $(".pointer-glow");
  const kitSection = $("#chapter-kits");
  const kitShowcase = $("#kitShowcase");
  const storyPanels = $$(".story-panel");
  const storyDots = $$(".story-dots span");
  const comparison = $("#compareFrame");
  const compareRange = $("#compareRange");
  const motionButton = $("#motionToggle");
  const languageButton = $("#languageToggle");
  const reducedBySystem = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let manualMotionOff = false;
  let activeStory = -1;
  let pendingScroll = false;
  let pointerReady = false;
  let language = "en";

  try {
    language = localStorage.getItem("arty-lab-language") === "fr" ? "fr" : "en";
  } catch (_) { /* local files may disable persistent storage */ }

  function isMotionOff() {
    return reducedBySystem || manualMotionOff;
  }

  function applyLanguage() {
    document.documentElement.lang = language;
    $$("[data-en][data-fr]").forEach(function (element) {
      element.textContent = element.getAttribute("data-" + language) || "";
    });
    languageButton.textContent = language === "en" ? "FR" : "EN";
    languageButton.setAttribute("aria-label", language === "en" ? "Passer en français" : "Switch to English");
    refreshMotionLabel();
  }

  function refreshMotionLabel() {
    const label = $("[data-en][data-fr]", motionButton);
    if (!label) return;
    label.textContent = isMotionOff()
      ? (language === "fr" ? "Animations désactivées" : "Motion off")
      : (language === "fr" ? "Animations" : "Motion on");
    motionButton.setAttribute("aria-pressed", String(isMotionOff()));
    motionButton.setAttribute("aria-label", isMotionOff()
      ? (language === "fr" ? "Activer les animations" : "Turn on animations")
      : (language === "fr" ? "Réduire les animations" : "Turn off animation"));
    document.body.classList.toggle("motion-off", isMotionOff());
  }

  languageButton.addEventListener("click", function () {
    language = language === "en" ? "fr" : "en";
    try { localStorage.setItem("arty-lab-language", language); } catch (_) {}
    applyLanguage();
  });

  motionButton.addEventListener("click", function () {
    manualMotionOff = !manualMotionOff;
    refreshMotionLabel();
    renderScroll();
    if (visual) visual.style.transform = "";
  });

  function selectStory(index) {
    if (activeStory === index) return;
    activeStory = index;
    storyPanels.forEach(function (panel, i) {
      const selected = i === index;
      panel.classList.toggle("is-active", selected);
      panel.setAttribute("aria-hidden", String(!selected));
    });
    storyDots.forEach(function (dot, i) {
      dot.classList.toggle("is-current", i === index);
    });
  }

  function translate(x, y, rotation, scale) {
    return "translate3d(" + x.toFixed(2) + "px," + y.toFixed(2) + "px,0) rotate(" + rotation.toFixed(2) + "deg) scale(" + scale.toFixed(3) + ")";
  }

  function animateKit(rawProgress) {
    const p = isMotionOff() ? 1 : smooth((rawProgress - 0.07) / 0.84);
    const wake = smooth((rawProgress - 0.15) / 0.30);
    const items = [
      [".kit-packing", 0, 0, -10, 1, -115, 90, -36, .68, 1, .38],
      [".kit-mini-canvas", 0, 0, 12, .75, 90, -108, -10, 1, 0, 1],
      [".kit-palette", 0, 0, 22, .5, -120, -62, -28, 1, 0, 1],
      [".kit-brush", 0, 0, -20, 1, 38, -110, 19, 1, 0, 1],
      [".kit-pencil", 0, 0, 16, 1, 78, 95, 32, 1, 0, 1],
      [".swatch-orange", 0, 0, 0, .7, -55, -42, 50, 1.1, 0, .95],
      [".swatch-blue", 0, 0, 0, .7, -75, 22, -45, 1.2, 0, .95],
      [".tag-canvas", 0, 0, 0, .8, 55, -15, 0, 1, 0, 1],
      [".tag-colours", 0, 0, 0, .8, -10, -20, 0, 1, 0, 1],
      [".tag-brushes", 0, 0, 0, .8, -16, 2, 0, 1, 0, 1]
    ];
    items.forEach(function (cfg) {
      const el = $(cfg[0], kitShowcase);
      if (!el) return;
      const t = (cfg[0].indexOf("kit-packing") !== -1) ? p : wake;
      el.style.transform = translate(lerp(cfg[1], cfg[5], t), lerp(cfg[2], cfg[6], t), lerp(cfg[3], cfg[7], t), lerp(cfg[4], cfg[8], t));
      el.style.opacity = lerp(cfg[9], cfg[10], t).toFixed(3);
    });
    const rings = $$(".kit-circle", kitShowcase);
    rings.forEach(function (ring, i) {
      ring.style.transform = "rotate(" + (i ? -36 - p * 40 : 21 + p * 33) + "deg) scale(" + (1 + p * 0.15) + ")";
    });
  }

  function renderScroll() {
    pendingScroll = false;
    const scrollTop = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollProgress.style.transform = "scaleX(" + clamp(scrollTop / maxScroll, 0, 1) + ")";
    header.classList.toggle("is-scrolled", scrollTop > 30);

    const sectionTop = kitSection.getBoundingClientRect().top + scrollTop;
    const duration = Math.max(1, kitSection.offsetHeight - window.innerHeight);
    const progress = clamp((scrollTop - sectionTop) / duration, 0, 1);
    selectStory(progress < 0.29 ? 0 : progress < 0.68 ? 1 : 2);
    animateKit(progress);

    const heroBottom = hero.getBoundingClientRect().bottom;
    const heroVisual = $("#heroVisual");
    if (heroVisual && !isMotionOff()) {
      const hp = clamp(scrollTop / Math.max(1, hero.offsetHeight), 0, 1);
      heroVisual.style.transform = "translate3d(0," + (hp * 86).toFixed(1) + "px,0) rotate(" + (hp * 4).toFixed(1) + "deg)";
    } else if (heroVisual) {
      heroVisual.style.transform = "";
    }
    if (glow && (heroBottom < 0 || isMotionOff())) glow.style.opacity = "0";
  }

  function scheduleScroll() {
    if (pendingScroll) return;
    pendingScroll = true;
    requestAnimationFrame(renderScroll);
  }

  window.addEventListener("scroll", scheduleScroll, { passive: true });
  window.addEventListener("resize", scheduleScroll);

  // Small, contained pointer motion. No third-party libraries and no external requests.
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    window.addEventListener("pointermove", function (event) {
      if (isMotionOff()) return;
      if (glow) {
        glow.style.left = event.clientX + "px";
        glow.style.top = event.clientY + "px";
        glow.style.opacity = event.clientY < hero.getBoundingClientRect().bottom ? "1" : "0";
      }
      if (event.clientY > hero.getBoundingClientRect().bottom || !visual) return;
      const bounds = hero.getBoundingClientRect();
      const dx = clamp((event.clientX - bounds.left) / bounds.width - .5, -.5, .5);
      const dy = clamp((event.clientY - bounds.top) / bounds.height - .5, -.5, .5);
      visual.style.transform = "rotateX(" + (dy * -7).toFixed(2) + "deg) rotateY(" + (dx * 11).toFixed(2) + "deg) translate3d(" + (dx * 13).toFixed(1) + "px," + (dy * 13).toFixed(1) + "px,0)";
      pointerReady = true;
    }, { passive: true });

    hero.addEventListener("pointerleave", function () {
      if (pointerReady && visual) visual.style.transform = "";
      pointerReady = false;
    });

    $$(".tilt-card").forEach(function (card) {
      card.addEventListener("pointermove", function (event) {
        if (isMotionOff()) return;
        const r = card.getBoundingClientRect();
        const x = (event.clientX - r.left) / r.width - .5;
        const y = (event.clientY - r.top) / r.height - .5;
        card.style.transform = "perspective(950px) rotateX(" + (-y * 7).toFixed(2) + "deg) rotateY(" + (x * 9).toFixed(2) + "deg) translateY(-8px)";
      });
      card.addEventListener("pointerleave", function () {
        card.style.transform = "";
      });
    });
  }

  // An actual input range, not a decorative slider. Supports mouse, touch and keyboard.
  function updateComparison(value) {
    const n = clamp(Number(value) || 0, 0, 100);
    comparison.style.setProperty("--reveal", n + "%");
    compareRange.value = String(n);
    compareRange.setAttribute("aria-valuetext", String(n) + "% painted");
  }
  compareRange.addEventListener("input", function () { updateComparison(compareRange.value); });
  comparison.addEventListener("pointerdown", function (event) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const box = comparison.getBoundingClientRect();
    updateComparison(100 * (event.clientX - box.left) / box.width);
  });
  comparison.addEventListener("pointermove", function (event) {
    if ((event.buttons & 1) !== 1) return;
    const box = comparison.getBoundingClientRect();
    updateComparison(100 * (event.clientX - box.left) / box.width);
  });

  // Animate only sections that enter the viewport.
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .12, rootMargin: "0px 0px -24px 0px" });
    $$(".reveal").forEach(function (element) { observer.observe(element); });
  } else {
    $$(".reveal").forEach(function (element) { element.classList.add("is-visible"); });
  }

  // Disable hash navigation animation for users who request less motion.
  document.addEventListener("click", function (event) {
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor || !isMotionOff()) return;
    const target = document.getElementById(anchor.getAttribute("href").slice(1));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "auto", block: "start" });
    history.replaceState(null, "", anchor.getAttribute("href"));
  });

  applyLanguage();
  updateComparison(53);
  renderScroll();
})();
