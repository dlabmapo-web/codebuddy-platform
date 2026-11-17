/** Set on <html> by the Turtle page once React has taken over the page. */
export const turtleBootReadyAttribute = 'data-cove-turtle-ready';
/** Per tab, so a page that cannot recover stops reloading. */
export const turtleBootRetriesKey = 'cove-turtle-boot-retries';
export const turtleBootLimits = { settleMs: 8000, backstopMs: 60000, maxReloads: 2, jitterMs: [500, 3000] } as const;

/**
 * Inline script for the public Turtle page, run while the HTML is parsed.
 *
 * When a whole class opens the page together, a page script can fail to
 * download (a 502 at the edge). The page then never hydrates: no PIN box, no
 * error, nothing for a student to press. If the page is still not live some
 * seconds after it loaded, reload it, at most twice per tab, after a random
 * delay so the class does not retry in lockstep. Without session storage it
 * never reloads, so it cannot loop.
 *
 * It is a plain string, not a serialized function, so the tested text is the
 * shipped text whatever the compiler does.
 */
export const turtleBootRecoveryScript = `(function (w) {
  var done = false;
  function check() {
    if (done) return;
    done = true;
    if (w.document.documentElement.hasAttribute(${JSON.stringify(turtleBootReadyAttribute)})) return;
    var count;
    try { count = Number(w.sessionStorage.getItem(${JSON.stringify(turtleBootRetriesKey)})) || 0; } catch (e) { return; }
    if (count >= ${turtleBootLimits.maxReloads}) return;
    try { w.sessionStorage.setItem(${JSON.stringify(turtleBootRetriesKey)}, String(count + 1)); } catch (e) { return; }
    w.setTimeout(function () { w.location.reload(); }, ${turtleBootLimits.jitterMs[0]} + Math.floor(Math.random() * ${turtleBootLimits.jitterMs[1] - turtleBootLimits.jitterMs[0]}));
  }
  function settle() { w.setTimeout(check, ${turtleBootLimits.settleMs}); }
  if (w.document.readyState === 'complete') settle(); else w.addEventListener('load', settle, { once: true });
  w.setTimeout(check, ${turtleBootLimits.backstopMs});
})(window);`;

/** Called by the page once it is live: no reload, and a fresh budget next time. */
export function markTurtleBootReady(doc: Document = document, storage: () => Storage = () => sessionStorage) {
  doc.documentElement.setAttribute(turtleBootReadyAttribute, '');
  try { storage().removeItem(turtleBootRetriesKey); } catch { /* Storage blocked: the script never reloads either. */ }
  return () => doc.documentElement.removeAttribute(turtleBootReadyAttribute);
}
