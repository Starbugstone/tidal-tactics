const paths={
  book:'<path d="M3 4.5c3.1-.6 6.6-.3 9 1.6 2.4-1.9 5.9-2.2 9-1.6v14c-3.3-.6-6.4-.2-9 1.6-2.6-1.8-5.7-2.2-9-1.6zM12 6v14"/>',
  volume:'<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute:'<path d="m11 4-6 5H2v6h3l6 5zM16 9l6 6m0-6-6 6"/>',
  expand:'<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>',
  exit:'<path d="M9 3v6H3m18 0h-6V3M3 15h6v6m6 0v-6h6"/>',
  target:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m15.8 7.7-2 6-5.6 2.5 2.2-6.1z"/>',
  layers:'<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  map:'<path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2zM9 3v15m6-12v15"/>',
  play:'<path d="m6 3 14 9-14 9z"/>',pause:'<path d="M6 4h4v16H6zm8 0h4v16h-4z"/>',
  pointer:'<path d="m4 2 14 11-7 1-3 7z"/>',flag:'<path d="M5 22V3m0 1c5-4 9 4 15 0v10c-6 3-10-4-15 0"/>',
  shield:'<path d="m12 2 8 3v6c0 5.2-3.3 8.9-8 11-4.7-2.1-8-5.8-8-11V5z"/>',
  close:'<path d="m5 5 14 14M19 5 5 19"/>',bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-8z"/>',
  trophy:'<path d="M8 3h8v5c0 4-2 6-4 7-2-1-4-3-4-7zM8 5H4v3c0 3 2 4 5 4m7-7h4v3c0 3-2 4-5 4m-3 3v4m-5 2h10"/>'
};
export function icon(name){return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">'+paths[name]+'</svg>';}
export function decorate(parent=document){parent.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
