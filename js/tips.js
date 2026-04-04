(function () {
  const SESSION_KEY = 'verotrack_tip_hashes_v1';
  const MAX_SESSION = 80;

  function loadSeen() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveSeen(arr) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(arr.slice(-MAX_SESSION)));
    } catch {
      /* ignore quota */
    }
  }

  function fingerprint(text) {
    const s = String(text || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return String(h >>> 0);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async function fetchAdviceSlip() {
    const r = await fetch('https://api.adviceslip.com/advice', { cache: 'no-store' });
    if (!r.ok) throw new Error('advice');
    const d = await r.json();
    const t = d && d.slip && d.slip.advice;
    if (!t) throw new Error('advice empty');
    return { text: t, source: 'Advice Slip' };
  }

  async function fetchQuotable() {
    const r = await fetch('https://api.quotable.io/random?minLength=40&maxLength=220', {
      cache: 'no-store',
    });
    if (!r.ok) throw new Error('quotable');
    const d = await r.json();
    if (!d || !d.content) throw new Error('quotable empty');
    const author = d.author ? ` — ${d.author}` : '';
    return { text: `${d.content}${author}`, source: 'Quotable' };
  }

  async function fetchZen() {
    const r = await fetch('https://zenquotes.io/api/random', { cache: 'no-store' });
    if (!r.ok) throw new Error('zen');
    const d = await r.json();
    if (!d || !d[0] || !d[0].q) throw new Error('zen empty');
    const a = d[0].a ? ` — ${d[0].a}` : '';
    return { text: `${d[0].q}${a}`, source: 'ZenQuotes' };
  }

  async function fetchFact() {
    const r = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', {
      cache: 'no-store',
    });
    if (!r.ok) throw new Error('fact');
    const d = await r.json();
    if (!d || !d.text) throw new Error('fact empty');
    return { text: d.text, source: 'Random fact' };
  }

  /**
   * Fetches a fresh tip from the network. Does not persist tip text in localStorage.
   * Uses sessionStorage only to reduce repeats within the same browser tab session.
   */
  async function fetchFreshTip() {
    const sources = shuffle([
      fetchAdviceSlip,
      fetchQuotable,
      fetchZen,
      fetchFact,
    ]);
    const seen = loadSeen();
    const seenSet = new Set(seen);

    let lastErr = null;
    for (let attempt = 0; attempt < sources.length; attempt += 1) {
      const fn = sources[attempt];
      try {
        const tip = await fn();
        const fp = fingerprint(tip.text);
        if (seenSet.has(fp)) {
          lastErr = new Error('duplicate session');
          continue;
        }
        seen.push(fp);
        saveSeen(seen);
        return tip;
      } catch (e) {
        lastErr = e;
      }
    }

    for (let i = 0; i < 4; i += 1) {
      const fn = sources[i % sources.length];
      try {
        const tip = await fn();
        return tip;
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr || new Error('offline');
  }

  window.VeroTrackTips = {
    fetchFreshTip,
    fingerprint,
  };
})();
