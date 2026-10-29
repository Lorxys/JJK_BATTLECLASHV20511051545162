// Ville de nuit : décor assombri par teinte (clair de lune bleuté) et éclairage additif (halos doux en HD,
// paliers nets en rendu pixel) : lampadaires, vitrines, feux, territoires et techniques.
import { W } from '../state.js';
import { isoX, isoY } from '../util.js';
import { settings } from '../settings.js';

export const NIGHT_TINT = 0x5c6698;  // bâtiments, sol, mobilier, véhicules
export const CHAR_TINT = 0xbcc4e4;   // personnages : plus clairs pour rester lisibles
const SX = 45.25, SY = 22.63;        // diamètre écran d'un cercle monde de rayon 1

// Multiplie deux couleurs 0xRRGGBB (teinte d'un objet par la nuit).
export function nightMul(c, n = NIGHT_TINT) {
  const r = ((c >> 16) & 255) * ((n >> 16) & 255) / 255, g = ((c >> 8) & 255) * ((n >> 8) & 255) / 255, b = (c & 255) * (n & 255) / 255;
  return (r << 16) | (g << 8) | b;
}

export class Night {
  constructor(scene) {
    this.scene = scene;
    // sol : flaques de lumière cachées par les bâtiments ; haut : halos qui éclairent aussi les façades
    this.ground = scene.add.graphics().setDepth(-8.9e5).setBlendMode(1);
    this.top = scene.add.graphics().setDepth(9e5 - 6).setBlendMode(1);
    this.lights = [];   // lumières de l'image courante
    this.flashes = [];  // lumières qui s'éteignent d'elles-mêmes
    this.t = 0;
    this.soft = settings().hd;
    this.pool = [];
    if (this.soft) this.makeGlowTex();
    scene.cameras.main.setBackgroundColor('#0b1430');
  }

  // Lumière pour l'image courante. top = halo aussi par-dessus le décor.
  add(x, y, r, color, a = 0.3, top = 0) { this.lights.push({ x, y, r, color, a, top }); }
  flash(x, y, r, color, life = 0.35, a = 0.5) { this.flashes.push({ x, y, r, color, a, life, max: life }); }

  update(dt, cam) {
    this.t += dt;
    const city = W.city;
    if (city) {
      for (const p of city.props) if (p.type === 'lamp' && !p.broken && p.img.visible) this.add(p.x + 0.15, p.y + 0.15, 2.8, 0xffc870, 0.3, 0.15);
      for (const b of city.buildings) {
        if (!b.img.visible) continue;
        if (b.glowPool && b.state < 3) this.add(b.x + b.s + 0.2, b.y + b.s * 0.5, b.s * 0.8, b.glowPool, 0.16);
        if (b.burnT > 0 && b.state < 4) this.add(b.cx, b.cy, b.s * 1.6, 0xff6a20, 0.22 * this.flicker(b.id), 0.45);
      }
      for (const f of city.fires) this.add(f.x, f.y, f.r * 2.6, 0xff8a2a, 0.24 * this.flicker(f.x * 7 + f.y), 0.3);
      // brasier du Fuga : sol incandescent qui pulse + points chauds qui vacillent
      for (const z of city.infernos) {
        const k = Math.min(1, z.t / 6), beat = Math.floor(this.t * 3) % 2 ? 1 : 0.85;
        this.add(z.x, z.y, z.r * 1.15, 0xff4a14, 0.15 * k * beat, 0.18);
        this.add(z.x, z.y, z.r * 0.6, 0xff9030, 0.1 * k);
        for (const s of z.spots) this.add(s[0], s[1], 3, 0xffb040, 0.22 * k * this.flicker(s[2]), 0.2);
      }
    }
    const D = W.domain && W.domain.zone;
    if (D) this.add(D.x, D.y, D.r * 1.05, D.type === 'void' ? 0x5a78ff : 0xff1a1a, D.phase === 'fade' ? 0.1 : 0.22);
    const P = W.player;
    if (P) this.add(P.x, P.y, 2.2, P.key === 'gojo' ? 0x9fc0ff : 0xff8080, 0.14);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) { this.flashes.splice(i, 1); continue; }
      const k = f.life / f.max;
      this.add(f.x, f.y, f.r * (0.6 + 0.4 * k), f.color, f.a * (k > 0.5 ? 1 : k > 0.25 ? 0.6 : 0.3), 0.5);
    }
    this.draw(cam);
    this.lights.length = 0;
  }

  // Vacillement des flammes par paliers (pas de variation continue).
  flicker(seed) { const s = Math.floor(this.t * 9 + seed * 13); return 0.75 + ((s * 2654435761) >>> 0) % 4 * 0.1; }

  draw(cam) {
    const g = this.ground, top = this.top;
    g.clear(); top.clear();
    const v = cam.worldView, m = 60;
    let n = 0;
    for (const l of this.lights) {
      const cx = isoX(l.x, l.y), cy = isoY(l.x, l.y), w = l.r * SX, h = l.r * SY;
      if (cx + w / 2 < v.x - m || cx - w / 2 > v.right + m || cy + h / 2 < v.y - m || cy - h / 2 > v.bottom + m) continue;
      if (this.soft) {
        // HD : halo à dégradé doux (une image additive par lumière, recyclée d'une image à l'autre)
        this.glow(n++, false, cx, cy, w, h, l.color, Math.min(1, l.a * 1.6));
        if (l.top) this.glow(n++, true, cx, cy - 10, w * 0.95, h * 1.7, l.color, Math.min(1, l.a * l.top * 1.4));
        continue;
      }
      // pixel : trois paliers additifs nets (bord faible, milieu, cœur lumineux)
      const a = l.a / 3;
      g.fillStyle(l.color, a);
      g.fillEllipse(cx, cy, w, h, 20);
      g.fillEllipse(cx, cy, w * 0.66, h * 0.66, 16);
      g.fillEllipse(cx, cy, w * 0.33, h * 0.33, 12);
      if (l.top) {
        const ta = a * l.top;
        top.fillStyle(l.color, ta);
        top.fillEllipse(cx, cy - 10, w * 0.9, h * 1.6, 20);
        top.fillEllipse(cx, cy - 10, w * 0.5, h * 0.9, 14);
      }
    }
    for (let i = n; i < this.pool.length; i++) if (this.pool[i].visible) this.pool[i].setVisible(false);
  }

  glow(i, top, x, y, w, h, color, a) {
    let im = this.pool[i];
    if (!im) im = this.pool[i] = this.scene.add.image(0, 0, 'night_glow').setBlendMode(1);
    im.setPosition(x, y).setDisplaySize(w, h).setTint(color).setAlpha(a).setDepth(top ? 9e5 - 6 : -8.9e5).setVisible(true);
  }

  // Texture de halo : disque blanc au dégradé radial doux (cœur plus dense).
  makeGlowTex() {
    if (this.scene.textures.exists('night_glow')) return;
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d'), gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.7)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
    this.scene.textures.addCanvas('night_glow', cv);
  }

  clear() { this.lights.length = 0; this.flashes.length = 0; this.ground.clear(); this.top.clear(); for (const im of this.pool) im.setVisible(false); }
}
