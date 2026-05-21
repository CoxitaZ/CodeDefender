import * as game from './game.js';
import { initAuthClient, loginUser, registerUser, logoutUser } from './auth-client.js';
import { loadStoreFromApi, buyShopItem } from './shop.js';

const actions = { ...game, loginUser, registerUser, logoutUser, buyShopItem };

function splitArgs(raw) {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map(value => value.trim().replace(/^['"]|['"]$/g, ''))
    .map(value => value === 'true' ? true : value === 'false' ? false : value);
}

function dispatchAction(call) {
  const match = String(call || '').match(/^([A-Za-z_$][\w$]*)\((.*)\)$/);
  if (!match) return;
  const [, name, argText] = match;
  const fn = actions[name];
  if (typeof fn === 'function') fn(...splitArgs(argText));
}

document.addEventListener('click', event => {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  event.preventDefault();
  dispatchAction(el.dataset.action);
});

window.addEventListener('auth:changed', () => loadStoreFromApi());
initAuthClient();
