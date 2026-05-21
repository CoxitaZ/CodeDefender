const TOKEN_KEY = 'codeDefenderAuthToken';
const USER_KEY = 'codeDefenderUser';

export function getToken() { return sessionStorage.getItem(TOKEN_KEY) || ''; }
export function getCurrentUser() {
  try { return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}

function setStatus(message, ok = true) {
  const el = document.getElementById('auth-status');
  if (!el) return;
  el.textContent = message;
  el.className = 'auth-status ' + (ok ? 'ok' : 'err');
}

async function requestAuth(path, username, password) {
  const res = await fetch('/api/auth/' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Falha na autenticacao');
  sessionStorage.setItem(TOKEN_KEY, data.token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
  setStatus('Operador autenticado: ' + data.user.username, true);
  window.dispatchEvent(new CustomEvent('auth:changed', { detail: data.user }));
  return data;
}

export async function loginUser() {
  const username = document.getElementById('player-name')?.value?.trim();
  const password = document.getElementById('auth-password')?.value || '';
  if (!username || !password) { setStatus('Informe callsign e senha.', false); return null; }
  try { return await requestAuth('login', username, password); }
  catch (err) { setStatus(err.message, false); return null; }
}

export async function registerUser() {
  const username = document.getElementById('player-name')?.value?.trim();
  const password = document.getElementById('auth-password')?.value || '';
  if (!username || password.length < 6) { setStatus('Senha deve ter pelo menos 6 caracteres.', false); return null; }
  try { return await requestAuth('register', username, password); }
  catch (err) { setStatus(err.message, false); return null; }
}

export function logoutUser() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  setStatus('Sessao encerrada. Entre novamente para salvar progresso.', true);
  window.dispatchEvent(new CustomEvent('auth:changed'));
}

export function initAuthClient() {
  const user = getCurrentUser();
  if (user) setStatus('Operador autenticado: ' + user.username, true);
}
