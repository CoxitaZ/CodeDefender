import { TOWER_DEFS } from './towers.js';
import { BUG_TYPES, BOSS_DEFS } from './enemies.js';
import { loadShopData, addBossCoins, addShopPoints, renderShopUI, buyShopItem, applyShopBonuses, initShop, loadHighScores, saveHighScores } from './shop.js';
import { spawnCyberCat, removeCyberCat } from './cybercat.js';


// ===== CANVAS SETUP =====
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const CELL = 44, COLS = 18, ROWS = 13;
canvas.width = COLS * CELL; canvas.height = ROWS * CELL;

// ===== MAPS =====
const MAPS = {
  standard: [
    [0,2],[1,2],[2,2],[3,2],[3,3],[3,4],[3,5],[4,5],[5,5],[6,5],
    [6,4],[6,3],[6,2],[7,2],[8,2],[9,2],[10,2],[10,3],[10,4],[10,5],
    [10,6],[10,7],[9,7],[8,7],[7,7],[6,7],[5,7],[5,8],[5,9],[5,10],
    [6,10],[7,10],[8,10],[9,10],[10,10],[11,10],[12,10],[12,9],[12,8],
    [12,7],[12,6],[13,6],[14,6],[15,6],[16,6],[17,6]
  ],
  datacenter: [
    [0,6],[1,6],[2,6],[3,6],[3,5],[3,4],[2,4],[1,4],[1,3],[1,2],
    [2,2],[3,2],[4,2],[5,2],[6,2],[6,3],[6,4],[7,4],[8,4],[9,4],
    [9,5],[9,6],[9,7],[8,7],[7,7],[6,7],[5,7],[5,8],[5,9],[6,9],
    [7,9],[8,9],[9,9],[10,9],[11,9],[11,8],[11,7],[12,7],[13,7],[14,7],
    [14,6],[14,5],[13,5],[12,5],[11,5],[10,5]
  ]
};
let PATH = MAPS.standard.slice();
let PATH_SET = new Set(PATH.map(([c,r])=>`${c},${r}`));

// ===== DIFFICULTY CONFIG =====
const DIFF_CONFIG = {
  easy:   { ram: 300, ramMult: 1.2, hpMult: 0.75, speedMult: 0.85, scoreMult: 1.0, label: 'JUNIOR', cls: 'easy' },
  normal: { ram: 200, ramMult: 1.0, hpMult: 1.0,  speedMult: 1.0,  scoreMult: 1.5, label: 'PLENO',  cls: 'normal' },
  hard:   { ram: 100, ramMult: 0.7, hpMult: 1.5,  speedMult: 1.25, scoreMult: 3.0, label: 'SENIOR', cls: 'hard' }
};
let selectedDiff = 'normal';
let selectedMap  = 'standard';

// ===== STATE =====
let state = {};
function initState() {
  const dc = DIFF_CONFIG[selectedDiff];
  state = {
    playerName: 'Anon',
    difficulty: selectedDiff,
    ram: dc.ram, lives: 10, score: 0,
    wave: 0, maxWaves: 21,
    waveActive: false, waveInProgress: false,
    towers: [], bugs: [], projectiles: [], particles: [],
    bugSpawnQueue: [], spawnTimer: 0, spawnInterval: 40,
    bugsThisWave: 0, bugsKilled: 0,
    towerIdCounter: 0,
    selectedTowerType: null, selectedTowerObj: null,
    gameOver: false, won: false, tick: 0,
    isPerfectRun: true, finalScore: 0, scoreFinalized: false,
    floatingTexts: [],
    pendingUpgradePath: null,
    autoStart: false,
    educationalMode: true, // true = educational, false = arcade
    // status effects
    ramLeakTimer: 0, cpuThrottleTimer: 0,
    // boss
    currentBoss: null,
    // terminal zero
    corruptedTrail: [], // [{col, row}] data corruption trail
    // sql injector data fragments
    dataFragments: [],
    // malware popups
    popupCooldown: 0, activePopups: [], malwareDrainTicker: 0,
    // stats
    totalKills: 0, totalRamEarned: 0, wavesCompleted: 0,
  };
}
initState();


function addScore(basePoints) {
  const dc = DIFF_CONFIG[state.difficulty] || DIFF_CONFIG.normal;
  const points = Math.floor(basePoints * dc.scoreMult);
  state.score += points;
  return points;
}

function getWaveHpScale(wave = state.wave) {
  return Math.pow(1.2, Math.floor(Math.max(0, wave - 1) / 2));
}

function getMalwareDrainPerSecond() {
  return Math.round(2 + Math.max(0, state.wave - 1) * (23 / 9));
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function loadScores() {
  return loadHighScores();
}

function saveScores(scores) {
  saveHighScores(scores);
}

function qualifiesForScoreboard(score) {
  const scores = loadScores();
  return scores.length < 10 || score > Math.min(...scores.map(s => s.score || 0));
}

function recordScore(finalScore, won) {
  if (!qualifiesForScoreboard(finalScore)) return false;
  const dc = DIFF_CONFIG[state.difficulty] || DIFF_CONFIG.normal;
  const entry = {
    player: state.playerName || 'Anon',
    score: finalScore,
    difficulty: dc.label,
    wave: state.wave,
    won,
    perfect: won && state.isPerfectRun,
    date: new Date().toLocaleDateString('pt-BR')
  };
  const scores = [...loadScores(), entry]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 10);
  saveScores(scores);
  renderScoreboard();
  return true;
}

function renderScoreboard() {
  const list = document.getElementById('scoreboard-list');
  if (!list) return;
  const scores = loadScores();
  if (!scores.length) {
    list.innerHTML = '<div class="score-empty">Nenhum registro ainda.<br>Defenda o sistema e grave seu nome no terminal.</div>';
    return;
  }
  list.innerHTML = scores.map((s, i) => `
    <div class="score-row">
      <div class="score-rank">#${i + 1}</div>
      <div>
        <div class="score-player">${escapeHTML(s.player || 'Anon')}</div>
        <div class="score-meta">${escapeHTML(s.difficulty || 'PLENO')} · W${s.wave || 0}${s.perfect ? ' · PERFECT' : ''}</div>
      </div>
      <div class="score-points">${Number(s.score || 0).toLocaleString('pt-BR')}</div>
    </div>
  `).join('');
}

function clearMalwarePopups() {
  document.querySelectorAll('.malware-popup').forEach(p => p.remove());
  state.activePopups = [];
}

// ===== TOWER DEFS (custos rebalanceados) =====
// ===== DEFINITIONS MOVED TO MODULES =====
// ===== EXTENDED QUESTION BANK =====
const UPGRADE_CHALLENGES = {
  firewall: {
    IF_ELSE_BLOCK: {
      2: [
        { level:'basic', prompt:'if (bug.health ___ 50) { fix(); }', options:['>','<','==','>='], correct:'>', explain:'Verifica se health é maior que 50.' },
        { level:'basic', prompt:'Qual palavra chave executa código quando condição é FALSA?', options:['else','elif','otherwise','default'], correct:'else', explain:'"else" executa quando o if é falso.' },
        { level:'inter', prompt:'Qual operador retorna true se AMBAS condições forem verdadeiras?', options:['&&','||','!','??'], correct:'&&', explain:'"&&" (AND lógico) exige ambas verdadeiras.' },
        { level:'inter', prompt:'O que é "short-circuit evaluation" em if (a && b)?', options:['b não avaliado se a=false','a não avaliado nunca','b sempre avaliado','nenhuma das anteriores'], correct:'b não avaliado se a=false', explain:'JS para na primeira condição false do &&.' },
      ],
      3: [
        { level:'adv', prompt:'O que Optional Chaining (?.) faz em: obj?.prop?.sub?', options:['retorna undefined se obj ou prop for nullish','lança erro','retorna null sempre','acessa prop forçado'], correct:'retorna undefined se obj ou prop for nullish', explain:'?. evita erros em cadeia de acessos.' },
        { level:'adv', prompt:'Qual padrão usa if como type guard em TypeScript?', options:['typeof x === "string"','x instanceof String','x as string','String(x)'], correct:'typeof x === "string"', explain:'"typeof" funciona como type guard em TS.' },
      ]
    },
    ELSE_IF_CHAIN: {
      2: [
        { level:'basic', prompt:'Qual operador encadeia testes adicionais?', options:['else if','else','elif','switch'], correct:'else if', explain:'else if permite checar outras condições.' },
        { level:'inter', prompt:'Switch é equivalente a qual estrutura?', options:['múltiplos else if com ===','loops aninhados','try/catch','while'], correct:'múltiplos else if com ===', explain:'Switch usa === implícito em cada case.' },
      ],
      3: [
        { level:'adv', prompt:'O que é "nullish coalescing" (??)? ', options:['retorna RHS se LHS é null/undefined','retorna RHS se LHS é falsy','operador de soma','desestruturação'], correct:'retorna RHS se LHS é null/undefined', explain:'"??" difere de "||": aceita 0 e "" como válidos.' },
        { level:'adv', prompt:'const result = x ?? y ?? z — o que retorna?', options:['primeiro valor não-nullish','x sempre','y sempre','z sempre'], correct:'primeiro valor não-nullish', explain:'?? encadeia buscando o primeiro valor definido.' },
      ]
    }
  },
  loop: {
    WHILE_RECURSION: {
      2: [
        { level:'basic', prompt:'while (i ___ 10) { i++; }', options:['<','==','>','<='], correct:'<', explain:'Loop executa enquanto i menor que 10.' },
        { level:'inter', prompt:'Qual é o risco de recursão sem base case?', options:['Stack Overflow','Syntax Error','TypeError','RangeError de index'], correct:'Stack Overflow', explain:'Sem caso base, a pilha de chamadas estoura.' },
        { level:'inter', prompt:'O que é memoização em recursão?', options:['cachear resultados já calculados','chamar duas vezes','usar loops em vez de recursão','evitar funções puras'], correct:'cachear resultados já calculados', explain:'Memoização evita recalcular subproblemas.' },
      ],
      3: [
        { level:'adv', prompt:'Generator functions usam qual palavra-chave para pausar?', options:['yield','await','pause','return'], correct:'yield', explain:'"yield" pausa a generator e retorna o valor.' },
        { level:'adv', prompt:'Qual diferença entre for...of e for...in?', options:['of itera valores, in itera chaves','of itera chaves, in itera valores','são idênticos','of é mais lento'], correct:'of itera valores, in itera chaves', explain:'"for...of" usa iteráveis; "for...in" enumera propriedades.' },
      ]
    },
    NESTED_FOR: {
      2: [
        { level:'basic', prompt:'Complexidade de loop duplo O(n) dentro de O(n)?', options:['O(n²)','O(2n)','O(n+n)','O(log n)'], correct:'O(n²)', explain:'Produto das iterações = n×n = n².' },
        { level:'inter', prompt:'Array.flat(Infinity) serve para?', options:['achatar arrays aninhados arbitrariamente','somar elementos','ordenar','copiar array'], correct:'achatar arrays aninhados arbitrariamente', explain:'.flat(Infinity) remove toda profundidade de aninhamento.' },
      ],
      3: [
        { level:'adv', prompt:'Array.flatMap() é equivalente a?', options:['.map().flat(1)','.flat().map()','reduce+concat','Object.entries'], correct:'.map().flat(1)', explain:'flatMap mapeia e aplana 1 nível em uma passagem.' },
        { level:'adv', prompt:'O que é "trampolining" em loops recursivos?', options:['converter recursão em loop iterativo','chamar função em setTimeout','memoizar recursão','usar WebWorkers'], correct:'converter recursão em loop iterativo', explain:'Trampolining evita stack overflow convertendo em iteração.' },
      ]
    }
  },
  debug: {
    TRY_CATCH_SHIELD: {
      2: [
        { level:'basic', prompt:'try { } catch (e) { } — propósito do catch?', options:['capturar erros lançados','melhorar velocidade','criar loops','declarar variáveis'], correct:'capturar erros lançados', explain:'catch intercepta exceções do bloco try.' },
        { level:'inter', prompt:'O bloco "finally" executa...', options:['sempre, com ou sem erro','só com erro','só sem erro','nunca em async'], correct:'sempre, com ou sem erro', explain:'finally sempre roda, ideal para limpeza.' },
        { level:'inter', prompt:'Error.name retorna?', options:['tipo do erro','mensagem','stack trace','código HTTP'], correct:'tipo do erro', explain:'Error.name retorna "TypeError", "RangeError", etc.' },
      ],
      3: [
        { level:'adv', prompt:'Como capturar erro em async/await?', options:['try/catch ao redor do await','callback de erro','Promise.race','event listener'], correct:'try/catch ao redor do await', explain:'try/catch funciona normalmente com async/await.' },
        { level:'adv', prompt:'O que é "error boundary" em React?', options:['componente que captura erros em filhos','hook de erro','middleware','interceptor HTTP'], correct:'componente que captura erros em filhos', explain:'ErrorBoundary usa componentDidCatch() para isolar falhas.' },
      ]
    },
    BREAK_CONTINUE: {
      2: [
        { level:'basic', prompt:'"continue" em um loop faz o quê?', options:['pula para próxima iteração','para o loop completamente','reinicia o programa','retorna valor'], correct:'pula para próxima iteração', explain:'continue avança sem executar o restante da iteração.' },
        { level:'inter', prompt:'"break" com label em loop aninhado...', options:['sai do loop indicado pelo label','para apenas o loop interno','gera erro','ignora label'], correct:'sai do loop indicado pelo label', explain:'Labels permitem break/continue em loops externos.' },
      ],
      3: [
        { level:'adv', prompt:'Symbol.iterator em um objeto customizado permite?', options:['usar o objeto em for...of','desestruturar como array','spread operator','JSON.stringify'], correct:'usar o objeto em for...of', explain:'Implementar Symbol.iterator torna o objeto iterável.' },
        { level:'adv', prompt:'Qual método de Array PARA na primeira condição verdadeira?', options:['Array.some()','Array.every()','Array.find()','Array.filter()'], correct:'Array.some()', explain:'.some() retorna true e para ao achar o primeiro true.' },
      ]
    }
  }
};

