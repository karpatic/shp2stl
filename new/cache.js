// Author: Codex app agent, 2026-09-11.
// Session-only LRU. Pending work is shared; rejected work is always retryable.
export class SessionCache {
  constructor(limit, dispose = () => {}) { this.limit = limit; this.dispose = dispose; this.entries = new Map(); }
  get(key, build) {
    if (this.entries.has(key)) {
      const entry = this.entries.get(key); this.entries.delete(key); this.entries.set(key, entry); return entry.promise;
    }
    const controller = new AbortController();
    const value = Promise.resolve().then(() => build(controller.signal));
    const entry = {promise:value, controller};
    this.entries.set(key, entry);
    value.catch(() => { if (this.entries.get(key) === entry) this.entries.delete(key); });
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value, removed = this.entries.get(oldest);
      this.entries.delete(oldest); removed.controller.abort(); removed.promise.then(this.dispose, () => {});
    }
    return value;
  }
  delete(key) {
    const entry = this.entries.get(key); this.entries.delete(key);
    if (entry) { entry.controller.abort(); entry.promise.then(this.dispose, () => {}); }
  }
}
