// Enemy and boss definitions extracted from code-defender-v8.html.
export const BUG_TYPES = [
  { label:'STR', type:'STRING',    tag:'STRING',    color:'#ff5588', hp:60,  speed:1.0, ram:10 },
  { label:'INT', type:'INTEGER',   tag:'INTEGER',   color:'#ff8c00', hp:80,  speed:0.8, ram:15 },
  { label:'NUL', type:'NUL',       tag:'NULL',      color:'#888888', hp:40,  speed:1.4, ram:8  },
  { label:'OBJ', type:'OBJ',       tag:'OBJECT',    color:'#bf5fff', hp:120, speed:0.6, ram:20 },
  { label:'ARR', type:'ARR',       tag:'ARRAY',     color:'#00e5ff', hp:100, speed:0.9, ram:18 },
  { label:'TRJ', type:'TROJAN',    tag:'TROJAN',    color:'#aa00ff', hp:260, speed:0.45,ram:30 },
  { label:'WRM', type:'WORM',      tag:'WORM',      color:'#ffdd55', hp:70,  speed:1.0, ram:12 },
  { label:'ENC', type:'ENCRYPTOR', tag:'ENCRYPTOR', color:'#55ccff', hp:180, speed:0.7, ram:25 }
];

export const BOSS_DEFS = [
  {
    wave: 5, name: 'ROOT_EXPLOIT', label:'R00T', color:'#ff2d78',
    hp: 800, speed: 0.5, ram: 80, size: 22,
    ability: 'stealth', abilityTimer: 300, abilityCooldown: 300,
    stealthDuration: 120,
    desc: 'Silent Stealth — invisivel para torres por 2s a cada 5s'
  },
  {
    wave: 10, name: 'SQL_INJECTOR', label:'SQL', color:'#bf5fff',
    hp: 1100, speed: 0.42, ram: 150, size: 26,
    ability: 'ram_drain', abilityTimer: 300, abilityCooldown: 300,
    ramDrainAmount: 35,
    desc: 'Fragmentos de dados drenam 35 RAM ao atingir o Core'
  },
  {
    wave: 15, name: 'ZERO_DAY', label:'0DAY', color:'#ff8c00',
    hp: 2800, speed: 0.3, ram: 350, size: 32,
    ability: 'aura_corruption', abilityTimer: 1, abilityCooldown: 1,
    corruptionRadius: 5,
    fireRateDebuff: 0.4,
    desc: 'Aura de Corrupcao — reduz Fire Rate das torres proximas em 40%'
  },
  {
    wave: 21, name: 'TERMINAL_ZERO', label:'Ø', color:'#cc00ff',
    hp: 3200, speed: 0.22, ram: 800, size: 38,
    ability: 'kernel_panic', abilityTimer: 600, abilityCooldown: 600,
    dataCorruption: true, dataCorruptionInterval: 1,
    desc: 'O Boss Final. Kernel Panic desativa torres. Data Corruption reduz alcance.',
    isFinalBoss: true
  }
];
