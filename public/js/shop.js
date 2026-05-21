import { getToken } from './auth-client.js';
import { TOWER_DEFS } from './towers.js';

let cache = { points: 0, dmgLevel: 0, ramLevel: 0, catOwned: false, catActive: false, highScores: [] };
let hooks = { onCatActive: null, onCatInactive: null };
const SHOP_DMG_COSTS = [150, 200, 280, 380, 500];
const SHOP_RAM_COSTS = [120, 180, 260];
function authHeaders() { const token = getToken(); return token ? { Authorization: 'Bearer ' + token } : {}; }
async function api(path, options = {}) {
  const res = await fetch('/api/store/' + path, { ...options, headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Falha na API da loja');
  return data;
}
export async function initShop(nextHooks = {}) { hooks = { ...hooks, ...nextHooks }; await loadStoreFromApi().catch(() => cache); }
export async function loadStoreFromApi() { if (!getToken()) return cache; const data = await api('load'); cache = { ...cache, ...data.gameState }; renderShopUI(); return cache; }
export function loadShopData() { return { ...cache }; }
export function loadHighScores() { return Array.isArray(cache.highScores) ? cache.highScores : []; }
export async function saveHighScores(highScores) { cache.highScores = Array.isArray(highScores) ? highScores.slice(0, 10) : []; if (!getToken()) return cache; const data = await api('save', { method: 'POST', body: JSON.stringify({ highScores: cache.highScores }) }); cache = { ...cache, ...data.gameState }; return cache; }
export async function saveShopData(next) { cache = { ...cache, ...next }; renderShopUI(); if (!getToken()) return cache; const data = await api('save', { method: 'POST', body: JSON.stringify(cache) }); cache = { ...cache, ...data.gameState }; renderShopUI(); return cache; }
export function addShopPoints() {}
export async function addBossCoins(amount) { cache.points = (cache.points || 0) + amount; renderShopUI(); if (!getToken()) return cache; const data = await api('save', { method: 'POST', body: JSON.stringify({ pointsDelta: amount }) }); cache = { ...cache, ...data.gameState }; renderShopUI(); return cache; }
export function renderShopUI() {
  const d = loadShopData();
  const ptsEl = document.getElementById('shop-pts'); if (ptsEl) ptsEl.textContent = Number(d.points || 0).toLocaleString('pt-BR');
  const dmgCostEl = document.getElementById('shop-dmg-cost'); const dmgLvlEl = document.getElementById('shop-dmg-level'); const dmgItem = document.getElementById('shop-dmg');
  if (dmgCostEl) dmgCostEl.textContent = d.dmgLevel >= 5 ? 'MAXIMO' : SHOP_DMG_COSTS[d.dmgLevel || 0] + ' moedas';
  if (dmgLvlEl) dmgLvlEl.textContent = 'Nivel: ' + (d.dmgLevel || 0) + ' / 5 (+' + ((d.dmgLevel || 0) * 7) + '% dano)';
  dmgItem?.classList.toggle('maxed', (d.dmgLevel || 0) >= 5);
  const ramCostEl = document.getElementById('shop-ram-cost'); const ramLvlEl = document.getElementById('shop-ram-level'); const ramItem = document.getElementById('shop-ram');
  if (ramCostEl) ramCostEl.textContent = d.ramLevel >= 3 ? 'MAXIMO' : SHOP_RAM_COSTS[d.ramLevel || 0] + ' moedas';
  if (ramLvlEl) ramLvlEl.textContent = 'Nivel: ' + (d.ramLevel || 0) + ' / 3 (-' + ((d.ramLevel || 0) * 10) + ' MB custo)';
  ramItem?.classList.toggle('maxed', (d.ramLevel || 0) >= 3);
  const catCostEl = document.getElementById('shop-cat-cost'); const catStatusEl = document.getElementById('shop-cat-status'); const catItem = document.getElementById('shop-cat');
  if (catCostEl) catCostEl.textContent = d.catOwned ? (d.catActive ? 'ATIVO' : 'ATIVAR') : '250 moedas';
  if (catStatusEl) catStatusEl.textContent = 'Status: ' + (d.catOwned ? (d.catActive ? 'Passeando nas bordas' : 'Adquirido') : 'Nao adquirido');
  catItem?.classList.toggle('purchased', !!d.catOwned);
}
function showMsg(text, ok) { const msgEl = document.getElementById('shop-msg'); if (!msgEl) return; msgEl.textContent = text; msgEl.style.borderColor = ok ? 'var(--green)' : 'var(--red)'; msgEl.style.color = ok ? 'var(--green)' : 'var(--red)'; msgEl.style.background = ok ? '#001a00' : '#1a0005'; setTimeout(() => { msgEl.textContent = ''; msgEl.style.borderColor = 'transparent'; msgEl.style.background = ''; }, 3000); }
export async function buyShopItem(item) {
  const d = loadShopData();
  if (item === 'dmg') { if ((d.dmgLevel || 0) >= 5) return showMsg('Ja esta no nivel maximo!', false); const cost = SHOP_DMG_COSTS[d.dmgLevel || 0]; if ((d.points || 0) < cost) return showMsg('Moedas insuficientes! (' + cost + ' necessarias)', false); await saveShopData({ ...d, points: d.points - cost, dmgLevel: (d.dmgLevel || 0) + 1 }); return showMsg('+10% Dano desbloqueado!', true); }
  if (item === 'ram') { if ((d.ramLevel || 0) >= 3) return showMsg('Ja esta no nivel maximo!', false); const cost = SHOP_RAM_COSTS[d.ramLevel || 0]; if ((d.points || 0) < cost) return showMsg('Moedas insuficientes! (' + cost + ' necessarias)', false); await saveShopData({ ...d, points: d.points - cost, ramLevel: (d.ramLevel || 0) + 1 }); return showMsg('Otimizacao de RAM desbloqueada!', true); }
  if (item === 'cat') { if (!d.catOwned) { if ((d.points || 0) < 250) return showMsg('Moedas insuficientes! (250 necessarias)', false); await saveShopData({ ...d, points: d.points - 250, catOwned: true, catActive: true }); hooks.onCatActive?.(); return showMsg('CyberCat adquirido!', true); } const active = !d.catActive; await saveShopData({ ...d, catActive: active }); active ? hooks.onCatActive?.() : hooks.onCatInactive?.(); return showMsg(active ? 'CyberCat ativado!' : 'CyberCat desativado.', true); }
}
export function applyShopBonuses() {
  const d = loadShopData();
  for (const key of Object.keys(TOWER_DEFS)) {
    if (TOWER_DEFS[key]._baseCost) TOWER_DEFS[key].cost = TOWER_DEFS[key]._baseCost;
  }
  if (d.ramLevel > 0) {
    const reduction = d.ramLevel * 10;
    for (const key of Object.keys(TOWER_DEFS)) {
      if (!TOWER_DEFS[key]._baseCost) TOWER_DEFS[key]._baseCost = TOWER_DEFS[key].cost;
      TOWER_DEFS[key].cost = Math.max(10, TOWER_DEFS[key]._baseCost - reduction);
    }
  }
  if (typeof window !== 'undefined') {
    window.SHOP_DMG_MULT = 1 + (d.dmgLevel || 0) * 0.07;
  }
}
