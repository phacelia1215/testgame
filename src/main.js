const W = 960;
const H = 540;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ui = {
  hp: document.getElementById('hp'),
  lv: document.getElementById('lv'),
  score: document.getElementById('score'),
  time: document.getElementById('time'),
  combo: document.getElementById('combo'),
  wave: document.getElementById('wave'),
  restart: document.getElementById('restart'),
  upgrade: document.getElementById('upgrade'),
};

const ENEMIES = {
  chicken: { name: '鶏', hp: 18, spd: 58, score: 6, color: '#f2f0d6', accent: '#d43126', size: 19 },
  boar: { name: '猪', hp: 34, spd: 45, score: 12, color: '#6b4738', accent: '#d9c0a0', size: 24 },
  hound: { name: 'ハウンド', hp: 26, spd: 76, score: 10, color: '#40424c', accent: '#d9d9e2', size: 23 },
  bear: { name: 'クマ', hp: 90, spd: 32, score: 35, color: '#4a3028', accent: '#c49258', size: 34 },
  oni: { name: '鬼武者', hp: 420, spd: 26, score: 140, color: '#6d2448', accent: '#ffd45a', size: 48 },
};

const UPGRADES = [
  { id: 'rapid', name: '速射', text: '発射間隔 -12%', apply: p => { p.fireRate *= 0.88; } },
  { id: 'power', name: '火力', text: '弾ダメージ +8', apply: p => { p.damage += 8; } },
  { id: 'boots', name: 'ブーツ', text: '移動速度 +10%', apply: p => { p.speed *= 1.1; } },
  { id: 'spread', name: '拡散', text: '同時発射数 +1', apply: p => { p.spread += 1; } },
  { id: 'magnet', name: '磁石', text: 'ジェム回収範囲 +35', apply: p => { p.magnet += 35; } },
  { id: 'heart', name: 'ハート', text: '最大HP +20して全回復', apply: p => { p.maxHp += 20; p.hp = p.maxHp; } },
];

const waves = ['chicken', 'boar', 'hound', 'bear'];
const keys = {};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
let game;
let touch = null;
let shake = 0;
let raf = 0;
let lastTap = 0;

addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key.toLowerCase() === 'r') start();
  if (e.key.toLowerCase() === 'p') togglePause();
  if (e.code === 'Space') dash();
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
ui.restart.onclick = start;
document.body.addEventListener('touchstart', e => {
  const t = e.touches[0];
  const now = performance.now();
  if (now - lastTap < 280) dash();
  lastTap = now;
  touch = { sx: t.clientX, sy: t.clientY, dx: 0, dy: 0 };
}, { passive: false });
document.body.addEventListener('touchmove', e => {
  const t = e.touches[0];
  if (!touch) return;
  touch.dx = clamp((t.clientX - touch.sx) / 48, -1, 1);
  touch.dy = clamp((t.clientY - touch.sy) / 48, -1, 1);
  e.preventDefault();
}, { passive: false });
document.body.addEventListener('touchend', () => { touch = null; });

function start() {
  game = {
    player: { x: W / 2, y: H / 2, hp: 100, maxHp: 100, inv: 0, level: 1, xp: 0, need: 24, fire: 0, angle: 0, speed: 178, fireRate: 0.48, damage: 20, spread: 1, magnet: 54, dash: 0 },
    enemies: [], shots: [], sparks: [], gems: [], popups: [],
    score: 0, time: 0, last: performance.now(), state: 'playing', spawn: 0, combo: 1, comboTimer: 0, bossWave: 0,
  };
  ui.restart.textContent = 'リスタート';
  ui.upgrade.classList.add('hidden');
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(step);
}

function togglePause() {
  if (!game || game.state === 'over' || game.state === 'upgrade') return;
  game.state = game.state === 'paused' ? 'playing' : 'paused';
  game.last = performance.now();
}

function dash() {
  if (!game || game.state !== 'playing') return;
  const p = game.player;
  if (p.dash > 0) return;
  p.dash = 1.4;
  p.inv = Math.max(p.inv, 0.28);
  p.x = clamp(p.x + Math.cos(p.angle) * 86, 24, W - 24);
  p.y = clamp(p.y + Math.sin(p.angle) * 86, 28, H - 28);
  burst(p.x, p.y, '#88f1ff', 10);
}

