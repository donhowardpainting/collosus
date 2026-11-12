// Saving & loading: designs, progress and settings in localStorage. No backend.
const KEY = 'colossus-construction.v1';
const blank = () => ({ scrap: 0, best: {}, arenaWave: 0, designs: {}, current: null, seenIntro: false, quality: 'high', muted: false });

export const Storage = {
  data: blank(),
  load() {
    try { this.data = { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { this.data = blank(); }
    return this.data;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage unavailable */ } },
  saveDesign(name, json) { this.data.designs[name] = json; this.save(); },
  deleteDesign(name) { delete this.data.designs[name]; this.save(); },
  setCurrent(json) { this.data.current = json; this.save(); },
  addScrap(n) { this.data.scrap += Math.round(n); this.save(); },
  record(id, value, lowerIsBetter) {
    const b = this.data.best[id];
    const better = b == null || (lowerIsBetter ? value < b : value > b);
    if (better) { this.data.best[id] = value; this.save(); }
    return better;
  },
};
