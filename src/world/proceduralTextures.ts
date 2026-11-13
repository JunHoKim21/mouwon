import * as THREE from 'three';
import { CatCoatDefinition } from './catCoats';

export interface ProceduralTextureBundle {
  hinokiMap: THREE.CanvasTexture;
  hinokiBump: THREE.CanvasTexture;
  snowMap: THREE.CanvasTexture;
  snowBump: THREE.CanvasTexture;
  stoneMap: THREE.CanvasTexture;
  stoneBump: THREE.CanvasTexture;
  tatamiMap: THREE.CanvasTexture;
  shojiMap: THREE.CanvasTexture;
  bambooMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  steamSpriteMap: THREE.CanvasTexture;
  snowSpriteMap: THREE.CanvasTexture;
  dispose: () => void;
}

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function configureColorTexture(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function configureDataTexture(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextureBundle(
  maxAnisotropy: number,
): ProceduralTextureBundle {
  const rand = seededRandom(20261112);

  // 1. Hinoki cypress wood planks (color + bump)
  const hinokiCanvas = document.createElement('canvas');
  hinokiCanvas.width = 256;
  hinokiCanvas.height = 256;
  const hCtx = hinokiCanvas.getContext('2d')!;
  const hinokiBumpCanvas = document.createElement('canvas');
  hinokiBumpCanvas.width = 256;
  hinokiBumpCanvas.height = 256;
  const hbCtx = hinokiBumpCanvas.getContext('2d')!;

  hCtx.fillStyle = '#c89b66';
  hCtx.fillRect(0, 0, 256, 256);
  hbCtx.fillStyle = '#909090';
  hbCtx.fillRect(0, 0, 256, 256);

  const plankCount = 4;
  const plankH = 256 / plankCount;
  for (let p = 0; p < plankCount; p++) {
    const y0 = p * plankH;
    const toneShift = (rand() - 0.5) * 16;
    hCtx.fillStyle = `rgb(${202 + toneShift}, ${156 + toneShift * 0.8}, ${104 + toneShift * 0.6})`;
    hCtx.fillRect(0, y0, 256, plankH);

    // Fine wood grain lines
    for (let i = 0; i < 42; i++) {
      const gy = y0 + rand() * plankH;
      const alpha = 0.05 + rand() * 0.08;
      hCtx.strokeStyle = `rgba(145, 105, 65, ${alpha})`;
      hCtx.lineWidth = 0.8 + rand() * 1.4;
      hCtx.beginPath();
      hCtx.moveTo(0, gy);
      hCtx.bezierCurveTo(
        85,
        gy + (rand() - 0.5) * 6,
        170,
        gy + (rand() - 0.5) * 6,
        256,
        gy,
      );
      hCtx.stroke();

      hbCtx.strokeStyle = `rgba(110, 110, 110, ${alpha * 1.6})`;
      hbCtx.lineWidth = 1;
      hbCtx.beginPath();
      hbCtx.moveTo(0, gy);
      hbCtx.lineTo(256, gy);
      hbCtx.stroke();
    }

    // Plank seam
    hCtx.fillStyle = 'rgba(110, 78, 48, 0.45)';
    hCtx.fillRect(0, y0, 256, 2);
    hbCtx.fillStyle = '#2c2c2c';
    hbCtx.fillRect(0, y0, 256, 3);
  }

  // 2. Soft snow surface
  const snowCanvas = document.createElement('canvas');
  snowCanvas.width = 256;
  snowCanvas.height = 256;
  const sCtx = snowCanvas.getContext('2d')!;
  const snowBumpCanvas = document.createElement('canvas');
  snowBumpCanvas.width = 256;
  snowBumpCanvas.height = 256;
  const sbCtx = snowBumpCanvas.getContext('2d')!;

  sCtx.fillStyle = '#eef3f7';
  sCtx.fillRect(0, 0, 256, 256);
  sbCtx.fillStyle = '#888888';
  sbCtx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 450; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 4 + rand() * 16;
    const bright = rand() > 0.5;
    sCtx.fillStyle = bright ? 'rgba(255,255,255,0.22)' : 'rgba(210,222,232,0.18)';
    sCtx.beginPath();
    sCtx.arc(x, y, r, 0, Math.PI * 2);
    sCtx.fill();

    sbCtx.fillStyle = bright ? 'rgba(170,170,170,0.18)' : 'rgba(105,105,105,0.18)';
    sbCtx.beginPath();
    sbCtx.arc(x, y, r, 0, Math.PI * 2);
    sbCtx.fill();
  }

  // 3. Wet mineral stone
  const stoneCanvas = document.createElement('canvas');
  stoneCanvas.width = 256;
  stoneCanvas.height = 256;
  const stCtx = stoneCanvas.getContext('2d')!;
  const stoneBumpCanvas = document.createElement('canvas');
  stoneBumpCanvas.width = 256;
  stoneBumpCanvas.height = 256;
  const stbCtx = stoneBumpCanvas.getContext('2d')!;

  stCtx.fillStyle = '#737673';
  stCtx.fillRect(0, 0, 256, 256);
  stbCtx.fillStyle = '#808080';
  stbCtx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 380; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 3 + rand() * 14;
    const v = 86 + Math.floor(rand() * 44);
    stCtx.fillStyle = `rgba(${v}, ${v + 2}, ${v - 2}, 0.25)`;
    stCtx.beginPath();
    stCtx.arc(x, y, r, 0, Math.PI * 2);
    stCtx.fill();

    const bv = 70 + Math.floor(rand() * 115);
    stbCtx.fillStyle = `rgba(${bv}, ${bv}, ${bv}, 0.28)`;
    stbCtx.beginPath();
    stbCtx.arc(x, y, r, 0, Math.PI * 2);
    stbCtx.fill();
  }

  // 4. Tatami weave
  const tatamiCanvas = document.createElement('canvas');
  tatamiCanvas.width = 256;
  tatamiCanvas.height = 256;
  const tCtx = tatamiCanvas.getContext('2d')!;
  tCtx.fillStyle = '#c5be8a';
  tCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 3) {
    tCtx.fillStyle = y % 6 === 0 ? 'rgba(155, 146, 92, 0.28)' : 'rgba(232, 224, 175, 0.22)';
    tCtx.fillRect(0, y, 256, 2);
  }
  tCtx.fillStyle = '#2d3b42';
  tCtx.fillRect(0, 0, 14, 256);
  tCtx.fillRect(242, 0, 14, 256);

  // 5. Shoji paper lattice
  const shojiCanvas = document.createElement('canvas');
  shojiCanvas.width = 256;
  shojiCanvas.height = 256;
  const shCtx = shojiCanvas.getContext('2d')!;
  shCtx.fillStyle = '#f6eedb';
  shCtx.fillRect(0, 0, 256, 256);
  shCtx.strokeStyle = '#6c4d34';
  shCtx.lineWidth = 6;
  for (let x = 0; x <= 256; x += 64) {
    shCtx.beginPath();
    shCtx.moveTo(x, 0);
    shCtx.lineTo(x, 256);
    shCtx.stroke();
  }
  for (let y = 0; y <= 256; y += 64) {
    shCtx.beginPath();
    shCtx.moveTo(0, y);
    shCtx.lineTo(256, y);
    shCtx.stroke();
  }

  // 6. Bamboo culm texture
  const bambooCanvas = document.createElement('canvas');
  bambooCanvas.width = 128;
  bambooCanvas.height = 256;
  const bCtx = bambooCanvas.getContext('2d')!;
  const bGrad = bCtx.createLinearGradient(0, 0, 128, 0);
  bGrad.addColorStop(0, '#4f6e3a');
  bGrad.addColorStop(0.5, '#6e914d');
  bGrad.addColorStop(1, '#4c6a37');
  bCtx.fillStyle = bGrad;
  bCtx.fillRect(0, 0, 128, 256);
  for (let y = 32; y < 256; y += 64) {
    bCtx.fillStyle = '#384d27';
    bCtx.fillRect(0, y - 3, 128, 5);
    bCtx.fillStyle = '#97b575';
    bCtx.fillRect(0, y + 2, 128, 2);
  }

  // 7. Contact shadow radial gradient
  const csCanvas = document.createElement('canvas');
  csCanvas.width = 128;
  csCanvas.height = 128;
  const csCtx = csCanvas.getContext('2d')!;
  const csGrad = csCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
  csGrad.addColorStop(0, 'rgba(18, 22, 28, 0.55)');
  csGrad.addColorStop(0.55, 'rgba(18, 22, 28, 0.22)');
  csGrad.addColorStop(1, 'rgba(18, 22, 28, 0)');
  csCtx.fillStyle = csGrad;
  csCtx.fillRect(0, 0, 128, 128);

  // 8. Soft steam sprite
  const steamCanvas = document.createElement('canvas');
  steamCanvas.width = 128;
  steamCanvas.height = 128;
  const smCtx = steamCanvas.getContext('2d')!;
  const smGrad = smCtx.createRadialGradient(64, 64, 4, 64, 64, 60);
  smGrad.addColorStop(0, 'rgba(255, 255, 255, 0.52)');
  smGrad.addColorStop(0.45, 'rgba(244, 248, 252, 0.24)');
  smGrad.addColorStop(1, 'rgba(244, 248, 252, 0)');
  smCtx.fillStyle = smGrad;
  smCtx.fillRect(0, 0, 128, 128);

  // 9. Soft snowflake sprite
  const snowSpCanvas = document.createElement('canvas');
  snowSpCanvas.width = 64;
  snowSpCanvas.height = 64;
  const snCtx = snowSpCanvas.getContext('2d')!;
  const snGrad = snCtx.createRadialGradient(32, 32, 2, 32, 32, 28);
  snGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  snGrad.addColorStop(0.55, 'rgba(240, 247, 255, 0.55)');
  snGrad.addColorStop(1, 'rgba(240, 247, 255, 0)');
  snCtx.fillStyle = snGrad;
  snCtx.fillRect(0, 0, 64, 64);

  const hinokiMap = configureColorTexture(hinokiCanvas, maxAnisotropy, 3, 3);
  const hinokiBump = configureDataTexture(hinokiBumpCanvas, maxAnisotropy, 3, 3);
  const snowMap = configureColorTexture(snowCanvas, maxAnisotropy, 16, 16);
  const snowBump = configureDataTexture(snowBumpCanvas, maxAnisotropy, 16, 16);
  const stoneMap = configureColorTexture(stoneCanvas, maxAnisotropy, 4, 4);
  const stoneBump = configureDataTexture(stoneBumpCanvas, maxAnisotropy, 4, 4);
  const tatamiMap = configureColorTexture(tatamiCanvas, maxAnisotropy, 4, 4);
  const shojiMap = configureColorTexture(shojiCanvas, maxAnisotropy, 2, 1);
  const bambooMap = configureColorTexture(bambooCanvas, maxAnisotropy, 1, 2);

  const contactShadowMap = new THREE.CanvasTexture(csCanvas);
  const steamSpriteMap = new THREE.CanvasTexture(steamCanvas);
  const snowSpriteMap = new THREE.CanvasTexture(snowSpCanvas);

  return {
    hinokiMap,
    hinokiBump,
    snowMap,
    snowBump,
    stoneMap,
    stoneBump,
    tatamiMap,
    shojiMap,
    bambooMap,
    contactShadowMap,
    steamSpriteMap,
    snowSpriteMap,
    dispose: () => {
      hinokiMap.dispose();
      hinokiBump.dispose();
      snowMap.dispose();
      snowBump.dispose();
      stoneMap.dispose();
      stoneBump.dispose();
      tatamiMap.dispose();
      shojiMap.dispose();
      bambooMap.dispose();
      contactShadowMap.dispose();
      steamSpriteMap.dispose();
      snowSpriteMap.dispose();
    },
  };
}

