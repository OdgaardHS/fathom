// Saved data lives in the browser's localStorage. Storage can be unavailable
// (private windows, blocked site data), so every access is guarded.
const PROGRESS_KEY = 'fathom:progress';

/**
 * Progress shape:
 *   { levels: { shallows: { cleared: true, bestTime: 251.3, bestClear: 402.8 } } }
 * bestTime = longest survival without clearing, bestClear = fastest clear.
 */
export function loadProgress() {
  try {
    const data = JSON.parse(localStorage.getItem(PROGRESS_KEY));
    if (data && typeof data.levels === 'object' && data.levels !== null) return data;
  } catch {
    // Fall through to a fresh save.
  }
  return { levels: {} };
}

const HERO_KEY = 'fathom:hero';

/** The hero picked last time, so the hero screen remembers it. */
export function loadHeroChoice() {
  try {
    return localStorage.getItem(HERO_KEY);
  } catch {
    return null;
  }
}

export function saveHeroChoice(id) {
  try {
    localStorage.setItem(HERO_KEY, id);
  } catch {
    // Not important enough to worry about.
  }
}

const WEAPON_KEY = 'fathom:weapon';

/** The starting weapon picked last time. */
export function loadWeaponChoice() {
  try {
    return localStorage.getItem(WEAPON_KEY);
  } catch {
    return null;
  }
}

export function saveWeaponChoice(id) {
  try {
    localStorage.setItem(WEAPON_KEY, id);
  } catch {
    // Not important enough to worry about.
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Nothing to do: the game still works, progress just isn't kept.
  }
}