function step(now) {
  const dt = Math.min(0.033, (now - game.last) / 1000);
  game.last = now;
  update(dt);
  draw();
  raf = requestAnimationFrame(step);
}

function update(dt) {
  if (game.state !== 'playing') return;
  game.time += dt;
  const p = game.player;
  movePlayer(p, dt);
  spawnEnemies(dt);
  shoot(dt);
  updateShots(dt);
  updateEnemies(dt);
  updateGems(dt);
  updateEffects(dt);
  if (p.hp <= 0) { game.state = 'over'; ui.restart.textContent = '再挑戦'; }
  syncHud();
}

function movePlayer(p, dt) {
  let ax = 0;
  let ay = 0;
  if (keys.arrowleft || keys.a) ax--;
  if (keys.arrowright || keys.d) ax++;
  if (keys.arrowup || keys.w) ay--;
  if (keys.arrowdown || keys.s) ay++;
  if (touch) { ax = touch.dx; ay = touch.dy; }
  const len = Math.hypot(ax, ay) || 1;
  p.x = clamp(p.x + ax / len * p.speed * dt, 24, W - 24);
  p.y = clamp(p.y + ay / len * p.speed * dt, 28, H - 28);
  if (ax || ay) p.angle = Math.atan2(ay, ax);
  p.inv -= dt;
  p.dash -= dt;
}

function spawnEnemies(dt) {
  game.spawn -= dt;
  const wave = Math.floor(game.time / 25) + 1;
  if (wave % 3 === 0 && game.bossWave !== wave) {
    spawn('oni', true);
    game.bossWave = wave;
  }
  if (game.spawn <= 0) {
    spawn(waves[Math.min(3, wave - 1)]);
    game.spawn = Math.max(0.14, 1 - game.time / 86);
  }
}

function spawn(type, boss = false) {
  const side = Math.floor(Math.random() * 4);
  const base = ENEMIES[type];
  const e = { type, ...base, maxHp: base.hp + game.time * (boss ? 1.8 : 0.35), frame: 0, boss };
  e.hp = e.maxHp;
  e.x = side < 2 ? rnd(0, W) : side === 2 ? -40 : W + 40;
  e.y = side < 2 ? (side ? H + 40 : -40) : rnd(0, H);
  if (boss) burst(e.x, e.y, '#ffd45a', 18);
  game.enemies.push(e);
}

function shoot(dt) {
  const p = game.player;
  p.fire -= dt;
  if (p.fire > 0) return;
  let target = null;
  let best = 9999;
  for (const e of game.enemies) {
    const d = dist(p, e);
    if (d < best) { best = d; target = e; }
  }
  const a = target ? Math.atan2(target.y - p.y, target.x - p.x) : p.angle;
  const count = Math.min(7, p.spread + Math.floor(p.level / 5));
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * 0.14;
    game.shots.push({ x: p.x, y: p.y, a: a + offset, v: 430, life: 1.2, dmg: p.damage + p.level * 2 });
  }
  p.fire = Math.max(0.11, p.fireRate - p.level * 0.012);
}

function updateShots(dt) {
  for (const s of game.shots) { s.x += Math.cos(s.a) * s.v * dt; s.y += Math.sin(s.a) * s.v * dt; s.life -= dt; }
  for (const s of game.shots) for (const e of game.enemies) if (!s.hit && dist(s, e) < e.size) {
    s.hit = true;
    e.hp -= s.dmg;
    game.sparks.push({ x: e.x, y: e.y, life: 0.25, c: e.accent, size: e.boss ? 24 : 16 });
  }
  game.shots = game.shots.filter(s => !s.hit && s.life > 0 && s.x > -20 && s.x < W + 20 && s.y > -20 && s.y < H + 20);
}

function updateEnemies(dt) {
  const p = game.player;
  for (const e of game.enemies) {
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    e.x += Math.cos(a) * e.spd * dt;
    e.y += Math.sin(a) * e.spd * dt;
    e.frame += dt * 8;
    if (dist(e, p) < e.size + 18 && p.inv <= 0) {
      p.hp -= e.boss ? 22 : 9;
      p.inv = 0.75;
      shake = e.boss ? 16 : 8;
    }
  }
  const dead = game.enemies.filter(e => e.hp <= 0);
  for (const e of dead) reward(e);
  game.enemies = game.enemies.filter(e => e.hp > 0);
}

