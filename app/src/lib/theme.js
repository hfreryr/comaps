// Thème de l'écran : automatique (réglage du téléphone), clair ou sombre (P5 n'avait pas trouvé le mode clair).
// Le choix reste sur l'appareil. « auto » = pas d'attribut : les règles @media de base.css s'appliquent.
const KEY = 'theme';

/** 'auto' | 'light' | 'dark' */
export function themePref() {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto'; } catch { return 'auto'; }
}

/** Le thème réellement affiché. */
export function isDark(pref = themePref()) {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Pose le thème choisi sur la page (et le retient). */
export function applyTheme(pref, save = false) {
  const root = document.documentElement;
  if (pref === 'auto') delete root.dataset.theme;
  else root.dataset.theme = pref;
  if (save) { try { pref === 'auto' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, pref); } catch { /* rien */ } }
}
