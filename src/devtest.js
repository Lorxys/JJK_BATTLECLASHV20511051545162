// Mode test (?test=gojo|sukuna) : lance une session et joue un scénario automatique pour vérifier le jeu.
import { W } from './state.js';
import { SPAWNS, DOMAIN } from './config.js';

export function runTest(qs) {
  const char = qs.get('test') || 'gojo';
  if (qs.has('dur')) DOMAIN.duration = Number(qs.get('dur'));
  W.testSpeed = Number(qs.get('speed') || 1);
  const sp = SPAWNS.find((s) => s.id === (qs.get('spawn') || 'place'));
  W.game.startSession({ char, spawn: sp, density: 1.6, intensity: 1.5, destruction: 1.2, startChaos: Number(qs.get('chaos') || 30), presetName: 'Test' });
  const P = W.player;
  const seq = (qs.get('seq') || 'a,a,a,a,p0,a,a,p1,p2,a,a,p3').split(',');
  if (qs.has('elites')) for (const [t, dx, dy] of [['colosse', 4, 0], ['predateur', -4, 2], ['artillerie', 0, 6], ['superieur', 3, -4]]) W.enemies.spawn(t, P.x + dx, P.y + dy);
  for (let i = 0; i < 10; i++) W.enemies.spawn(i % 2 ? 'rodeur' : 'larve', P.x + Math.cos(i) * 3, P.y + Math.sin(i) * 3);
  let i = 0;
  const step = Number(qs.get('step') || 450);
  const iv = setInterval(() => {
    if (i >= seq.length) { clearInterval(iv); return; }
    const a = seq[i++];
    const e = W.enemies.nearest(P.x, P.y, 20);
    if (e) { const d = Math.hypot(e.x - P.x, e.y - P.y); W.input.mx = (e.x - P.x) / d; W.input.my = (e.y - P.y) / d; W.input.mag = a === 'move' ? 1 : 0.5; }
    if (a === 'move') { setTimeout(() => { W.input.mag = 0; }, step * 0.8); return; }
    if (a.startsWith('hold')) { const k = 'p' + a.slice(4); W.input.held.add(k); setTimeout(() => { W.input.held.delete(k); W.input.mag = 0; }, step * 4); return; }
    if (a === 'radial') { W.input.mag = 0; W.input.pressed.add('p1'); return; }
    W.input.pressed.add(a === 'a' ? 'attack' : a);
    setTimeout(() => { if (a !== 'move') W.input.mag = 0; }, 60);
  }, step);
  setInterval(() => {
    const err = document.getElementById('errlog').textContent;
    document.title = `V${W.fusions || 0} b${W.player.blues.length}:${(W.player.blues[0]?.t || 0).toFixed(1)} gt${(W.gameTime || 0).toFixed(1)} s${W.player.state} F${Math.round(W.scene.game.loop.actualFps)} T${W.time.toFixed?.(1)} E${W.enemies.count} C${W.chaos.level} B${W.city.buildings.filter((b) => b.state > 0).length} ${err ? 'ERR ' + err.slice(0, 120) : 'OK'}`;
  }, 200);
}