/**
 * Creates an albedo CanvasTexture for a specific cat coat so tabby stripes,
 * calico patches, tuxedo bibs, and soft fur grain read vividly from every angle.
 */
export function createCatCoatTexture(
  coat: CatCoatDefinition,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(coat.id.charCodeAt(0) * 97 + coat.id.length * 31);

  ctx.fillStyle = coat.primaryColor;
  ctx.fillRect(0, 0, 256, 256);

  if (coat.pattern === 'tabby') {
    // Soft creamy underside tint + rhythmic mackerel/tabby stripes
    ctx.fillStyle = coat.secondaryColor;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(0, 195, 256, 61);
    ctx.globalAlpha = 1;

    const stripeColor =
      coat.id === 'cheese' ? coat.accentColor : coat.secondaryColor;
    ctx.fillStyle = stripeColor;
    ctx.globalAlpha = coat.id === 'cheese' ? 0.55 : 0.65;
    for (let x = 14; x < 256; x += 26) {
      ctx.beginPath();
      ctx.ellipse(x, 118, 6.5, 86, 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (coat.pattern === 'calico') {
    // Warm orange & charcoal patches over cream-white base
    const patches = [
      { x: 52, y: 74, rx: 48, ry: 38, color: coat.secondaryColor },
      { x: 185, y: 82, rx: 52, ry: 42, color: coat.accentColor },
      { x: 118, y: 158, rx: 44, ry: 34, color: coat.secondaryColor },
      { x: 224, y: 182, rx: 36, ry: 30, color: coat.accentColor },
      { x: 38, y: 190, rx: 38, ry: 28, color: coat.accentColor },
    ];
    for (const p of patches) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.rx, p.ry, rand() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (coat.pattern === 'tuxedo') {
    // Subtle dark sheen variation on charcoal coat
    ctx.fillStyle = coat.accentColor;
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 60; i++) {
      ctx.beginPath();
      ctx.ellipse(rand() * 256, rand() * 256, 18, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (coat.pattern === 'cream') {
    ctx.fillStyle = coat.accentColor;
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(30 + i * 42, 128, 16, 70, 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Fine fur micro-strokes (subtle & silky, avoiding dusty speckles on dark coats)
  for (let i = 0; i < 240; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    ctx.strokeStyle =
      coat.id === 'black'
        ? 'rgba(46, 48, 56, 0.22)'
        : 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 5, y + (rand() - 0.5) * 2.5);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}