function reward(e) {
  const points = Math.floor(e.score * game.combo);
  game.score += points;
  game.combo = clamp(game.combo + (e.boss ? 0.7 : 0.08), 1, 9.9);
  game.comboTimer = 3.4;
  game.gems.push({ x: e.x, y: e.y, value: e.score, life: 12, boss: e.boss });
  game.popups.push({ x: e.x, y: e.y, text: `+${points}`, life: 0.8 });
  burst(e.x, e.y, e.boss ? '#ff6bd6' : '#ffd45a', e.boss ? 24 : 8);
}

function updateGems(dt) {
  const p = game.player;
  for (const g of game.gems) {
    g.life -= dt;
    if (dist(g, p) < p.magnet) {
      const a = Math.atan2(p.y - g.y, p.x - g.x);
      g.x += Math.cos(a) * 300 * dt;
      g.y += Math.sin(a) * 300 * dt;
    }
    if (!g.taken && dist(g, p) < 24) {
      g.taken = true;
      p.xp += g.value;
      if (g.boss) p.hp = clamp(p.hp + 35, 0, p.maxHp);
    }
  }
  game.gems = game.gems.filter(g => !g.taken && g.life > 0);
  while (p.xp >= p.need) {
    p.xp -= p.need;
    p.level++;
    p.need = Math.floor(p.need * 1.35);
    p.hp = clamp(p.hp + 18, 0, p.maxHp);
    showUpgrade();
  }
}

function updateEffects(dt) {
  game.comboTimer -= dt;
  if (game.comboTimer <= 0) game.combo = Math.max(1, game.combo - dt * 1.5);
  for (const sp of game.sparks) sp.life -= dt;
  for (const po of game.popups) { po.life -= dt; po.y -= 24 * dt; }
  game.sparks = game.sparks.filter(s => s.life > 0);
  game.popups = game.popups.filter(p => p.life > 0);
}

function showUpgrade() {
  game.state = 'upgrade';
  const picks = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
  ui.upgrade.innerHTML = `<h2>レベルアップ！強化を選択</h2><div class="choices">${picks.map((u, i) => `<button class="choice" data-i="${i}"><strong>${u.name}</strong>${u.text}</button>`).join('')}</div>`;
  ui.upgrade.classList.remove('hidden');
  ui.upgrade.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => {
      picks[Number(button.dataset.i)].apply(game.player);
      ui.upgrade.classList.add('hidden');
      game.state = 'playing';
      game.last = performance.now();
    });
  });
}

function syncHud() {
  const p = game.player;
  ui.hp.textContent = `HP ${Math.max(0, Math.ceil(p.hp))}/${p.maxHp}`;
  ui.lv.textContent = `Lv ${p.level}`;
  ui.score.textContent = `Score ${game.score}`;
  ui.time.textContent = `${Math.floor(game.time)}s`;
  ui.combo.textContent = `Combo x${game.combo.toFixed(1)}`;
  ui.wave.textContent = `Wave ${Math.floor(game.time / 25) + 1}`;
}

function burst(x, y, c, count) {
  for (let i = 0; i < count; i++) game.sparks.push({ x: x + rnd(-18, 18), y: y + rnd(-18, 18), life: rnd(0.18, 0.5), c, size: rnd(6, 18) });
}

function draw() {
  canvas.width = W;
  canvas.height = H;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#17351f';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  if (shake > 0) { ctx.translate(rnd(-shake, shake), rnd(-shake, shake)); shake *= 0.85; }
  grid();
  for (const g of game.gems) gem(g);
  for (const sp of game.sparks) { ctx.fillStyle = sp.c; ctx.fillRect(sp.x - sp.size / 2, sp.y - sp.size / 2, sp.size, sp.size); }
  for (const e of game.enemies) enemy(e);
  for (const s of game.shots) { ctx.fillStyle = '#88f1ff'; ctx.fillRect(s.x - 4, s.y - 4, 8, 8); }
  player(game.player);
  for (const po of game.popups) popup(po);
  ctx.restore();
  if (game.state === 'over') overlay('GAME OVER', '画面タップ・Rキー・再挑戦ボタンで再挑戦');
  if (game.state === 'paused') overlay('PAUSED', 'Pキーで再開');
}