// ===== SIMPLIFIED EDUCATIONAL QUESTION BANK =====
const EDU_CHALLENGES = {
  firewall: {
    IF_ELSE_BLOCK: {
      2: [
        { level:'basic', prompt:'Qual operador testa se um valor é maior que outro?', options:['>','<','===','!='], correct:'>', explain:'O operador > compara dois valores e retorna true quando o primeiro é maior.', code:'if (bug.hp > 50) {\n  firewall.block(bug);\n}' },
        { level:'basic', prompt:'Qual bloco roda quando o if é falso?', options:['else','for','try','return'], correct:'else', explain:'else cria o caminho alternativo quando a condição do if não passa.', code:'if (safe) {\n  allow();\n} else {\n  block();\n}' }
      ],
      3: [
        { level:'inter', prompt:'Qual operador exige duas condições verdadeiras?', options:['&&','||','!','??'], correct:'&&', explain:'&& é o “E lógico”: os dois lados precisam ser true.', code:'if (logged && hasToken) {\n  openPanel();\n}' },
        { level:'inter', prompt:'Para testar igualdade de valor e tipo em JS, use:', options:['===','==','=','!=='], correct:'===', explain:'=== evita conversões automáticas e deixa a comparação mais previsível.', code:'if (role === "admin") {\n  grantAccess();\n}' }
      ]
    },
    ELSE_IF_CHAIN: {
      2: [
        { level:'basic', prompt:'Como testar uma segunda condição depois do if?', options:['else if','repeat','catch','await'], correct:'else if', explain:'else if encadeia outra verificação antes do else final.', code:'if (risk > 80) {\n  block();\n} else if (risk > 40) {\n  scan();\n}' },
        { level:'basic', prompt:'Qual estrutura é boa para comparar muitos casos fixos?', options:['switch','while','try','map'], correct:'switch', explain:'switch organiza várias opções conhecidas em blocos case.', code:'switch (type) {\n  case "virus": quarantine();\n  break;\n}' }
      ],
      3: [
        { level:'inter', prompt:'Qual operador usa um valor padrão só quando há null/undefined?', options:['??','||','&&','!'], correct:'??', explain:'?? preserva valores válidos como 0 ou string vazia.', code:'const limit = config.limit ?? 10;\nscan(limit);' },
        { level:'inter', prompt:'O operador ?. evita erro quando parte do objeto não existe.', options:['Verdadeiro','Falso','Só em CSS','Só em HTML'], correct:'Verdadeiro', explain:'?. interrompe o acesso e retorna undefined se encontrar null ou undefined.', code:'const city = user?.profile?.city;\nconsole.log(city);' }
      ]
    }
  },
  loop: {
    WHILE_RECURSION: {
      2: [
        { level:'basic', prompt:'Qual loop roda enquanto uma condição for verdadeira?', options:['while','if','switch','catch'], correct:'while', explain:'while repete o bloco até a condição deixar de ser true.', code:'while (queue.length > 0) {\n  process(queue.shift());\n}' },
        { level:'basic', prompt:'O que impede uma recursão infinita?', options:['caso base','console.log','CSS','parseInt'], correct:'caso base', explain:'O caso base é a condição que para as chamadas recursivas.', code:'function count(n) {\n  if (n === 0) return;\n  count(n - 1);\n}' }
      ],
      3: [
        { level:'inter', prompt:'Qual palavra pula o restante da iteração atual?', options:['continue','break','throw','new'], correct:'continue', explain:'continue passa para a próxima volta do loop sem encerrar tudo.', code:'for (const bug of bugs) {\n  if (bug.safe) continue;\n  scan(bug);\n}' },
        { level:'inter', prompt:'Qual palavra encerra um loop imediatamente?', options:['break','continue','await','case'], correct:'break', explain:'break sai do loop assim que a condição desejada aparece.', code:'for (const port of ports) {\n  if (port.open) break;\n}' }
      ]
    },
    NESTED_FOR: {
      2: [
        { level:'basic', prompt:'Um for dentro de outro geralmente cresce como:', options:['O(n²)','O(1)','O(log n)','O(n)'], correct:'O(n²)', explain:'Dois loops aninhados multiplicam as passagens: n vezes n.', code:'for (const row of grid) {\n  for (const cell of row) {\n    scan(cell);\n  }\n}' },
        { level:'basic', prompt:'Qual método percorre um array e cria outro?', options:['map','push','pop','typeof'], correct:'map', explain:'map transforma cada item e devolve um novo array.', code:'const ids = bugs.map(bug => bug.id);\nconsole.log(ids);' }
      ],
      3: [
        { level:'inter', prompt:'Qual método filtra itens de um array?', options:['filter','join','slice','alert'], correct:'filter', explain:'filter mantém apenas os itens que passam no teste.', code:'const threats = packets.filter(p => p.bad);\nblock(threats);' },
        { level:'inter', prompt:'Qual método soma/acumula valores de um array?', options:['reduce','find','includes','trim'], correct:'reduce', explain:'reduce carrega um acumulador de item em item.', code:'const total = bugs.reduce((sum, bug) => {\n  return sum + bug.hp;\n}, 0);' }
      ]
    }
  },
  debug: {
    TRY_CATCH_SHIELD: {
      2: [
        { level:'basic', prompt:'Qual bloco captura erros de um try?', options:['catch','else','case','for'], correct:'catch', explain:'catch recebe a exceção lançada dentro do try.', code:'try {\n  deployPatch();\n} catch (err) {\n  rollback();\n}' },
        { level:'basic', prompt:'finally executa mesmo se houver erro?', options:['Sim','Não','Só no Chrome','Só com loop'], correct:'Sim', explain:'finally roda após try/catch e é útil para limpeza.', code:'try {\n  connect();\n} finally {\n  closeConnection();\n}' }
      ],
      3: [
        { level:'inter', prompt:'Como tratar erro ao usar await?', options:['try/catch','switch','for...in','CSS'], correct:'try/catch', explain:'await dentro de try permite capturar rejeições de Promises.', code:'try {\n  await scanNetwork();\n} catch (err) {\n  notify(err.message);\n}' },
        { level:'inter', prompt:'throw serve para:', options:['lançar um erro','criar array','mudar cor','parar CSS'], correct:'lançar um erro', explain:'throw interrompe o fluxo e envia um erro para ser tratado.', code:'if (!token) {\n  throw new Error("Sem token");\n}' }
      ]
    },
    BREAK_CONTINUE: {
      2: [
        { level:'basic', prompt:'continue em um loop faz:', options:['pular para a próxima volta','encerrar o app','criar função','salvar arquivo'], correct:'pular para a próxima volta', explain:'continue ignora o restante do bloco atual e segue o loop.', code:'for (const item of list) {\n  if (!item.active) continue;\n  run(item);\n}' },
        { level:'basic', prompt:'break em um loop faz:', options:['sair do loop','repetir tudo','abrir modal','criar objeto'], correct:'sair do loop', explain:'break termina a repetição no ponto em que foi chamado.', code:'while (true) {\n  if (done) break;\n}' }
      ],
      3: [
        { level:'inter', prompt:'Qual método encontra o primeiro item que passa no teste?', options:['find','filter','map','sort'], correct:'find', explain:'find retorna o primeiro item compatível e para a busca.', code:'const boss = bugs.find(bug => bug.isBoss);\nfocus(boss);' },
        { level:'inter', prompt:'Qual método responde se algum item passa no teste?', options:['some','every','join','split'], correct:'some', explain:'some retorna true ao encontrar o primeiro item aprovado.', code:'const hasVirus = files.some(file => file.bad);\nalert(hasVirus);' }
      ]
    }
  }
};

// ===== MALWARE POPUP TEMPLATES =====
const POPUP_TEMPLATES = [
  {
    style: 'error-style', title: '⚠ CRITICAL ERROR',
    icon: '💀', heading: 'FATAL: kernel32.dll',
    body: 'Exceção não tratada no processo principal.\nEndereço: 0x00FF4100',
    fakeBtn: 'OK — Fechar relatório', reward: 15, penalty: 'ram_leak'
  },
  {
    style: 'ad-style', title: '🎁 VOCÊ GANHOU!',
    icon: '🏆', heading: 'PRÊMIO DE 1TB DE RAM!',
    body: 'Clique para reivindicar seu prêmio especial de aceleração de sistema.',
    fakeBtn: '→ RESGATAR AGORA', reward: 20, penalty: 'cpu_throttle'
  },
  {
    style: 'error-style', title: '🔴 VIRUS DETECTED',
    icon: '🦠', heading: 'MALWARE.exe encontrado',
    body: 'Ameaça crítica detectada em C:\\System32.\nRemovendo em 3... 2... 1...',
    fakeBtn: 'SCAN COMPLETO', reward: 12, penalty: 'ram_leak'
  },
  {
    style: 'ad-style', title: '📦 ATUALIZAÇÃO',
    icon: '⚡', heading: 'Atualize para PRO!',
    body: 'Sua licença expirou. Renove agora e ganhe\n500MB de RAM bônus!',
    fakeBtn: '→ RENOVAR LICENÇA', reward: 18, penalty: 'cpu_throttle'
  },
  {
    style: 'error-style', title: '🔒 ACCESS DENIED',
    icon: '🚫', heading: 'Firewall bloqueado!',
    body: 'Sua defesa foi comprometida.\nRequires elevated privileges to continue.',
    fakeBtn: 'CONCEDER ACESSO', reward: 10, penalty: 'ram_leak'
  }
];

// ===== HOME UI =====
// Generate background code lines
(function() {
  const container = document.getElementById('bg-lines');
  const lines = [
    'const defend = async (threats) => { await Promise.all(threats.map(t => firewall.block(t))); };',
    'for (let bug of network.packets) { if (bug.type === "MALWARE") { quarantine(bug); } }',
    'class Firewall { constructor(rules) { this.rules = rules; this.active = true; } }',
    'import { Scanner, Defender } from "@system/security"; export default new Defender();',
    'while (network.isActive) { const threat = await scanner.next(); if (threat) patch(threat); }',
    'try { execute(payload); } catch (e) { log.error(e); rollback(); notify("BREACH"); }',
    'const tokens = jwt.verify(req.headers.auth, process.env.SECRET_KEY);',
    'fs.watchFile("/var/log/auth.log", (cur, prev) => { if (cur.mtime > prev.mtime) analyze(cur); });',
  ];
  for (let i = 0; i < 12; i++) {
    const span = document.createElement('span');
    span.textContent = lines[i % lines.length];
    span.style.top = (i * 9.5) + '%';
    span.style.animationDelay = (i * -2) + 's';
    span.style.animationDuration = (18 + i * 2) + 's';
    container.appendChild(span);
  }
})();

