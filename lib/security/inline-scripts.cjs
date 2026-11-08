// Stable, application-owned inline scripts are shared with next.config.js so
// the report-only static CSP hashes are always derived from the exact bytes
// rendered by the root layout.
const themeInitScript = `
(function() {
  var t = null;
  try { t = localStorage.getItem('theme'); } catch (e) {}
  if (t !== 'dark') t = 'light';
  try {
    if (t === 'light') document.documentElement.classList.add('light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', t === 'light' ? '#defaf5' : '#0a0b10');
  } catch (e) {}
})();
`;

const browserExtensionCompatibilityScript = `
(function() {
  var attribute = 'bis_skin_checked';

  function cleanElement(element) {
    if (element && element.nodeType === 1 && element.hasAttribute(attribute)) {
      element.removeAttribute(attribute);
    }
  }

  function cleanCurrentTree() {
    cleanElement(document.documentElement);
    var descendants = document.querySelectorAll('[' + attribute + ']');
    for (var i = 0; i < descendants.length; i += 1) {
      descendants[i].removeAttribute(attribute);
    }
  }

  cleanCurrentTree();
  var observer = new MutationObserver(function(records) {
    for (var i = 0; i < records.length; i += 1) {
      cleanElement(records[i].target);
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [attribute],
    subtree: true
  });

  document.addEventListener('DOMContentLoaded', function() {
    cleanCurrentTree();
    window.setTimeout(function() { observer.disconnect(); }, 1000);
  }, { once: true });
})();
`;

const performanceTierInitScript = `
(function() {
  try {
    var memory = Number(navigator.deviceMemory || 0);
    var cores = Number(navigator.hardwareConcurrency || 0);
    var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    var constrained = (memory > 0 && memory <= 4)
      || (cores > 0 && cores <= 4)
      || Boolean(connection && connection.saveData);
    document.documentElement.dataset.performanceTier = constrained ? 'low' : 'standard';
  } catch (e) {}
  // iOS zooms into any focused field with text under 16px and stays zoomed
  // inside the fixed-height page shells. maximum-scale=1 prevents that zoom,
  // but in-app browsers (WKWebView) also block pinch-zoom with it, so it is
  // only applied while a text field is being touched or has focus, on iOS only.
  try {
    var platform = navigator.platform || '';
    var ios = /iP(hone|ad|od)/.test(platform) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var viewport = ios && document.querySelector('meta[name="viewport"]');
    if (viewport) {
      var base = viewport.getAttribute('content') || '';
      var isField = function(target) {
        return target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]');
      };
      var lock = function(event) {
        if (isField(event.target)) viewport.setAttribute('content', base + ', maximum-scale=1');
      };
      var unlock = function() {
        window.setTimeout(function() {
          if (!isField(document.activeElement)) viewport.setAttribute('content', base);
        }, 300);
      };
      document.addEventListener('touchstart', lock, { capture: true, passive: true });
      document.addEventListener('focusin', lock, true);
      document.addEventListener('focusout', unlock, true);
    }
  } catch (e) {}
})();
`;

// Parses only in browsers whose JavaScript syntax matches the build targets
// (package.json "browserslist"). Older engines reject the whole script, so the
// flag stays unset. A syntax probe via new Function() is not possible: the CSP
// does not allow eval.
const modernSyntaxProbeScript = `
window.__portfolioModernJs = class { #a = 1; static b = 2; m() { let x = null; x ??= 1; return this.#a ?? x?.y; } };
`;

// Detects browsers older than the supported floor and switches the page to a
// simple, readable mode. Written in ES5 so that it runs everywhere.
// - No cascade layers (iOS/Safari < 15.4, Chrome < 99): load /legacy.css, the
//   layered Tailwind CSS without @layer, before every other stylesheet.
// - JavaScript too old for the app: the page stays readable without it.
const legacyBrowserScript = `
(function() {
  try {
    var root = document.documentElement;
    var legacy = '';
    if (typeof window.CSSLayerBlockRule === 'undefined') legacy = 'css';
    else if (!window.__portfolioModernJs
      || !Array.prototype.at
      || !Object.hasOwn
      || typeof window.structuredClone !== 'function') legacy = 'js';
    if (!legacy) return;
    root.setAttribute('data-legacy', legacy);
    if (legacy === 'css') {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/legacy.css';
      document.head.insertBefore(link, document.head.firstChild);
    }
    // One anonymous report per browser session (see app/api/client-report).
    var reported = false;
    try {
      reported = sessionStorage.getItem('legacy-reported') === '1';
      sessionStorage.setItem('legacy-reported', '1');
    } catch (e) {}
    if (!reported && window.XMLHttpRequest && window.JSON) {
      window.addEventListener('load', function() {
        try {
          var request = new XMLHttpRequest();
          request.open('POST', '/api/client-report');
          request.setRequestHeader('Content-Type', 'application/json');
          request.send(JSON.stringify({ kind: 'legacy-mode', page: location.pathname, message: legacy }));
        } catch (e) {}
      });
    }
  } catch (e) {}
})();
`;

// Every inline <head> script, in render order. The root layout renders this
// list and next.config.js hashes it for the static CSP, so they cannot drift.
const inlineHeadScripts = [
  modernSyntaxProbeScript,
  legacyBrowserScript,
  themeInitScript,
  browserExtensionCompatibilityScript,
  performanceTierInitScript,
];

module.exports = {
  browserExtensionCompatibilityScript,
  inlineHeadScripts,
  legacyBrowserScript,
  modernSyntaxProbeScript,
  performanceTierInitScript,
  themeInitScript,
};
