/**
 * Element-pick mode, run in the browser page via `webContents.executeJavaScript`.
 * No CDP, no preload build: the injected IIFE returns a Promise that resolves
 * when the user clicks an element (with its metadata) or cancels (Escape / the
 * host calling __onethingPickCancel), then removes its own overlay + listeners.
 * See docs/design/browser-v2.md §P2 (element picking).
 *
 * The picked rect is in viewport CSS px — the same coordinate space as
 * `webContents.capturePage(rect)`, so the host clips the screenshot to it with
 * no DPR/offset math. Rect is intersected with the viewport (capturePage only
 * sees what's visible); `clipped` flags a larger-than-viewport element.
 */

/** Shape the injected script resolves with (mirror of the IIFE's return). */
export interface RawPickedElement {
	rect: { x: number; y: number; width: number; height: number }
	sourceUrl: string
	sourceTitle: string
	excerpt: string
	clipped: boolean
	tag: string
}

/** IIFE evaluated in the page; resolves to RawPickedElement | null (cancelled). */
export const PICK_SCRIPT = `(function () {
  if (window.__onethingPickActive) { try { window.__onethingPickCancel(); } catch (e) {} }
  window.__onethingPickActive = true;
  return new Promise(function (resolve) {
    var doc = document;
    var root = doc.documentElement;
    var prevCursor = root.style.cursor;
    root.style.cursor = 'crosshair';

    var hl = doc.createElement('div');
    hl.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;box-shadow:0 0 0 1px rgba(214,69,45,.95),0 0 0 4px rgba(214,69,45,.16);background:rgba(214,69,45,.08);border-radius:2px;display:none;';
    var lbl = doc.createElement('div');
    lbl.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff;background:rgba(214,69,45,.96);padding:2px 6px;border-radius:3px;white-space:nowrap;display:none;';
    root.appendChild(hl);
    root.appendChild(lbl);

    var current = null;
    var TAGS = { A:1, BUTTON:1, LI:1, ARTICLE:1, FIGURE:1, SECTION:1, TABLE:1, FORM:1, BLOCKQUOTE:1, HEADER:1, FOOTER:1 };

    function promote(el) {
      var node = el;
      var b = el.getBoundingClientRect();
      var startArea = Math.max(1, b.width * b.height);
      var hops = 0;
      while (node && node !== doc.body && node.parentElement && hops < 8) {
        if (TAGS[node.tagName]) return node;
        var r = node.getBoundingClientRect();
        if (r.width * r.height >= startArea * 2) return node;
        node = node.parentElement;
        hops++;
      }
      return el;
    }

    function paint(el) {
      var r = el.getBoundingClientRect();
      hl.style.display = 'block';
      hl.style.left = r.left + 'px';
      hl.style.top = r.top + 'px';
      hl.style.width = r.width + 'px';
      hl.style.height = r.height + 'px';
      lbl.textContent = el.tagName.toLowerCase() + '  ' + Math.round(r.width) + '×' + Math.round(r.height);
      lbl.style.display = 'block';
      var ly = r.top - 20;
      if (ly < 2) ly = Math.min(window.innerHeight - 20, r.top + 2);
      lbl.style.left = Math.max(2, r.left) + 'px';
      lbl.style.top = ly + 'px';
    }

    function onMove(e) {
      var el = doc.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === hl || el === lbl) return;
      current = promote(el);
      paint(current);
    }
    function onScroll() { if (current) paint(current); }

    function suppress(e) { e.preventDefault(); e.stopPropagation(); }

    function build(el) {
      var r = el.getBoundingClientRect();
      var vw = window.innerWidth, vh = window.innerHeight;
      var x = Math.max(0, r.left), y = Math.max(0, r.top);
      var right = Math.min(vw, r.right), bottom = Math.min(vh, r.bottom);
      var clipped = r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh;
      var text = (el.innerText || el.textContent || '').replace(/\\s+\\n/g, '\\n').trim().slice(0, 2000);
      return {
        rect: { x: Math.round(x), y: Math.round(y), width: Math.round(Math.max(1, right - x)), height: Math.round(Math.max(1, bottom - y)) },
        sourceUrl: location.href,
        sourceTitle: doc.title || location.hostname,
        excerpt: text,
        clipped: clipped,
        tag: el.tagName.toLowerCase()
      };
    }

    function cleanup() {
      root.style.cursor = prevCursor;
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('pointerdown', suppress, true);
      window.removeEventListener('mousedown', suppress, true);
      window.removeEventListener('mouseup', suppress, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onBlur);
      if (hl.parentNode) hl.parentNode.removeChild(hl);
      if (lbl.parentNode) lbl.parentNode.removeChild(lbl);
      window.__onethingPickActive = false;
      try { delete window.__onethingPickCancel; } catch (e) { window.__onethingPickCancel = undefined; }
    }

    function onClick(e) {
      suppress(e);
      var el = current || doc.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      var out = build(el);
      cleanup();
      resolve(out);
    }
    function onKey(e) {
      if (e.key === 'Escape') { suppress(e); cleanup(); resolve(null); }
    }
    // Focus leaving the top document (e.g. a click landing inside a cross-origin
    // iframe, whose events the top window's listeners can never observe) would
    // otherwise strand the overlay and hang the pick forever — cancel instead.
    function onBlur() { cleanup(); resolve(null); }

    window.__onethingPickCancel = function () { cleanup(); resolve(null); };
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('pointerdown', suppress, true);
    window.addEventListener('mousedown', suppress, true);
    window.addEventListener('mouseup', suppress, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onBlur);
  });
})()`

/** Cancels an in-flight pick (host-driven, e.g. re-toggling the pick button). */
export const CANCEL_PICK_SCRIPT = `(function () {
  if (typeof window.__onethingPickCancel === 'function') window.__onethingPickCancel();
})()`
