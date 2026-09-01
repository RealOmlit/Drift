/* ==========================================================================
   Zeek · imageguard.js — client-side image verification.

   Every image posted to chat (and every custom profile photo) runs through
   NSFW.js — a TensorFlow model that classifies images locally in the
   browser. Nothing is uploaded to a third party for checking; the model is
   ~4 MB and cached by the browser after first use.

   Public API: check(fileOrUrl) → { ok, scores? }, compress(file, maxPx, q)
   ========================================================================== */

window.ImageGuard = (() => {
  'use strict';

  let loadPromise = null;

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res;
      s.onerror = () => rej(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  async function getModel() {
    if (window.__nsfwModel) return window.__nsfwModel;
    loadPromise = loadPromise || (async () => {
      if (!window.tf)
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js');
      if (!window.nsfwjs)
        await loadScript('https://cdn.jsdelivr.net/npm/nsfwjs@4.2.0/dist/nsfwjs.min.js');
      window.__nsfwModel = await window.nsfwjs.load();
      return window.__nsfwModel;
    })();
    return loadPromise;
  }

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('Image failed to load'));
      img.src = src;
    });
  }

  /**
   * Verify an image is appropriate.
   * @param {File|Blob|string} fileOrUrl
   * @returns {Promise<{ok:boolean, scores?:object, error?:boolean}>}
   */
  async function check(fileOrUrl) {
    let url = null;
    try {
      const model = await getModel();
      url = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl);
      const img = await loadImage(url);
      const preds = await model.classify(img);
      const get = k => preds.find(p => p.className.toLowerCase() === k)?.probability || 0;
      const scores = {
        porn: get('porn'), hentai: get('hentai'), sexy: get('sexy'),
        neutral: get('neutral'), drawing: get('drawing')
      };
      const ok = (scores.porn + scores.hentai) < 0.55 && scores.sexy < 0.78;
      return { ok, scores };
    } catch (e) {
      // Model unavailable (offline CDN etc.) → fail open, but flag it.
      console.warn('[Zeek] image check skipped:', e.message);
      return { ok: true, error: true };
    } finally {
      if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
  }

  /** Downscale to maxPx on the long edge and re-encode as JPEG. */
  async function compress(file, maxPx = 1280, quality = 0.82) {
    try {
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
      return blob || file;
    } catch (e) {
      return file; // fall back to original bytes
    }
  }

  return { check, compress };
})();