function grid() { ctx.fillStyle = '#214a2c'; for (let x = 0; x < W; x += 48) for (let y = 0; y < H; y += 48) ctx.fillRect(x + 22, y + 22, 4, 4); }
function px(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
function gem(g) { px(g.x - 5, g.y - 8, 10, 16, g.boss ? '#ff6bd6' : '#48e38a'); px(g.x - 8, g.y - 3, 16, 6, g.boss ? '#ffd45a' : '#b9ffd4'); }
function popup(po) { ctx.globalAlpha = clamp(po.life, 0, 1); ctx.fillStyle = '#fff4a8'; ctx.font = '18px monospace'; ctx.textAlign = 'center'; ctx.fillText(po.text, po.x, po.y); ctx.globalAlpha = 1; }

function player(p) {
  ctx.save(); ctx.translate(p.x, p.y); if (p.inv > 0 && Math.floor(p.inv * 20) % 2) ctx.globalAlpha = 0.45;
  px(-9, -26, 18, 10, '#ff433a'); px(-13, -18, 26, 22, '#5b3434'); px(-7, -14, 14, 20, '#f4f4ef'); px(-10, -31, 20, 10, '#ff2d25'); px(6, -25, 9, 5, '#b01622'); px(-5, -22, 10, 9, '#f1c7a0'); px(-19, -5, 10, 23, '#563032'); px(9, -5, 10, 23, '#563032'); px(-16, 17, 11, 28, '#4a292a'); px(5, 17, 11, 28, '#4a292a'); px(-21, 42, 19, 9, '#e94132'); px(4, 42, 19, 9, '#e94132'); px(-28, -13, 18, 8, '#e94132'); px(14, -11, 34, 8, '#30343d'); px(45, -13, 25, 18, '#596070'); px(50, -22, 15, 9, '#596070');
  ctx.restore();
}

function enemy(e) {
  ctx.save(); ctx.translate(e.x, e.y); const bob = Math.sin(e.frame) * 2;
  if (e.type === 'chicken') { px(-8, bob - 9, 16, 14, e.color); px(-2, bob - 18, 10, 10, e.color); px(4, bob - 23, 6, 6, e.accent); px(7, bob - 15, 8, 4, '#e7a52e'); px(-6, bob + 5, 3, 9, '#d89025'); px(4, bob + 5, 3, 9, '#d89025'); }
  else if (e.type === 'boar') { px(-15, bob - 9, 30, 18, e.color); px(8, bob - 14, 14, 14, e.color); px(16, bob - 6, 8, 6, e.accent); px(17, bob - 11, 5, 4, '#111'); px(-12, bob + 8, 5, 9, '#2a1b18'); px(7, bob + 8, 5, 9, '#2a1b18'); }
  else if (e.type === 'hound') { px(-16, bob - 10, 32, 16, e.color); px(10, bob - 18, 14, 14, e.color); px(14, bob - 26, 5, 9, e.color); px(19, bob - 7, 9, 5, e.accent); px(-11, bob + 6, 5, 13, '#222'); px(8, bob + 6, 5, 13, '#222'); }
  else if (e.type === 'oni') { px(-30, bob - 28, 60, 48, e.color); px(-20, bob - 47, 40, 24, e.color); px(-28, bob - 58, 11, 18, e.accent); px(17, bob - 58, 11, 18, e.accent); px(-9, bob - 34, 18, 9, '#f1c7a0'); px(-42, bob - 8, 16, 34, e.color); px(26, bob - 8, 16, 34, e.color); }
  else { px(-22, bob - 20, 44, 34, e.color); px(-15, bob - 33, 30, 18, e.color); px(-18, bob - 38, 8, 8, e.color); px(10, bob - 38, 8, 8, e.color); px(-6, bob - 25, 12, 8, e.accent); px(-28, bob - 8, 10, 22, e.color); px(18, bob - 8, 10, 22, e.color); }
  if (e.boss) { ctx.fillStyle = '#111'; ctx.fillRect(-34, bob - 66, 68, 7); ctx.fillStyle = '#ff477e'; ctx.fillRect(-32, bob - 64, 64 * Math.max(0, e.hp / e.maxHp), 3); }
  ctx.restore();
}

function overlay(a, b) {
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.font = '48px monospace'; ctx.fillText(a, W / 2, H / 2); ctx.font = '20px monospace'; ctx.fillText(b, W / 2, H / 2 + 40);
}

start();