let arcadeModeSelected = false;

function toggleGameMode() {
  arcadeModeSelected = !arcadeModeSelected;
  const track = document.getElementById('mode-switch-track');
  const warning = document.getElementById('mode-warning');
  const eduIndicator = document.getElementById('mode-edu-indicator');
  const arcLabel = document.getElementById('arc-label-text');
  if (arcadeModeSelected) {
    track.classList.add('arcade');
    warning.classList.add('visible');
    eduIndicator.style.display = 'none';
    arcLabel.style.color = 'var(--orange)';
    arcLabel.style.fontWeight = '700';
  } else {
    track.classList.remove('arcade');
    warning.classList.remove('visible');
    eduIndicator.style.display = 'block';
    arcLabel.style.color = '#664400';
    arcLabel.style.fontWeight = 'normal';
  }
}

function selectDiff(d) {
  selectedDiff = d;
  document.querySelectorAll('.diff-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('diff-' + d).classList.add('selected');
}

function selectMap(m) {
  selectedMap = m;
  document.querySelectorAll('.map-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('map-' + m).classList.add('selected');
}

function setMap(mapKey) {
  PATH = MAPS[mapKey].slice();
  PATH_SET = new Set(PATH.map(([c,r])=>`${c},${r}`));
}

function startSession() {
  const name = document.getElementById('player-name').value.trim();
  const dc = DIFF_CONFIG[selectedDiff];
  initState();
  state.playerName = name || 'Anon';
  state.ram = dc.ram;
  state.difficulty = selectedDiff;
  state.educationalMode = !arcadeModeSelected;
  setMap(selectedMap);
  document.getElementById('home-overlay').style.display = 'none';
  document.getElementById('btn-wave').disabled = false;
  document.getElementById('player-tag').textContent = `[ ${state.playerName.toUpperCase()} ]`;
  const dtag = document.getElementById('difficulty-tag');
  dtag.textContent = dc.label;
  dtag.className = dc.cls;
  updateUI();
  const modeMsg = state.educationalMode ? 'MODO EDUCATIVO ativo — Score 100%' : '⚡ MODO ARCADE ativo — Score x0.6';
  log(`Sessão iniciada — ${state.playerName} | Dificuldade: ${dc.label}`, 'info');
  log(modeMsg, state.educationalMode ? 'ok' : 'warn');
  log(`RAM inicial: ${state.ram} MB`, 'ok');
  // Apply shop bonuses (defined later in shop section)
  if (typeof applyShopBonuses === 'function') applyShopBonuses();
  // Start cyber-cat if active
  if (typeof spawnCyberCat === 'function') {
    const _sd = loadShopData ? loadShopData() : null;
    if (_sd && _sd.catOwned && _sd.catActive) spawnCyberCat();
  }
}

function cancelSession() {
  document.getElementById('home-overlay').style.display = 'none';
  document.getElementById('btn-wave').disabled = true;
}

function goToMenu(force = false) {
  if (!force && state.waveActive) {
    requestExitToMenu();
    return;
  }
  clearMalwarePopups();
  state.gameOver = true;
  document.getElementById('overlay').classList.remove('visible');
  document.getElementById('confirm-modal').classList.remove('visible');
  document.getElementById('terminal-zero-bar').classList.remove('visible');
  document.getElementById('home-overlay').style.display = 'flex';
  document.getElementById('player-name').value = state.playerName !== 'Anon' ? state.playerName : '';
  initState();
  updateUI();
  renderScoreboard();
  log('Sessão encerrada. Retornando ao menu.', 'warn');
}

let exitConfirmWasPaused = false;
function requestExitToMenu() {
  exitConfirmWasPaused = gamePaused;
  gamePaused = true;
  document.getElementById('confirm-modal').classList.add('visible');
}

function closeExitConfirm() {
  document.getElementById('confirm-modal').classList.remove('visible');
  gamePaused = exitConfirmWasPaused;
}

function confirmExitToMenu() {
  document.getElementById('confirm-modal').classList.remove('visible');
  goToMenu(true);
}

// ===== LOG / UI =====
function log(msg, type='ok') {
  const box = document.getElementById('log-box');
  const d = document.createElement('div');
  d.className = `log-${type}`;
  d.textContent = `> ${msg}`;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
  if (box.children.length > 80) box.removeChild(box.children[0]);
}

function updateUI() {
  const ramEl   = document.getElementById('stat-ram');
  const livesEl = document.getElementById('stat-lives');
  const scoreEl = document.getElementById('stat-score');
  const waveEl  = document.getElementById('stat-wave');
  document.getElementById('stat-maxwave').textContent = state.maxWaves;
  ramEl.textContent   = state.ram;
  livesEl.textContent = state.lives;
  scoreEl.textContent = state.score;
  waveEl.textContent  = state.wave;
  ramEl.className   = 'stat-val' + (state.ram < 60 ? ' danger' : state.ram < 100 ? ' warn' : '');
  livesEl.className = 'stat-val' + (state.lives <= 3 ? ' danger' : state.lives <= 6 ? ' warn' : '');
  const total = state.bugsThisWave || 1;
  document.getElementById('prog-bugs').style.width = Math.min(100, state.bugsKilled / total * 100) + '%';
  const lp = state.lives / 10 * 100;
  const pb = document.getElementById('prog-lives');
  pb.style.width = lp + '%';
  pb.className = 'progress-fill' + (state.lives <= 3 ? ' red' : '');
  // update status effects bar
  const sb = document.getElementById('status-bar');
  sb.innerHTML = '';
  if (state.ramLeakTimer > 0) {
    const el = document.createElement('div');
    el.className = 'status-effect ram-leak';
    el.textContent = `RAM LEAK (${Math.ceil(state.ramLeakTimer/60)}s)`;
    sb.appendChild(el);
  }
  if (state.cpuThrottleTimer > 0) {
    const el = document.createElement('div');
    el.className = 'status-effect cpu-throttle';
    el.textContent = `CPU THROTTLE (${Math.ceil(state.cpuThrottleTimer/60)}s)`;
    sb.appendChild(el);
  }
}

// ===== TOWERS =====
function selectTower(type) {
  if (state.gameOver) return;
  state.selectedTowerType = type;
  state.selectedTowerObj  = null;
  document.getElementById('btn-sell').style.display = 'none';
  document.querySelectorAll('.tower-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('card-' + type)?.classList.add('selected');
  const def = TOWER_DEFS[type];
  document.getElementById('selected-info').innerHTML = `
    <div class="info-name">${def.name}</div>
    <div style="color:var(--text-dim);font-size:9px;margin:4px 0">${def.desc}</div>
    <div class="info-stat">Custo: ${def.cost} MB</div>
    <div class="info-stat">Range: ${def.range} | DPS: ${def.dmg}</div>
  `;
}

function placeTower(col, row) {
  if (PATH_SET.has(`${col},${row}`)) return;
  if (state.towers.find(t => t.col===col && t.row===row)) return;
  const def = TOWER_DEFS[state.selectedTowerType];
  if (state.ram < def.cost) { log(`RAM insuficiente! (${def.cost} MB necessário)`, 'err'); return; }
  state.ram -= def.cost;
  const id = ++state.towerIdCounter;
  state.towers.push({
    id, type: state.selectedTowerType, col, row,
    x: col*CELL+CELL/2, y: row*CELL+CELL/2,
    level: 1, path: null, cooldown: 0, disabled: 0
  });
  log(`${def.name} instalado em [${col},${row}]`, 'ok');
  updateUI();
}

function clickTower(t) {
  state.selectedTowerType = null;
  state.selectedTowerObj  = t;
  document.querySelectorAll('.tower-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('btn-sell').style.display = 'block';
  const def = TOWER_DEFS[t.type];
  const pathDef = (def.paths && t.path) ? def.paths[t.path] : null;
  const upgCost = def.cost;
  const canUpg = t.level < 3 && state.ram >= upgCost;
  document.getElementById('selected-info').innerHTML = `
    <div class="info-name">${def.name}</div>
    <div class="info-stat">Nível: ${t.level}/3</div>
    <div class="info-stat">Caminho: ${t.path || 'base'}</div>
    ${t.disabled > 0 ? '<div style="color:var(--red);font-size:9px">⚠ DESATIVADA!</div>' : ''}
    <div style="margin-top:6px">
      <button class="btn btn-cyan" style="width:100%;font-size:9px;margin-bottom:4px" ${t.level>=3?'disabled':''} onclick="openUpgradeModal()">
        ▲ UPGRADE (${upgCost} MB)
      </button>
    </div>
  `;
}

function sellTower() {
  if (!state.selectedTowerObj) return;
  const t = state.selectedTowerObj;
  const def = TOWER_DEFS[t.type];
  const refund = def.sellValue * t.level;
  state.towers = state.towers.filter(x => x !== t);
  state.ram += refund;
  state.selectedTowerObj = null;
  document.getElementById('btn-sell').style.display = 'none';
  document.getElementById('selected-info').innerHTML = '<div style="color:var(--text-dim);font-size:10px">Torre removida.</div>';
  log(`${def.name} removida. +${refund} MB RAM recuperado.`, 'warn');
  updateUI();
}

function deselectAll() {
  state.selectedTowerType = null;
  state.selectedTowerObj  = null;
  document.querySelectorAll('.tower-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('btn-sell').style.display = 'none';
  document.getElementById('selected-info').innerHTML = '<div style="color:var(--text-dim);font-size:10px">Selecione uma torre no painel<br>e clique no grid para instalar.</div>';
}

// ===== WAVE / BUGS =====
function startWave() {
  if (state.gameOver || state.waveActive) return;
  state.wave++;
  const dc = DIFF_CONFIG[state.difficulty];

  // Check boss wave
  const bossDef = BOSS_DEFS.find(b => b.wave === state.wave);

  // ESCALABILIDADE DE HORDA: fórmula agressiva Base + (Wave * 2.5) com fator exponencial aumentado
  const BASE_BUGS = 14;
  const count = Math.floor(BASE_BUGS + (state.wave * 2.5) + Math.floor(Math.pow(state.wave, 1.35)));
  const hpScale = getWaveHpScale(state.wave) * dc.hpMult;

  // PROGRESSÃO DINÂMICA SENIOR: a cada 2 rodadas +5% velocidade
  let seniorSpeedBonus = 1;
  if (state.difficulty === 'hard' && state.wave > 1) {
    seniorSpeedBonus = 1 + (Math.floor((state.wave - 1) / 2) * 0.05);
  }
  const speedBoost = dc.speedMult * seniorSpeedBonus;

  // INTERVALO DE SPAWN dinâmico: reduz com a wave (efeito enxame)
  const baseInterval = 90;
  const minInterval = 20;
  state.spawnInterval = Math.max(minInterval, baseInterval - state.wave * 5);

  state.waveActive = true; state.waveInProgress = true;
  state.bugsThisWave = count + (bossDef ? 1 : 0);
  state.bugsKilled = 0;
  state.bugSpawnQueue = [];

  // Build queue
  for (let i = 0; i < count; i++) {
    const typeIdx = Math.min(BUG_TYPES.length - 1, Math.floor(Math.random() * Math.min(BUG_TYPES.length, 3 + Math.floor(state.wave/2))));
    const bt = BUG_TYPES[typeIdx];
    const hpVal = Math.max(4, Math.floor(bt.hp * hpScale));
    state.bugSpawnQueue.push({ ...bt, hp: hpVal, maxHp: hpVal, speed: bt.speed * speedBoost });
  }

  // Boss spawn (at middle of wave)
  if (bossDef) {
    const seniorBossMult = state.difficulty === 'hard' ? 1.5 : 1;
    const bossHp = Math.floor(bossDef.hp * hpScale * seniorBossMult);
    const bossEntry = {
      ...bossDef, hp: bossHp, maxHp: bossHp,
      speed: bossDef.speed * speedBoost,
      isBoss: true, size: bossDef.size,
      dead: false, reached: false, slow:0, slowTimer:0, boostTimer:0,
      slowResist: state.difficulty === 'hard' ? 0.55 : 0,
      _origSpeed: bossDef.speed * speedBoost, _boosted: false,
      abilityTimer: bossDef.abilityTimer,
      id: Math.random()
    };
    // Insert boss after 1/3 of queue
    const insertAt = Math.floor(count / 3);
    state.bugSpawnQueue.splice(insertAt, 0, bossEntry);

    if (bossDef.isFinalBoss) {
      // Terminal Zero: special bar
      document.getElementById('terminal-zero-bar').classList.add('visible');
      document.getElementById('tz-bar-fill').style.width = '100%';
      document.getElementById('tz-hp-text').textContent = `${bossHp} / ${bossHp}`;
      document.getElementById('boss-bar').classList.remove('visible');
    } else {
      document.getElementById('boss-bar').classList.add('visible');
      document.getElementById('boss-name').textContent = bossDef.name;
      document.getElementById('boss-bar-fill').style.width = '100%';
      document.getElementById('boss-hp-text').textContent = `${bossHp} HP`;
    }
    log(`⚠ BOSS WAVE! ${bossDef.name} se aproxima${state.difficulty === 'hard' ? ' com blindagem Senior' : ''}!`, 'boss');
  }

  state.spawnTimer = 0;
  document.getElementById('btn-wave').disabled = true;
  updateUI();
  const seniorMsg = (state.difficulty === 'hard' && seniorSpeedBonus > 1) ? ` | Senior Speed x${seniorSpeedBonus.toFixed(2)}` : '';
  log(`WAVE ${state.wave} — ${count} bugs | HP x${hpScale.toFixed(2)} | Interval: ${state.spawnInterval}t${seniorMsg}`, 'info');

  // Wave 21: Terminal Zero final boss transition
  if (state.wave === 21) {
    state.isFinalBossWave = true;
    log('⚠⚠⚠ WAVE 21 — TERMINAL_ZERO SE APROXIMA! ⚠⚠⚠', 'boss');
    log('O CORE OVERLORD acordou. Derrote-o para vencer!', 'boss');
  }

  // Trigger malware popups during waves
  state.popupCooldown = 600 + Math.random() * 600;
}

function spawnBugFromQueue() {
  if (state.bugSpawnQueue.length === 0) return;
  const item = state.bugSpawnQueue.shift();
  const proto = { ...item };
  const startPx = PATH[0][0]*CELL + CELL/2;
  const startPy = PATH[0][1]*CELL + CELL/2;
  if (proto.isBoss) {
    state.bugs.push({
      ...proto, pathIdx:0,
      x: startPx, y: startPy,
    });
    state.currentBoss = state.bugs[state.bugs.length - 1];
  } else {
    state.bugs.push({
      ...proto, pathIdx:0, x:startPx, y:startPy,
      dead:false, reached:false, slow:0, slowTimer:0, boostTimer:0,
      _origSpeed: proto.speed, _boosted:false, id: Math.random()
    });
  }
}

function spawnMiniAt(templateTag, x, y, pathIdx) {
  const proto = BUG_TYPES.find(b => b.type===templateTag||b.tag===templateTag||b.label===templateTag);
  if (!proto) return;
  const dc = DIFF_CONFIG[state.difficulty];
  const hpScale = getWaveHpScale(state.wave) * dc.hpMult;
  const hpVal = Math.floor(proto.hp * 0.6 * hpScale);
  state.bugs.push({
    ...proto, pathIdx: pathIdx||0, x, y,
    dead:false, reached:false, slow:0, slowTimer:0, boostTimer:0,
    _origSpeed: proto.speed, _boosted:false, id: Math.random(),
    hp: hpVal, maxHp: hpVal,
    speed: proto.speed * dc.speedMult
  });
}

// ===== MALWARE POPUPS =====
function spawnMalwarePopup() {
  const wrap = document.getElementById('canvas-wrap');
  const wRect = wrap.getBoundingClientRect();
  const tmpl = POPUP_TEMPLATES[Math.floor(Math.random() * POPUP_TEMPLATES.length)];

  const popup = document.createElement('div');
  popup.className = 'malware-popup ' + tmpl.style;
  popup.dataset.reward = tmpl.reward;
  popup.dataset.penalty = tmpl.penalty;
  popup.dataset.drain = getMalwareDrainPerSecond();

  const maxX = wRect.width - 270;
  const maxY = wRect.height - 180;
  popup.style.left = (40 + Math.random() * Math.max(0, maxX - 80)) + 'px';
  popup.style.top  = (40 + Math.random() * Math.max(0, maxY - 80)) + 'px';

  popup.innerHTML = `
    <div class="popup-titlebar">
      <span>${tmpl.title}</span>
      <button class="popup-close" data-action="close">✕</button>
    </div>
    <div class="popup-body" data-action="body">
      <span class="popup-icon">${tmpl.icon}</span>
      <div class="popup-title-text">${tmpl.heading}</div>
      <div style="white-space:pre-line">${tmpl.body}</div>
      <div style="color:var(--red);font-size:9px;margin-top:6px">DRENO: -${popup.dataset.drain} MB RAM/s</div>
      <div class="popup-fake-btn" data-action="fake">${tmpl.fakeBtn}</div>
    </div>
  `;

  // Close button click — REWARD
  popup.querySelector('.popup-close').addEventListener('click', (e) => {
    e.stopPropagation();
    const reward = parseInt(popup.dataset.reward);
    state.ram += reward;
    addFloat(wRect.left + 200, wRect.top + 100, `+${reward}MB BONUS!`, '#00ff41');
    log(`Malware bloqueado! +${reward} MB RAM`, 'ok');
    popup.remove();
    state.activePopups = state.activePopups.filter(p => p !== popup);
    updateUI();
  });

  // Body / fake button click — PENALTY
  const applyPenalty = (e) => {
    const penalty = popup.dataset.penalty;
    const clickDrain = getMalwareDrainPerSecond();
    state.ram = Math.max(0, state.ram - clickDrain);
    addFloat(wRect.left + 200, wRect.top + 100, `-${clickDrain}MB`, '#ff2244');
    if (penalty === 'ram_leak') {
      state.ramLeakTimer = 300; // 5 seconds
      log(`⚠ RAM LEAK ativado! Penalidade dinâmica: -${clickDrain} MB`, 'err');
    } else if (penalty === 'cpu_throttle') {
      state.cpuThrottleTimer = 300;
      log(`⚠ CPU THROTTLE! Penalidade dinâmica: -${clickDrain} MB`, 'err');
    }
    popup.remove();
    state.activePopups = state.activePopups.filter(p => p !== popup);
    updateUI();
  };

  popup.querySelector('.popup-body').addEventListener('click', applyPenalty);
  popup.querySelector('.popup-fake-btn').addEventListener('click', (e) => { e.stopPropagation(); applyPenalty(e); });

  wrap.appendChild(popup);
  state.activePopups.push(popup);
  log(`⚠ MALWARE DETECTADO! Dreno ativo: -${popup.dataset.drain} MB/s por janela.`, 'warn');
}

// ===== UPDATE LOOP =====
let gamePaused = false;
let gameSpeed = 1; // 1 = normal, 2 = fast forward

function toggleSpeed() {
  gameSpeed = gameSpeed === 1 ? 2 : 1;
  const btn = document.getElementById('btn-speed');
  if (gameSpeed === 2) {
    btn.textContent = '⚡ SPEED: 2x';
    btn.style.borderColor = 'var(--yellow)';
    btn.style.color = 'var(--yellow)';
    btn.style.boxShadow = '0 0 10px rgba(255,230,0,0.4)';
  } else {
    btn.textContent = '▷ SPEED: 1x';
    btn.style.borderColor = '';
    btn.style.color = '';
    btn.style.boxShadow = '';
  }
}

function update() {
  if (state.gameOver || gamePaused) return;
  state.tick++;

  state.activePopups = state.activePopups.filter(p => p.isConnected);
  if (state.activePopups.length > 0) {
    state.malwareDrainTicker++;
    if (state.malwareDrainTicker >= 60) {
      state.malwareDrainTicker = 0;
      const drain = getMalwareDrainPerSecond();
      const totalDrain = drain * state.activePopups.length;
      state.ram = Math.max(0, state.ram - totalDrain);
      addFloat(COLS*CELL/2, ROWS*CELL/2 - 24, `-${totalDrain} RAM MALWARE`, '#ff2244');
      if (state.ram <= 0) log('⚠ RAM zerada por pop-ups persistentes. Feche as janelas pelo X.', 'err');
      updateUI();
    }
  } else {
    state.malwareDrainTicker = 0;
  }

  // RAM Leak effect
  if (state.ramLeakTimer > 0) {
    state.ramLeakTimer--;
    if (state.tick % 60 === 0) {
      state.ram = Math.max(0, state.ram - 5);
      addFloat(COLS*CELL/2, ROWS*CELL/2, '-5 RAM LEAK', '#ff2244');
      updateUI();
    }
  }

  // CPU Throttle effect
  if (state.cpuThrottleTimer > 0) {
    state.cpuThrottleTimer--;
    if (state.cpuThrottleTimer === 0) updateUI();
  }

  // Malware popup trigger
  if (state.waveActive && state.activePopups.length < 6) {
    state.popupCooldown--;
    if (state.popupCooldown <= 0) {
      spawnMalwarePopup();
      state.popupCooldown = 800 + Math.random() * 800;
    }
  }

  if (state.waveActive && state.bugSpawnQueue.length > 0) {
    state.spawnTimer--;
    if (state.spawnTimer <= 0) {
      spawnBugFromQueue();
      state.spawnTimer = state.spawnInterval;
    }
  }

  // Move bugs
  for (const bug of state.bugs) {
    if (bug.dead || bug.reached) continue;
    if (bug.slowTimer > 0) bug.slowTimer--;
    if (bug.boostTimer > 0) {
      bug.boostTimer--;
      if (bug.boostTimer === 0 && bug._origSpeed) { bug.speed = bug._origSpeed; bug._boosted = false; }
    }

    // Boss ability
    if (bug.isBoss && !bug.dead) {
      bug.abilityTimer--;
      if (bug.abilityTimer <= 0) {
        bug.abilityTimer = bug.abilityCooldown;

        // ROOT_EXPLOIT: Silent Stealth — invisible for 2s every 5s
        if (bug.ability === 'stealth') {
          bug.stealthActive = true;
          bug.stealthTimer = bug.stealthDuration || 120;
          bug.abilityGlowTimer = 60;
          log(`ROOT_EXPLOIT ativou SILENT STEALTH! Torres cegas por 2s!`, 'boss');
        }

        // SQL_INJECTOR: shoot data fragment toward core
        if (bug.ability === 'ram_drain') {
          const drain = bug.ramDrainAmount || 50;
          state.dataFragments = state.dataFragments || [];
          const [ec, er] = PATH[PATH.length - 1];
          const tx = ec * CELL + CELL / 2, ty = er * CELL + CELL / 2;
          state.dataFragments.push({ x: bug.x, y: bug.y, tx, ty, life: 90, maxLife: 90, drain });
          bug.abilityGlowTimer = 45;
          log(`SQL_INJECTOR disparou fragmento de dados! -${drain} RAM se atingir o Core!`, 'boss');
        }

        // TERMINAL_ZERO: Kernel Panic — disable a random high-level tower for 3 seconds
        if (bug.ability === 'kernel_panic') {
          const highTowers = state.towers.filter(t => t.level >= 2 && t.disabled <= 0);
          if (highTowers.length > 0) {
            const target = highTowers[Math.floor(Math.random() * highTowers.length)];
            target.disabled = 180; // 3 seconds at 60fps
            addFloat(target.x, target.y - 20, '⚡ KERNEL PANIC!', '#ff8800');
            log(`TERMINAL_ZERO usou KERNEL PANIC! Torre desativada por 3s!`, 'boss');
            document.getElementById('tz-kp-badge').classList.add('active');
            setTimeout(() => document.getElementById('tz-kp-badge').classList.remove('active'), 2000);
          }
        }
      }

      // Stealth tick-down
      if (bug.stealthActive) {
        bug.stealthTimer--;
        if (bug.stealthTimer <= 0) { bug.stealthActive = false; }
      }

      // ZERO_DAY aura_corruption: continuous aura affecting nearby towers
      if (bug.ability === 'aura_corruption' && !bug.dead) {
        const corrRadius = (bug.corruptionRadius || 5) * CELL;
        const debuff = bug.fireRateDebuff || 0.4;
        for (const tower of state.towers) {
          const dist = Math.hypot(tower.x - bug.x, tower.y - bug.y);
          tower.corruptionDebuff = dist <= corrRadius ? debuff : 0;
        }
        if (!bug.corruptionLogged) {
          bug.corruptionLogged = true;
          log(`ZERO_DAY — Aura de Corrupcao ativa! Fire Rate -40% em raio proximo!`, 'boss');
        }
      }

      // TERMINAL_ZERO: Data Corruption — leave corrupted trail every 15 frames
      if (bug.isFinalBoss && bug.dataCorruption) {
        bug._dcTimer = (bug._dcTimer || 0) + 1;
        if (bug._dcTimer >= 15) {
          bug._dcTimer = 0;
          const col = Math.floor(bug.x / CELL), row = Math.floor(bug.y / CELL);
          if (!PATH_SET.has(`${col},${row}`)) {
            state.corruptedTrail = state.corruptedTrail || [];
            const exists = state.corruptedTrail.some(c => c.col === col && c.row === row);
            if (!exists) {
              state.corruptedTrail.push({ col, row, life: 600 });
              document.getElementById('tz-dc-badge').classList.add('active');
              setTimeout(() => document.getElementById('tz-dc-badge').classList.remove('active'), 1000);
            }
          }
        }
        // Apply range debuff to towers near corrupted trail
        const corrSet = new Set((state.corruptedTrail||[]).map(c=>`${c.col},${c.row}`));
        for (const tower of state.towers) {
          let nearCorruption = false;
          for (let dc2=-1; dc2<=1; dc2++) for (let dr=-1; dr<=1; dr++) {
            if (corrSet.has(`${tower.col+dc2},${tower.row+dr}`)) { nearCorruption = true; break; }
          }
          tower.dataCorruptionDebuff = nearCorruption ? 0.5 : 0;
        }
      }

      // Update TERMINAL_ZERO HP bar
      if (bug.isFinalBoss) {
        document.getElementById('tz-bar-fill').style.width = (bug.hp / bug.maxHp * 100) + '%';
        document.getElementById('tz-hp-text').textContent = `${Math.max(0, bug.hp)} / ${bug.maxHp}`;
      } else {
        // Update normal boss HP bar
        document.getElementById('boss-bar-fill').style.width = (bug.hp / bug.maxHp * 100) + '%';
        document.getElementById('boss-hp-text').textContent = `${Math.max(0, bug.hp)} / ${bug.maxHp}`;
      }
    }

    const slowFactor = (bug.slowTimer > 0 && bug.type !== 'ENCRYPTOR') ? (1 - (bug.slow||0)) : 1;
    const spd = (bug.speed||0.6) * slowFactor * 1.5;

    const nextIdx = bug.pathIdx + 1;
    if (nextIdx >= PATH.length) {
      bug.reached = true;
      state.isPerfectRun = false;
      if (bug.isFinalBoss) {
        // TERMINAL_ZERO instant kills the core
        state.lives = 0;
        updateUI();
        addFloat(bug.x, bug.y, '☠ CORE DESTROYED', '#cc00ff');
        log('☠ TERMINAL_ZERO atingiu o Core — MORTE INSTANTÂNEA!', 'boss');
        triggerGameOver();
        document.getElementById('terminal-zero-bar').classList.remove('visible');
        state.currentBoss = null;
      } else if (bug.isBoss) {
        // Normal boss deals 6 damage
        const dmg = 6;
        state.lives = Math.max(0, state.lives - dmg);
        updateUI();
        addFloat(bug.x, bug.y, `-${dmg} LIVES [BOSS]`, '#ff2244');
        if (state.lives <= 0) triggerGameOver();
        document.getElementById('boss-bar').classList.remove('visible');
        state.currentBoss = null;
      } else {
        // Regular bug deals 1 damage
        state.lives = Math.max(0, state.lives - 1);
        updateUI();
        addFloat(bug.x, bug.y, '-1 LIFE', '#ff2244');
        if (state.lives <= 0) triggerGameOver();
      }
      continue;
    }
    const [nc, nr] = PATH[nextIdx];
    const tx = nc*CELL+CELL/2, ty = nr*CELL+CELL/2;
    const dx = tx-bug.x, dy = ty-bug.y; const dist = Math.sqrt(dx*dx+dy*dy);
    if (dist < spd) { bug.x=tx; bug.y=ty; bug.pathIdx=nextIdx; } else { bug.x+=dx/dist*spd; bug.y+=dy/dist*spd; }
  }

  // RAM Generator towers — só gera durante wave ativa, taxa reduzida
  for (const tower of state.towers) {
    const baseDef = TOWER_DEFS[tower.type];
    if (baseDef && baseDef.isGenerator) {
      tower._genPulse = (tower._genPulse || 0) + 1;
      // BALANCEAMENTO: apenas gera RAM se uma wave estiver em andamento
      if (!(state.waveInProgress || state.waveActive)) continue;
      tower.genTimer = (tower.genTimer || 0) + 1;
      // BALANCEAMENTO: intervalo maior (8s no lvl1, 6s no lvl2, 5s no lvl3)
      //   antes era 5s/4s/3s — agora 8s/6.5s/5.5s
      const interval = Math.max(200, baseDef.genInterval + 180 - (tower.level - 1) * 90);
      // BALANCEAMENTO: quantidade menor (+8/+12/+15 antes era +15/+30/+45)
      const amount = 8 + (tower.level - 1) * 4; // lvl1=8, lvl2=12, lvl3=16
      if (tower.genTimer >= interval) {
        tower.genTimer = 0;
        state.ram += amount;
        state.totalRamEarned += amount;
        addFloat(tower.x, tower.y - 10, `+${amount}MB`, '#00e5ff');
        updateUI();
      }
    }
  }

  // Tower attacks
  for (const tower of state.towers) {
    if (TOWER_DEFS[tower.type]?.isGenerator) continue; // skip generators
    if (tower.disabled > 0) { tower.disabled--; continue; }
    tower.cooldown--;
    if (tower.cooldown > 0) continue;
    const base = TOWER_DEFS[tower.type];
    const pathDef = (base.paths && tower.path) ? base.paths[tower.path] : {};
    const throttleMult = state.cpuThrottleTimer > 0 ? 0.65 : 1;
    const corruptMult = 1 - (tower.corruptionDebuff || 0); // 0.4 debuff = 0.6 rate
    const dataCorruptRangeMult = 1 - (tower.dataCorruptionDebuff || 0); // 0.5 debuff from TZ trail
    const effRange = ((base.range + (pathDef.rangeBonus||0) + (tower.level-1)*0.5) * CELL) * throttleMult * dataCorruptRangeMult;
    const effDmg   = Math.floor((base.dmg + (pathDef.dmgBonus||0)) * tower.level * (typeof SHOP_DMG_MULT !== "undefined" ? SHOP_DMG_MULT : 1));
    const effMulti = Math.max(1, base.multiShot + (pathDef.multiShotBonus||0));
    const effSlow  = Math.max(0, (base.slow||0) + (pathDef.slowBonus||0));
    const effAoe   = Math.max(0, (base.aoe||0) + (pathDef.aoeAdd||0));

    const targets = state.bugs.filter(b => !b.dead && !b.reached && !b.stealthActive)
      .map(b => ({ b, dist: Math.hypot(b.x-tower.x, b.y-tower.y) }))
      .filter(o => o.dist <= effRange)
      .sort((a,b) => a.b.pathIdx !== b.b.pathIdx ? b.b.pathIdx - a.b.pathIdx : a.dist - b.dist);

    if (targets.length === 0) continue;
    const shots = Math.min(effMulti, targets.length);
    for (let i=0;i<shots;i++) {
      const { b } = targets[i];
      if (b.type === 'WORM' && !b._boosted) {
        b._origSpeed = b.speed; b.speed = b.speed*1.5; b.boostTimer=120; b._boosted=true;
        addFloat(b.x, b.y, 'SPEED↑', '#ffdd55');
      }
      let d = effDmg;
      if (b.evolved && b.damageResist) d = Math.floor(d * (1 - b.damageResist));
      if (tower.type === 'firewall' && (b.tag==='STRING'||b.tag==='INTEGER')) d *= 2;
      if (effAoe > 0) {
        const aoeR = effAoe*CELL;
        state.bugs.forEach(eb => {
          if (eb.dead||eb.reached) return;
          if (Math.hypot(eb.x-b.x, eb.y-b.y) <= aoeR) {
            eb.hp -= d; if (eb.hp <= 0) killBug(eb, tower);
          }
        });
        addParticle(b.x, b.y, base.color, 'aoe', aoeR);
      } else {
        if (effSlow > 0 && b.type !== 'ENCRYPTOR') {
          const resist = b.isBoss ? (b.slowResist || 0) : 0;
          b.slow = Math.max(0, effSlow * (1 - resist));
          b.slowTimer = b.isBoss ? 75 : 120;
        }
        if (pathDef.paralyzeOnHit) {
          const stunTime = b.isBoss ? Math.floor(pathDef.paralyzeOnHit * (1 - (b.slowResist || 0))) : pathDef.paralyzeOnHit;
          b.slowTimer = Math.max(b.slowTimer, stunTime);
        }
        b.hp -= d; if (b.hp <= 0) killBug(b, tower);
      }
      state.projectiles.push({ x:tower.x, y:tower.y, tx:b.x, ty:b.y, color:base.color, life:8 });
    }
    tower.cooldown = Math.max(6, Math.floor((base.fireRate - (pathDef.fireRateReduce||0)) / corruptMult));
  }

  state.projectiles = state.projectiles.filter(p => { p.life--; return p.life > 0; });
  state.floatingTexts = state.floatingTexts.filter(f => { f.y -= 0.8; f.life--; f.alpha = f.life/f.maxLife; return f.life > 0; });
  state.particles = state.particles.filter(p => { p.life--; p.x+=p.vx; p.y+=p.vy; p.alpha=p.life/p.maxLife; return p.life > 0; });

  // Decay corrupted trail cells
  if (state.corruptedTrail && state.corruptedTrail.length > 0) {
    state.corruptedTrail = state.corruptedTrail.filter(c => { c.life--; return c.life > 0; });
    // Re-evaluate tower debuffs after decay
    const corrSet = new Set(state.corruptedTrail.map(c=>`${c.col},${c.row}`));
    for (const tower of state.towers) {
      let near = false;
      for (let dc2=-1; dc2<=1 && !near; dc2++) for (let dr=-1; dr<=1 && !near; dr++) {
        if (corrSet.has(`${tower.col+dc2},${tower.row+dr}`)) near = true;
      }
      tower.dataCorruptionDebuff = near ? 0.5 : 0;
    }
  }

  // DATA FRAGMENTS (SQL_INJECTOR) — move toward core and drain RAM on arrival
  state.dataFragments = (state.dataFragments || []).filter(frag => {
    frag.life--;
    const dx = frag.tx - frag.x, dy = frag.ty - frag.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 4) {
      // Hit the core!
      state.ram = Math.max(0, state.ram - frag.drain);
      addFloat(frag.tx, frag.ty, `-${frag.drain} RAM DRAINED!`, '#bf5fff');
      log(`Fragmento SQL atingiu o Core! -${frag.drain} MB RAM!`, 'err');
      updateUI();
      return false;
    }
    const spd = 2.5;
    frag.x += dx / dist * spd;
    frag.y += dy / dist * spd;
    return frag.life > 0;
  });

  // RESISTÊNCIA EVOLUTIVA: bugs sobrevivendo >10s ganham 10% resistência + escudo visual
  const survivalTicks = 600; // 10 seconds at 60fps
  for (const bug of state.bugs) {
    if (bug.dead || bug.reached) continue;
    bug.survivalTime = (bug.survivalTime || 0) + 1;
    if (bug.survivalTime >= survivalTicks && !bug.evolved) {
      bug.evolved = true;
      bug.damageResist = 0.10; // 10% damage reduction
      addFloat(bug.x, bug.y - 10, 'EVOLVED!', '#00e5ff');
    }
  }

  // OTIMIZAÇÃO: limpar bugs dead/reached do array principal
  state.bugs = state.bugs.filter(b => !b.dead && !b.reached);

  // Wave end
  if (state.waveActive && state.bugSpawnQueue.length === 0 && state.bugs.length === 0) {
    state.waveActive = false; state.waveInProgress = false;
    state.wavesCompleted++;
    document.getElementById('btn-wave').disabled = false;
    document.getElementById('boss-bar').classList.remove('visible');
    document.getElementById('terminal-zero-bar').classList.remove('visible');
    state.currentBoss = null;
    state.dataFragments = [];
    state.corruptedTrail = [];
    state.isFinalBossWave = false;
    for (const tower of state.towers) { tower.corruptionDebuff = 0; tower.dataCorruptionDebuff = 0; }
    const dc = DIFF_CONFIG[state.difficulty];
    const waveBonus = Math.floor(25 * dc.ramMult);
    state.ram += waveBonus;
    addScore(100 * state.wave);
    updateUI();
    log(`Wave ${state.wave} concluída! +${waveBonus} MB RAM`, 'info');
    if (state.wave >= state.maxWaves) { setTimeout(()=>triggerWin(), 500); return; }
    if (state.autoStart && state.wave < state.maxWaves) {
      setTimeout(() => { if (!state.waveActive && !state.gameOver) startWave(); }, 3000);
    }
  }
}

function killBug(bug, tower) {
  if (bug.dead) return;
  bug.dead = true;
  state.bugsKilled++;
  state.totalKills++;
  const dc = DIFF_CONFIG[state.difficulty];
  const ramGain = Math.floor(bug.ram * dc.ramMult);
  state.ram += ramGain;
  state.totalRamEarned += ramGain;
  addScore(bug.ram * 5 * (bug.isBoss ? 5 : 1));
  addFloat(bug.x, bug.y, `+${ramGain}MB`, '#00ff41');
  addParticle(bug.x, bug.y, bug.color, 'burst');
  updateUI();
  if (bug.isBoss) {
    document.getElementById('boss-bar').classList.remove('visible');
    document.getElementById('terminal-zero-bar').classList.remove('visible');
    state.currentBoss = null;
    state.corruptedTrail = [];
    for (const tower of state.towers) { tower.dataCorruptionDebuff = 0; }
    if (bug.isFinalBoss) {
      state.ram += 500;
      addBossCoins(150);
      addFloat(bug.x, bug.y, '+500MB +150⬡ TERMINAL_ZERO!', '#cc00ff');
      log(`⚡⚡⚡ TERMINAL_ZERO DESTRUÍDO! +500 MB RAM! +150 MOEDAS! ⚡⚡⚡`, 'boss');
      // Trigger win immediately
      setTimeout(() => triggerWin(), 800);
    } else {
      state.ram += 50;
      addBossCoins(50);
      addFloat(bug.x, bug.y, '+50MB +50⬡ BOSS!', '#ff2d78');
      log(`BOSS derrotado! +50 MB bônus! +50 Moedas!`, 'boss');
    }
    // Clear any active corruption aura
    for (const tower of state.towers) { tower.corruptionDebuff = 0; }
  }
  if (bug.type === 'TROJAN') {
    spawnMiniAt('NUL', bug.x-8, bug.y+4, bug.pathIdx);
    spawnMiniAt('NUL', bug.x+8, bug.y-4, bug.pathIdx);
    log('TROJAN liberou 2 NULs!', 'warn');
  }
}

function addFloat(x,y,text,color) { state.floatingTexts.push({x,y,text,color,life:50,maxLife:50,alpha:1}); }
function addParticle(x,y,color,type,radius=0) {
  if (type==='aoe') { state.particles.push({x,y,vx:0,vy:0,color,life:20,maxLife:20,alpha:1,type:'aoe',radius}); return; }
  for (let i=0;i<8;i++) { const ang=Math.random()*Math.PI*2; const spd=1+Math.random()*2; state.particles.push({x,y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,color,life:25,maxLife:25,alpha:1,type:'dot'}); }
}

// ===== DRAW =====
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Grid
  ctx.strokeStyle = '#121218'; ctx.lineWidth = 1;
  for (let c=0;c<=COLS;c++) { ctx.beginPath(); ctx.moveTo(c*CELL,0); ctx.lineTo(c*CELL,canvas.height); ctx.stroke(); }
  for (let r=0;r<=ROWS;r++) { ctx.beginPath(); ctx.moveTo(0,r*CELL); ctx.lineTo(canvas.width,r*CELL); ctx.stroke(); }

  // Wave 21: Final boss background tint (deep crimson/purple)
  if (state.isFinalBossWave || (state.wave === 21 && state.waveActive)) {
    const pulse = (Math.sin(state.tick * 0.03) + 1) / 2;
    ctx.fillStyle = `rgba(80,0,40,${0.08 + pulse * 0.06})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Vignette border glow
    const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, canvas.height*0.3, canvas.width/2, canvas.height/2, canvas.height);
    grad.addColorStop(0, 'rgba(153,0,255,0)');
    grad.addColorStop(1, `rgba(153,0,255,${0.1 + pulse * 0.08})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Corrupted trail from Terminal Zero
  if (state.corruptedTrail && state.corruptedTrail.length > 0) {
    for (const cell of state.corruptedTrail) {
      const alpha = Math.min(1, cell.life / 120) * 0.65;
      const pulse = (Math.sin(state.tick * 0.1 + cell.col + cell.row) + 1) / 2;
      ctx.fillStyle = `rgba(153,0,255,${alpha * (0.3 + pulse * 0.2)})`;
      ctx.fillRect(cell.col*CELL+1, cell.row*CELL+1, CELL-2, CELL-2);
      ctx.strokeStyle = `rgba(255,0,100,${alpha * 0.5})`;
      ctx.lineWidth = 1; ctx.strokeRect(cell.col*CELL+1, cell.row*CELL+1, CELL-2, CELL-2);
      // Corruption symbol
      ctx.fillStyle = `rgba(200,0,255,${alpha * 0.8})`;
      ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('☣', cell.col*CELL+CELL/2, cell.row*CELL+CELL/2);
    }
  }

  // Path
  for (let i=0;i<PATH.length;i++) {
    const [c,r] = PATH[i];
    const alpha = 0.7 - i/PATH.length*0.4;
    ctx.fillStyle = `rgba(0,40,10,${alpha})`; ctx.fillRect(c*CELL+1, r*CELL+1, CELL-2, CELL-2);
    if (i < PATH.length-1) {
      const [nc,nr] = PATH[i+1];
      ctx.strokeStyle='rgba(0,100,30,0.4)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(c*CELL+CELL/2, r*CELL+CELL/2); ctx.lineTo(nc*CELL+CELL/2, nr*CELL+CELL/2); ctx.stroke();
    }
  }
  const [sc,sr] = PATH[0]; const [ec,er] = PATH[PATH.length-1];
  ctx.fillStyle='#00ff41'; ctx.font='9px JetBrains Mono'; ctx.textAlign='center'; ctx.fillText('ENTRY', sc*CELL+CELL/2, sr*CELL-4);
  ctx.fillStyle='#ff2244'; ctx.fillText('CORE', ec*CELL+CELL/2, er*CELL-4);

  // Particles
  for (const p of state.particles) {
    if (p.type==='aoe') {
      ctx.beginPath(); ctx.arc(p.x,p.y,p.radius*(1-p.alpha*0.5),0,Math.PI*2);
      ctx.strokeStyle=p.color; ctx.lineWidth=2; ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(p.x,p.y,2,0,Math.PI*2);
      ctx.fillStyle=p.color; ctx.fill();
    }
  }

  // Towers
  for (const tower of state.towers) {
    const def = TOWER_DEFS[tower.type];
    const pathDef = def.paths && tower.path ? def.paths[tower.path] : null;
    const x = tower.col*CELL, y = tower.row*CELL;
    const sel = state.selectedTowerObj === tower;
    const visColor  = pathDef?.color  || def.color;
    const visColor2 = pathDef?.color2 || def.color2;
    const visSymbol = pathDef?.symbol || def.symbol;
    const isDisabled = tower.disabled > 0;

    // RAM Extractor: special pulsing circular visual
    if (def.isGenerator) {
      const pulse = (Math.sin((tower._genPulse||0) * 0.06) + 1) / 2;
      const outerR = 16 + pulse * 4;
      // Outer pulsing ring
      ctx.beginPath(); ctx.arc(tower.x, tower.y, outerR, 0, Math.PI*2);
      ctx.strokeStyle = `rgba(0,229,255,${0.3 + pulse * 0.5})`;
      ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = `rgba(0,20,30,0.85)`; ctx.fill();
      // Inner glowing circle
      ctx.beginPath(); ctx.arc(tower.x, tower.y, 10 + pulse*2, 0, Math.PI*2);
      ctx.fillStyle = `rgba(0,229,255,${0.15 + pulse * 0.2})`; ctx.fill();
      ctx.strokeStyle = sel ? '#00e5ff' : `rgba(0,229,255,${0.6 + pulse*0.4})`;
      ctx.lineWidth = sel ? 2 : 1.5; ctx.stroke();
      // Rotating inner ticks
      for (let ti=0; ti<4; ti++) {
        const ang = (tower._genPulse||0) * 0.04 + ti * Math.PI / 2;
        const r1=6, r2=12;
        ctx.beginPath();
        ctx.moveTo(tower.x + Math.cos(ang)*r1, tower.y + Math.sin(ang)*r1);
        ctx.lineTo(tower.x + Math.cos(ang)*r2, tower.y + Math.sin(ang)*r2);
        ctx.strokeStyle = `rgba(0,229,255,${0.5+pulse*0.4})`; ctx.lineWidth=1.5; ctx.stroke();
      }
      // Level dots
      for (let l=0; l<tower.level; l++) {
        ctx.beginPath(); ctx.arc(tower.x - 8 + l*8, tower.y + 16, 2, 0, Math.PI*2);
        ctx.fillStyle = '#00e5ff'; ctx.fill();
      }
      // Symbol
      ctx.fillStyle = sel ? '#00e5ff' : `rgba(0,229,255,${0.8+pulse*0.2})`;
      ctx.font = 'bold 14px JetBrains Mono'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('⊕', tower.x, tower.y);
      // Badge
      ctx.font='7px JetBrains Mono'; ctx.fillStyle='rgba(0,229,255,0.6)'; ctx.textBaseline='bottom';
      ctx.fillText('RAM', tower.x, y+CELL-7);
      continue;
    }

    if (sel) {
      const throttleMult = state.cpuThrottleTimer > 0 ? 0.65 : 1;
      const range = ((def.range + (pathDef?.rangeBonus||0)) + (tower.level-1)*0.5) * CELL * throttleMult;
      ctx.beginPath(); ctx.arc(tower.x, tower.y, range, 0, Math.PI*2);
      ctx.strokeStyle=visColor+'44'; ctx.lineWidth=1; ctx.stroke();
      ctx.fillStyle=visColor+'08'; ctx.fill();
    }

    const displayColor = isDisabled ? '#555555' : visColor;
    ctx.fillStyle = sel ? visColor2 : '#0e0e18';
    ctx.strokeStyle = sel ? displayColor : displayColor+'88';
    ctx.lineWidth = sel ? 2 : 1;
    roundRect(ctx, x+4, y+4, CELL-8, CELL-8, 4); ctx.fill(); ctx.stroke();

    for (let l=0;l<tower.level;l++) { ctx.fillStyle=displayColor; ctx.fillRect(x+6+l*6, y+6, 4, 3); }
    ctx.fillStyle = isDisabled ? '#555555' : (sel ? visColor : visColor+'cc');
    ctx.font = `bold 16px JetBrains Mono`; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(isDisabled ? '⊘' : visSymbol, tower.x, tower.y);
    ctx.font='7px JetBrains Mono'; ctx.fillStyle=displayColor+'99'; ctx.textBaseline='bottom';
    ctx.fillText(def.badge, tower.x, y+CELL-7);
  }

  // Projectiles
  for (const p of state.projectiles) {
    ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.tx,p.ty);
    ctx.strokeStyle=p.color+'cc'; ctx.lineWidth=2; ctx.stroke();
    ctx.beginPath(); ctx.arc(p.tx,p.ty,3,0,Math.PI*2);
    ctx.fillStyle=p.color; ctx.fill();
  }

  // Bugs
  for (const bug of state.bugs) {
    const isBoss = bug.isBoss;
    const s = isBoss ? (bug.size || 22) : 14;
    const isSlowed = bug.slowTimer > 0;
    const isStealthed = bug.stealthActive;

    // Stealthed boss: draw semi-transparent with glitch effect
    ctx.globalAlpha = isStealthed ? 0.25 : 1;
    ctx.shadowColor=bug.color; ctx.shadowBlur=isSlowed?4:(isBoss?20:10);
    ctx.fillStyle = isSlowed ? '#333' : bug.color+'33';
    ctx.strokeStyle = isSlowed ? '#ffe60088' : bug.color;
    ctx.lineWidth = isBoss ? 2.5 : 1.5;
    if (isBoss) {
      // Boss: diamond shape
      ctx.beginPath();
      ctx.moveTo(bug.x, bug.y-s); ctx.lineTo(bug.x+s, bug.y);
      ctx.lineTo(bug.x, bug.y+s); ctx.lineTo(bug.x-s, bug.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();

      // TERMINAL_ZERO: rotating outer rings
      if (bug.isFinalBoss) {
        const rot = state.tick * 0.03;
        for (let ri = 0; ri < 3; ri++) {
          const rAngle = rot + (ri * Math.PI * 2 / 3);
          const rr = s + 8 + ri * 6;
          ctx.beginPath();
          ctx.arc(bug.x, bug.y, rr, rAngle, rAngle + Math.PI * 1.3);
          ctx.strokeStyle = `rgba(${ri===0?'255,0,100':ri===1?'153,0,255':'255,136,0'},0.7)`;
          ctx.lineWidth = 2; ctx.stroke();
        }
        // Inner pulsing core
        const corePulse = (Math.sin(state.tick * 0.08) + 1) / 2;
        ctx.beginPath(); ctx.arc(bug.x, bug.y, s * 0.4 + corePulse * 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.3 + corePulse * 0.4})`; ctx.fill();
      }

      // ZERO_DAY corruption aura visual
      if (bug.ability === 'aura_corruption') {
        const corrRadius = (bug.corruptionRadius || 5) * CELL;
        const pulse = (Math.sin(state.tick * 0.05) + 1) / 2;
        ctx.beginPath(); ctx.arc(bug.x, bug.y, corrRadius, 0, Math.PI*2);
        ctx.strokeStyle = `rgba(255,140,0,${0.15 + pulse * 0.15})`;
        ctx.lineWidth = 2 + pulse * 2; ctx.stroke();
        ctx.fillStyle = `rgba(255,140,0,${0.03 + pulse * 0.04})`; ctx.fill();
      }

      // ROOT_EXPLOIT stealth pulse ring
      if (bug.ability === 'stealth' && bug.stealthActive) {
        ctx.beginPath(); ctx.arc(bug.x, bug.y, s * 1.8, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(255,45,120,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      }

      // SQL_INJECTOR ability glow ring
      if (bug.abilityGlowTimer > 0) {
        bug.abilityGlowTimer--;
        const gAlpha = bug.abilityGlowTimer / 60;
        const gRadius = s * 2 + (1 - gAlpha) * s;
        ctx.beginPath(); ctx.arc(bug.x, bug.y, gRadius, 0, Math.PI*2);
        ctx.strokeStyle = `rgba(191,95,255,${gAlpha})`; ctx.lineWidth = 3; ctx.stroke();
      }
    } else {
      ctx.fillRect(bug.x-s/2, bug.y-s/2, s, s);
      ctx.strokeRect(bug.x-s/2, bug.y-s/2, s, s);

      // EVOLVED shield visual (cyan ring)
      if (bug.evolved) {
        const shieldPulse = (Math.sin(state.tick * 0.1 + bug.x) + 1) / 2;
        ctx.beginPath(); ctx.arc(bug.x, bug.y, s * 0.85, 0, Math.PI*2);
        ctx.strokeStyle = `rgba(0,229,255,${0.5 + shieldPulse * 0.4})`;
        ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur=0;
    ctx.fillStyle = isSlowed ? '#ffe600' : bug.color;
    ctx.font = `bold ${isBoss ? 9 : 8}px JetBrains Mono`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    if (!isStealthed) ctx.fillText(bug.label || bug.type, bug.x, bug.y);
    // HP bar
    if (!isStealthed) {
      const bw = isBoss ? 32 : 20, bh = isBoss ? 4 : 3;
      ctx.fillStyle='#111'; ctx.fillRect(bug.x-bw/2, bug.y+s/2+2, bw, bh);
      const hpRatio = bug.hp / (bug.maxHp||bug.hp);
      ctx.fillStyle = isBoss ? '#ff2d78' : (hpRatio > 0.5 ? '#00ff41' : hpRatio > 0.25 ? '#ffe600' : '#ff2244');
      ctx.fillRect(bug.x-bw/2, bug.y+s/2+2, bw*hpRatio, bh);
    }
  }

  // DATA FRAGMENTS (SQL_INJECTOR projectiles)
  for (const frag of (state.dataFragments || [])) {
    const alpha = frag.life / frag.maxLife;
    const pulse = (Math.sin(state.tick * 0.3) + 1) / 2;
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(frag.x, frag.y, 5 + pulse * 2, 0, Math.PI*2);
    ctx.fillStyle = '#bf5fff'; ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
    // trail
    ctx.beginPath(); ctx.moveTo(frag.x, frag.y);
    const tdx = frag.tx - frag.x, tdy = frag.ty - frag.y;
    const tlen = Math.sqrt(tdx*tdx + tdy*tdy);
    if (tlen > 0) { ctx.lineTo(frag.x - tdx/tlen*12, frag.y - tdy/tlen*12); }
    ctx.strokeStyle = 'rgba(191,95,255,0.4)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Floating texts
  for (const f of state.floatingTexts) {
    ctx.globalAlpha=f.alpha; ctx.fillStyle=f.color;
    ctx.font='bold 11px JetBrains Mono'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha=1;

  // Placement preview
  if (state.selectedTowerType && state.cursorCell) {
    const [cc,cr] = state.cursorCell;
    const canPlace = !PATH_SET.has(`${cc},${cr}`) && !state.towers.find(t=>t.col===cc&&t.row===cr);
    ctx.fillStyle = canPlace ? 'rgba(0,255,65,0.15)' : 'rgba(255,34,68,0.15)';
    ctx.strokeStyle = canPlace ? '#00ff4188' : '#ff224488'; ctx.lineWidth=1;
    ctx.fillRect(cc*CELL, cr*CELL, CELL, CELL); ctx.strokeRect(cc*CELL, cr*CELL, CELL, CELL);
  }

  // Status effect overlay
  if (state.ramLeakTimer > 0) {
    const flicker = Math.sin(state.tick * 0.2) * 0.04 + 0.04;
    ctx.fillStyle = `rgba(255,34,68,${flicker})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Scanlines
  for (let y=0;y<canvas.height;y+=4) { ctx.fillStyle='rgba(0,0,0,0.04)'; ctx.fillRect(0,y,canvas.width,1); }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.arcTo(x+w,y,x+w,y+r,r); ctx.lineTo(x+w,y+h-r);
  ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
  ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r);
  ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}

// ===== GAME LOOP =====
function loop() {
  const steps = gameSpeed === 2 ? 2 : 1;
  for (let i = 0; i < steps; i++) update();
  draw();
  requestAnimationFrame(loop);
}

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  state.cursorCell = [Math.floor((e.clientX-rect.left)/CELL), Math.floor((e.clientY-rect.top)/CELL)];
});
canvas.addEventListener('mouseleave', () => { state.cursorCell = null; });
canvas.addEventListener('click', e => {
  if (state.gameOver) return;
  const rect = canvas.getBoundingClientRect();
  const col = Math.floor((e.clientX-rect.left)/CELL);
  const row = Math.floor((e.clientY-rect.top)/CELL);
  const existing = state.towers.find(t => t.col===col&&t.row===row);
  if (existing) { clickTower(existing); return; }
  if (state.selectedTowerType) placeTower(col, row);
});

// ===== UPGRADE MODAL (with pause + penalty) =====
let currentChallenge = null;
let upgradeAnswered = false;

function openUpgradeModal() {
  if (!state.selectedTowerObj) return;
  const t = state.selectedTowerObj;
  const def = TOWER_DEFS[t.type];
  if (t.level >= 3) return;
  if (state.ram < def.cost) { log('RAM insuficiente para upgrade!', 'err'); return; }

  // ARCADE MODE: instant upgrade, no question, no pause
  if (!state.educationalMode) {
    // If level 1 and has paths, pick first available path
    if (t.level === 1 && def.paths && Object.keys(def.paths).length >= 2 && !t.path) {
      // Show quick path picker without pausing
      _arcadeShowPathPicker(t, def);
      return;
    }
    const chosenPath = t.path || (Object.keys(def.paths||{})[0]||null);
    state.ram -= def.cost;
    t.level++;
    if (chosenPath && !t.path) t.path = chosenPath;
    addScore(45); // reduced score for arcade upgrade
    updateUI();
    log(`[ARCADE] ${def.name} upgrade → Nível ${t.level}!`, 'info');
    clickTower(t);
    return;
  }

  // EDUCATIONAL MODE: pause + question modal
  gamePaused = true;

  upgradeAnswered = false;
  state.pendingUpgradePath = null;
  document.getElementById('modal-feedback').className = '';
  document.getElementById('modal-feedback').innerHTML = '';
  document.getElementById('modal-cancel').style.display = 'inline-block';
  document.getElementById('modal-understood').style.display = 'none';
  document.getElementById('upgrade-modal').classList.add('visible');

  // Generator tower: simplified upgrade (no paths, direct level up)
  if (def.isGenerator) {
    if (t.level >= 3) { log('RAM_Extractor já está no nível máximo!', 'warn'); return; }
    if (!state.educationalMode) {
      state.ram -= def.cost; t.level++;
      addScore(45); updateUI();
      log(`RAM_Extractor upgrade → Nível ${t.level} (geração ${def.genAmount*t.level}MB/pulso)!`, 'info');
      closeModal(); clickTower(t); return;
    }
    gamePaused = true;
    upgradeAnswered = false;
    state.pendingUpgradePath = null;
    document.getElementById('modal-feedback').className = '';
    document.getElementById('modal-feedback').innerHTML = '';
    document.getElementById('modal-cancel').style.display = 'inline-block';
    document.getElementById('modal-understood').style.display = 'none';
    document.getElementById('upgrade-modal').classList.add('visible');
    presentChallengeFor('debug', 'TRY_CATCH_SHIELD', t.level + 1, def);
    return;
  }

  if (t.level === 1 && def.paths && Object.keys(def.paths).length >= 2) {
    document.getElementById('modal-title').textContent = `Escolha o Caminho — ${def.name}`;
    document.getElementById('modal-sub').textContent = `Selecione uma especialização para ${def.name}.`;
    const row = document.getElementById('modal-options');
    row.innerHTML = '';
    Object.keys(def.paths).forEach(key => {
      const p = def.paths[key];
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.textContent = `${p.name} — ${p.desc}`;
      btn.onclick = () => { state.pendingUpgradePath = key; presentChallengeFor(t.type, key, 2, def); };
      row.appendChild(btn);
    });
    document.getElementById('modal-challenge').innerHTML = `<div style="font-size:11px;color:var(--text-dim)">Escolha um caminho para ver o desafio.</div>`;
    return;
  }
  const chosenPath = t.path || (Object.keys(def.paths||{})[0]||null);
  const targetLevel = t.level + 1;
  presentChallengeFor(t.type, chosenPath, targetLevel, def);
}

// Arcade path picker — lightweight, no pause
function _arcadeShowPathPicker(t, def) {
  gamePaused = true;
  upgradeAnswered = false;
  state.pendingUpgradePath = null;
  document.getElementById('modal-feedback').className = '';
  document.getElementById('modal-feedback').innerHTML = '';
  document.getElementById('modal-cancel').style.display = 'inline-block';
  document.getElementById('modal-understood').style.display = 'none';
  document.getElementById('upgrade-modal').classList.add('visible');
  document.getElementById('modal-title').textContent = `[ARCADE] Escolha o Caminho — ${def.name}`;
  document.getElementById('modal-sub').textContent = `Sem pergunta no modo Arcade. Custo: ${def.cost} MB RAM.`;
  document.getElementById('modal-challenge').innerHTML = `<div style="font-size:11px;color:var(--orange)">⚡ Modo Arcade: selecione a especialização e o upgrade é imediato.</div>`;
  const row = document.getElementById('modal-options');
  row.innerHTML = '';
  Object.keys(def.paths).forEach(key => {
    const p = def.paths[key];
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = `${p.name} — ${p.desc}`;
    btn.style.borderColor = 'var(--orange)';
    btn.onclick = () => {
      if (state.ram < def.cost) { log('RAM insuficiente!', 'err'); closeModal(); return; }
      state.ram -= def.cost;
      t.level++;
      t.path = key;
      addScore(45);
      updateUI();
      log(`[ARCADE] ${def.name} upgrade → Nível ${t.level} (${p.name})!`, 'info');
      closeModal();
      clickTower(t);
    };
    row.appendChild(btn);
  });
}

function presentChallengeFor(type, pathKey, targetLevel, def) {
  const bank = EDU_CHALLENGES[type]?.[pathKey]?.[targetLevel] || UPGRADE_CHALLENGES[type]?.[pathKey]?.[targetLevel] || null;
  if (bank && bank.length > 0) {
    const ch = bank[Math.floor(Math.random() * bank.length)];
    currentChallenge = ch;
    const levelBadge = { basic: 'BÁSICO', inter: 'INTERMEDIÁRIO', adv: 'AVANÇADO/ES6+' };
    const badgeCls   = { basic: 'basic', inter: 'inter', adv: 'adv' };
    document.getElementById('modal-title').textContent = `UPGRADE: ${def.name} → LVL ${targetLevel}`;
    document.getElementById('modal-sub').textContent = `Responda corretamente para desbloquear (custo: ${def.cost} MB RAM).`;
    document.getElementById('modal-challenge').innerHTML = `
      <span class="diff-badge ${badgeCls[ch.level]||'basic'}">${levelBadge[ch.level]||'BÁSICO'}</span>
      <div style="font-size:13px;color:var(--text);line-height:1.8">${ch.prompt}</div>
    `;
    const row = document.getElementById('modal-options');
    row.innerHTML = '';
    [...ch.options].sort(() => Math.random() - 0.5).forEach(o => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.textContent = o;
      btn.onclick = () => answerChallenge(o, btn, ch, type, pathKey);
      row.appendChild(btn);
    });
  } else {
    document.getElementById('modal-challenge').innerHTML = `<div style="font-size:12px;color:var(--text-dim)">Desafio indisponível. Tente novamente.</div>`;
    document.getElementById('modal-options').innerHTML = '';
  }
}

function renderChallengeExplanation(ch, isCorrect, penalty = 0) {
  const code = ch.code ? `<pre class="challenge-code">${escapeHTML(ch.code)}</pre>` : '';
  const status = isCorrect ? 'Resposta correta.' : `Resposta correta: <strong>${escapeHTML(ch.correct)}</strong>.`;
  const penaltyText = penalty > 0 ? ` Penalidade: -${penalty} MB RAM.` : '';
  return `${status}${penaltyText}<br>${escapeHTML(ch.explain || '')}${code}`;
}

function answerChallenge(answer, btn, challenge, type, pathKey) {
  if (upgradeAnswered) return;
  upgradeAnswered = true;
  const fb = document.getElementById('modal-feedback');
  const ch = challenge || currentChallenge;
  document.querySelectorAll('.option-btn').forEach(b => { b.disabled = true; });
  document.getElementById('modal-cancel').style.display = 'none';
  document.getElementById('modal-understood').style.display = 'inline-block';

  if (answer === ch.correct) {
    btn.classList.add('correct');
    fb.className = 'ok';
    fb.innerHTML = renderChallengeExplanation(ch, true);
    const t = state.selectedTowerObj;
    const def = TOWER_DEFS[t.type];
    state.ram -= def.cost; t.level++;
    if (state.pendingUpgradePath) { t.path = state.pendingUpgradePath; state.pendingUpgradePath = null; }
    else if (pathKey) { t.path = pathKey; }
    addScore(75);
    updateUI();
    log(`${def.name} upgrade → Nível ${t.level}!`, 'info');
    clickTower(t);
  } else {
    btn.classList.add('wrong');
    fb.className = 'fail';
    const penalty = 0;
    fb.innerHTML = renderChallengeExplanation(ch, false, penalty);
    document.querySelectorAll('.option-btn').forEach(b => { if (b.textContent === ch.correct) b.classList.add('correct'); });
    state.pendingUpgradePath = null;
    updateUI();
  }
}

function closeModal() {
  document.getElementById('upgrade-modal').classList.remove('visible');
  state.pendingUpgradePath = null;
  gamePaused = false; // UNPAUSE
}

// ===== GAME OVER / WIN / RESET =====
function finalizeScore(won) {
  if (state.scoreFinalized) return state.finalScore || state.score;
  state.won = won;
  const perfectMult = won && state.isPerfectRun ? 1.5 : 1;
  const arcadeMult = state.educationalMode ? 1.0 : 0.6;
  const finalScore = Math.floor(state.score * perfectMult * arcadeMult);
  state.finalScore = finalScore;
  state.arcadeMult = arcadeMult;
  state.perfectMult = perfectMult;
  state.baseScore = state.score;
  state.score = finalScore;
  state.scoreFinalized = true;
  state.savedToTop10 = recordScore(finalScore, won);
  // Add shop points (addShopPoints defined in shop section below)
  if (typeof addShopPoints === 'function') addShopPoints(finalScore);
  updateUI();
  return finalScore;
}

function triggerGameOver() {
  state.gameOver = true;
  const finalScore = finalizeScore(false);
  document.getElementById('overlay-title').textContent = 'GAME_OVER';
  document.getElementById('overlay-title').className = 'lose';
  document.getElementById('overlay-msg').textContent = 'SISTEMA COMPROMETIDO — BREACH CONFIRMADO';
  document.getElementById('final-score').textContent = finalScore;
  document.getElementById('overlay-stats').innerHTML = `
    Waves: ${state.wavesCompleted} / ${state.maxWaves}<br>
    Bugs eliminados: ${state.totalKills}<br>
    RAM total coletado: ${state.totalRamEarned} MB<br>
    ${state.savedToTop10 ? 'Novo registro no Top 10 local!' : 'Score fora do Top 10 local.'}
  `;
  document.getElementById('overlay').classList.add('visible');
}

function triggerWin() {
  state.gameOver = true;
  const finalScore = finalizeScore(true);
  const isFinalBoss = state.wave === 21;
  document.getElementById('overlay-title').textContent = isFinalBoss ? 'CORE DEFENDED' : 'SISTEMA PROTEGIDO';
  document.getElementById('overlay-title').className = 'win';
  document.getElementById('overlay-msg').textContent = isFinalBoss
    ? '⚡ TERMINAL_ZERO DESTRUÍDO — O CORE ESTÁ SEGURO ⚡'
    : 'TODOS OS VETORES BLOQUEADOS. ACESSO GARANTIDO.';
  document.getElementById('final-score').textContent = finalScore;
  const diffLabel = DIFF_CONFIG[state.difficulty]?.label || state.difficulty;
  const diffMult = DIFF_CONFIG[state.difficulty]?.scoreMult || 1;
  const arcadeMult = state.educationalMode ? 1.0 : 0.6;
  const arcadeLabel = state.educationalMode ? '1.0 (Educativo)' : '0.6 (Arcade)';
  const perfectLabel = (state.isPerfectRun ? 'x1.5 (Perfect System)' : 'x1.0');
  document.getElementById('overlay-stats').innerHTML = `
    <div style="font-size:11px;color:var(--cyan);letter-spacing:1px;margin-bottom:8px">
      Score Base × Dificuldade × Modo = Score Final
    </div>
    <div style="font-size:10px;color:var(--text);margin-bottom:8px">
      ${state.baseScore || state.finalScore} × ${perfectLabel} × ${arcadeLabel} = <span style="color:var(--green);font-weight:700">${finalScore}</span>
    </div>
    Waves concluídas: ${state.wavesCompleted} / ${state.maxWaves}<br>
    Bugs eliminados: ${state.totalKills}<br>
    RAM coletado: ${state.totalRamEarned} MB<br>
    Perfect System: ${state.isPerfectRun ? 'ATIVO (x1.5)' : 'inativo'}<br>
    Modo: ${state.educationalMode ? 'EDUCATIVO (x1.0)' : 'ARCADE (x0.6)'}<br>
    ${state.savedToTop10 ? 'Novo registro no Top 10 local!' : 'Score fora do Top 10 local.'}
  `;
  document.getElementById('overlay').classList.add('visible');
}

function resetGame() {
  document.getElementById('overlay').classList.remove('visible');
  document.getElementById('log-box').innerHTML = '';
  clearMalwarePopups();
  const dc = DIFF_CONFIG[state.difficulty];
  const wasEdu = state.educationalMode;
  initState();
  state.difficulty = selectedDiff;
  state.ram = dc.ram;
  state.educationalMode = wasEdu;
  updateUI(); deselectAll();
  document.getElementById('btn-wave').disabled = false;
  document.getElementById('boss-bar').classList.remove('visible');
  document.getElementById('terminal-zero-bar').classList.remove('visible');
  gamePaused = false;
  gameSpeed = 1;
  const speedBtn = document.getElementById('btn-speed');
  if (speedBtn) { speedBtn.textContent = '▷ SPEED: 1x'; speedBtn.style.borderColor = ''; speedBtn.style.color = ''; speedBtn.style.boxShadow = ''; }
  log('Sistema reiniciado.', 'info');
}

function toggleAutoStart() {
  state.autoStart = !state.autoStart;
  const btn = document.getElementById('btn-auto');
  btn.textContent = `AUTO: ${state.autoStart ? 'ON' : 'OFF'}`;
  btn.style.borderColor = state.autoStart ? '#00aaff' : '';
}

function switchHomeTab(tab) {
  document.getElementById('panel-scores').style.display = tab === 'scores' ? '' : 'none';
  document.getElementById('panel-shop').style.display = tab === 'shop' ? '' : 'none';
  document.getElementById('tab-scores').style.borderBottomColor = tab === 'scores' ? 'var(--cyan)' : 'transparent';
  document.getElementById('tab-scores').style.background = tab === 'scores' ? 'rgba(0,229,255,0.08)' : 'transparent';
  document.getElementById('tab-scores').style.color = tab === 'scores' ? 'var(--cyan)' : 'var(--text-dim)';
  document.getElementById('tab-shop').style.borderBottomColor = tab === 'shop' ? 'var(--purple)' : 'transparent';
  document.getElementById('tab-shop').style.background = tab === 'shop' ? 'rgba(191,95,255,0.07)' : 'transparent';
  document.getElementById('tab-shop').style.color = tab === 'shop' ? 'var(--purple)' : 'var(--text-dim)';
  if (tab === 'shop') renderShopUI();
}

// ===== INIT =====
updateUI();
renderScoreboard();
document.getElementById('btn-wave').disabled = true;
log('CODE DEFENDER: SYSTEM BREACH v3.0 inicializado.', 'info');
initShop({ onCatActive: spawnCyberCat, onCatInactive: removeCyberCat }).then(() => {
  renderShopUI();
  renderScoreboard();
  if (loadShopData().catOwned && loadShopData().catActive) spawnCyberCat();
});
log('Autentique-se no menu para iniciar a defesa.', 'ok');
loop();




export {
  toggleGameMode, selectDiff, selectMap, cancelSession, startSession, switchHomeTab,
  selectTower, startWave, toggleAutoStart, toggleSpeed, sellTower, deselectAll,
  closeModal, closeExitConfirm, confirmExitToMenu, resetGame, goToMenu, openUpgradeModal, buyShopItem
};
