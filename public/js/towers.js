// Tower definitions extracted from code-defender-v8.html.
export const TOWER_DEFS = {
  firewall: {
    name:'Basic_Firewall', badge:'if',
    color:'#00ff41', color2:'#003311',
    cost:50, range:3.5, fireRate:60, dmg:28, multiShot:1,
    slow:0, aoe:0, desc:'Dano crítico ×2 em STRING/INT', symbol:'F',
    sellValue: 20,
    paths: {
      IF_ELSE_BLOCK: { name:'IF_ELSE_BLOCK', desc:'Foco em DANO consistente', dmgBonus:12, rangeBonus:0, multiShotBonus:0, fireRateReduce:0, symbol:'E', color:'#66ff66', color2:'#003f00' },
      ELSE_IF_CHAIN: { name:'ELSE_IF_CHAIN', desc:'Foco em ALCANCE e múltiplos alvos', dmgBonus:0, rangeBonus:1.2, multiShotBonus:1, fireRateReduce:0, symbol:'≡', color:'#00ff99', color2:'#002f1a' }
    }
  },
  loop: {
    name:'Loop_Cannon', badge:'for',
    color:'#00e5ff', color2:'#001a22',
    cost:75, range:3, fireRate:45, dmg:14, multiShot:3, slow:0, aoe:0,
    desc:'Atira em múltiplos bugs', symbol:'∀', sellValue:30,
    paths: {
      WHILE_RECURSION:{ name:'WHILE_RECURSION', desc:'Slow adicional em área', slowBonus:0.3, fireRateReduce:5, symbol:'ω', color:'#88e6ff', color2:'#001529' },
      NESTED_FOR:     { name:'NESTED_FOR', desc:'Mais disparos simultâneos', multiShotBonus:2, rangeBonus:0.5, symbol:'∑', color:'#66dfff', color2:'#001733' }
    }
  },
  debug: {
    name:'Debug_Buffer', badge:'~~',
    color:'#ffe600', color2:'#1a1400',
    cost:65, range:3, fireRate:50, dmg:10, multiShot:1, slow:0.5, aoe:0,
    desc:'Aplica slow 50% nos bugs', symbol:'D', sellValue:25,
    paths: {
      TRY_CATCH_SHIELD:{ name:'TRY_CATCH_SHIELD', desc:'Dano em área ao redor', dmgBonus:8, aoeAdd:1.2, symbol:'⊚', color:'#fff38a', color2:'#3a2e00' },
      BREAK_CONTINUE:  { name:'BREAK_CONTINUE', desc:'Paralisa bugs ao acertar', paralyzeOnHit:60, symbol:'∥', color:'#ffd84a', color2:'#2a1f00' }
    }
  },
  regex: {
    name:'Regex_Bomb', badge:'/**/',
    color:'#ff8c00', color2:'#1a0800',
    cost:100, range:2.5, fireRate:90, dmg:55, multiShot:1, slow:0, aoe:1.5,
    desc:'Explosão em área, dano a todos', symbol:'R', sellValue:40, paths:{}
  },
  ramextract: {
    name:'RAM_Extractor', badge:'RAM',
    color:'#00e5ff', color2:'#001a22',
    cost:80, range:0, fireRate:0, dmg:0, multiShot:0, slow:0, aoe:0,
    desc:'Gera +8 MB RAM a cada 8s (só durante waves). Não ataca.', symbol:'⊕', sellValue:35, paths:{},
    isGenerator:true, genAmount:8, genInterval:480 // 8s at 60fps (base, ignorado pela nova lógica)
  }
};

export function isRamGeneratorActive(state) {
  return Boolean(state?.waveInProgress || state?.waveActive);
}

export function getRamGeneratorPulse(def, tower) {
  const level = tower?.level || 1;
  return {
    interval: Math.max(200, (def?.genInterval || 480) + 180 - (level - 1) * 90),
    amount: 8 + (level - 1) * 4
  };
}
