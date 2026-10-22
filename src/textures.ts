import * as THREE from 'three';

// Procedural High-Resolution Realistic Texture Generators with Caching

const asphaltCache = new Map<boolean, THREE.CanvasTexture>();
const buildingCache = new Map<number, THREE.CanvasTexture>();
const sunCache = new Map<boolean, THREE.CanvasTexture>();
let checkerCache: THREE.CanvasTexture | null = null;
let cockpitDashCache: THREE.CanvasTexture | null = null;

export function createAsphaltTexture(isNight: boolean): THREE.CanvasTexture {
  if (asphaltCache.has(isNight)) {
    return asphaltCache.get(isNight)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // 1. Rich weathered macadam asphalt base coat
  ctx.fillStyle = isNight ? '#12151e' : '#20242c';
  ctx.fillRect(0, 0, 1024, 1024);

  // 2. Multi-scale mineral aggregate grain (fine dark & light stone flecks)
  for (let i = 0; i < 22000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const isLight = Math.random() > 0.55;
    const v = isLight ? Math.floor(42 + Math.random() * 24) : Math.floor(14 + Math.random() * 16);
    ctx.fillStyle = `rgba(${v}, ${v + 2}, ${v + 5}, 0.22)`;
    ctx.fillRect(x, y, 2, 2);
  }

  // 3. Realistic longitudinal tire-polish & oil-track wear across 5 highway lanes (including middle lane!)
  const grad = ctx.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0.0, 'rgba(0, 0, 0, 0.52)');
  grad.addColorStop(0.05, 'rgba(0, 0, 0, 0.14)');
  grad.addColorStop(0.13, 'rgba(10, 12, 16, 0.24)'); // Far-Left lane rut
  grad.addColorStop(0.22, 'rgba(0, 0, 0, 0.10)');
  grad.addColorStop(0.31, 'rgba(10, 12, 16, 0.24)'); // Inner-Left lane rut
  grad.addColorStop(0.41, 'rgba(0, 0, 0, 0.12)');
  grad.addColorStop(0.50, 'rgba(10, 12, 16, 0.26)'); // Middle / Center lane rut
  grad.addColorStop(0.59, 'rgba(0, 0, 0, 0.12)');
  grad.addColorStop(0.69, 'rgba(10, 12, 16, 0.24)'); // Inner-Right lane rut
  grad.addColorStop(0.78, 'rgba(0, 0, 0, 0.10)');
  grad.addColorStop(0.87, 'rgba(10, 12, 16, 0.24)'); // Far-Right lane rut
  grad.addColorStop(0.95, 'rgba(0, 0, 0, 0.14)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.52)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);

  // 4. Subtle sealed tar cracks for road surface realism
  ctx.strokeStyle = 'rgba(8, 10, 14, 0.42)';
  ctx.lineWidth = 1.8;
  for (let c = 0; c < 14; c++) {
    let cx = 70 + ((c * 67) % 880);
    let cy = ((c * 97) % 900) + 40;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let s = 0; s < 5; s++) {
      cx += (Math.sin(c * 3 + s) - 0.3) * 26;
      cy += 18 + (s % 3) * 8;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  // 5. Outer Concrete & Red/White Rumble Strip Curbs
  const curbBlocks = 16;
  const blockH = 1024 / curbBlocks;
  for (let i = 0; i < curbBlocks; i++) {
    const isAlt = i % 2 === 0;
    if (isNight) {
      ctx.fillStyle = isAlt ? '#dc2626' : '#cbd5e1';
    } else {
      ctx.fillStyle = isAlt ? '#b91c1c' : '#e2e8f0';
    }
    ctx.fillRect(0, i * blockH, 28, blockH - 2);
    ctx.fillRect(1024 - 28, i * blockH, 28, blockH - 2);
  }

  // 6. Crisp Solid Outer Highway Fog Lines
  ctx.fillStyle = isNight ? '#e2e8f0' : '#f1f5f9';
  ctx.fillRect(36, 0, 10, 1024);
  ctx.fillRect(1024 - 46, 0, 10, 1024);

  // 7. 5-Lane Highway Dividers (4 interior lane dividers at x = -7.8, -2.6, +2.6, +7.8)
  // Inner center-lane boundary lines (416 & 608) in amber/yellow, outer lane dividers (225 & 799) in crisp white
  const numDashes = 4;
  const dashStride = 1024 / numDashes;
  const dashLen = dashStride * 0.46;
  const dividerXs = [225, 416, 608, 799];

  for (let d = 0; d < numDashes; d++) {
    const yStart = d * dashStride + dashStride * 0.14;
    const studY = d * dashStride + dashStride * 0.78;

    for (let idx = 0; idx < dividerXs.length; idx++) {
      const dx = dividerXs[idx];
      const isCenterBoundary = idx === 1 || idx === 2;
      ctx.fillStyle = isCenterBoundary
        ? isNight
          ? '#fbbf24'
          : '#eab308'
        : isNight
        ? '#e2e8f0'
        : '#f8fafc';
      ctx.fillRect(dx - 4, yStart, 8, dashLen);

      // Reflective Botts' dot stud between dashes
      ctx.fillStyle = isCenterBoundary ? '#fde047' : isNight ? '#38bdf8' : '#ffffff';
      ctx.fillRect(dx - 3, studY, 6, 6);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  asphaltCache.set(isNight, tex);
  return tex;
}

export function createBuildingWindowTexture(accentColorHex: number): THREE.CanvasTexture {
  if (buildingCache.has(accentColorHex)) {
    return buildingCache.get(accentColorHex)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Architectural dark steel & glass facade base
  ctx.fillStyle = '#0a0e17';
  ctx.fillRect(0, 0, 256, 512);

  // Horizontal structural floor spandrel bands
  ctx.fillStyle = '#111827';
  const cols = 8;
  const rows = 24;
  const padX = 5;
  const padY = 4;
  const cellW = 256 / cols;
  const cellH = 512 / rows;

  for (let row = 0; row < rows; row++) {
    ctx.fillRect(0, row * cellH, 256, 3);
  }

  const col = new THREE.Color(accentColorHex);
  const r = Math.floor(col.r * 255);
  const g = Math.floor(col.g * 255);
  const b = Math.floor(col.b * 255);

  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.random() > 0.36;
      if (lit) {
        const bright = 0.5 + Math.random() * 0.45;
        const styleRoll = Math.random();
        if (styleRoll > 0.45) {
          // Warm realistic interior office/apartment tungsten light
          ctx.fillStyle = `rgba(255, 241, 214, ${bright * 0.85})`;
        } else if (styleRoll > 0.18) {
          // Cool daylight / sky reflection
          ctx.fillStyle = `rgba(186, 230, 253, ${bright * 0.75})`;
        } else {
          // Subtle accent tint
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${bright * 0.8})`;
        }
        ctx.fillRect(
          c * cellW + padX,
          row * cellH + padY,
          cellW - padX * 2,
          cellH - padY * 2
        );
      } else {
        // Unlit dark reflective window pane
        ctx.fillStyle = '#161f30';
        ctx.fillRect(
          c * cellW + padX,
          row * cellH + padY,
          cellW - padX * 2,
          cellH - padY * 2
        );
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  buildingCache.set(accentColorHex, tex);
  return tex;
}

export function createSynthSunTexture(isNight: boolean): THREE.CanvasTexture {
  if (sunCache.has(isNight)) {
    return sunCache.get(isNight)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Realistic atmospheric sun/moon glow + solar/lunar disc (no artificial striped cutouts)
  const outerGlow = ctx.createRadialGradient(256, 256, 40, 256, 256, 250);
  if (isNight) {
    outerGlow.addColorStop(0.0, 'rgba(248, 250, 252, 1.0)');
    outerGlow.addColorStop(0.28, 'rgba(226, 232, 240, 0.95)');
    outerGlow.addColorStop(0.32, 'rgba(148, 163, 184, 0.45)');
    outerGlow.addColorStop(0.62, 'rgba(56, 189, 248, 0.14)');
    outerGlow.addColorStop(1.0, 'rgba(15, 23, 42, 0.0)');
  } else {
    outerGlow.addColorStop(0.0, 'rgba(255, 253, 240, 1.0)');
    outerGlow.addColorStop(0.32, 'rgba(254, 215, 102, 0.92)');
    outerGlow.addColorStop(0.52, 'rgba(251, 146, 60, 0.48)');
    outerGlow.addColorStop(0.78, 'rgba(234, 88, 12, 0.18)');
    outerGlow.addColorStop(1.0, 'rgba(234, 88, 12, 0.0)');
  }

  ctx.fillStyle = outerGlow;
  ctx.fillRect(0, 0, 512, 512);

  if (isNight) {
    // Subtle lunar surface shading on the moon disc
    ctx.fillStyle = 'rgba(148, 163, 184, 0.18)';
    ctx.beginPath();
    ctx.arc(232, 238, 22, 0, Math.PI * 2);
    ctx.arc(278, 266, 16, 0, Math.PI * 2);
    ctx.arc(248, 282, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  sunCache.set(isNight, tex);
  return tex;
}

export function createCheckerBannerTexture(): THREE.CanvasTexture {
  if (checkerCache) return checkerCache;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const size = 32;
  for (let y = 0; y < 128 / size; y++) {
    for (let x = 0; x < 512 / size; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#11131a';
      ctx.fillRect(x * size, y * size, size, size);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  checkerCache = tex;
  return tex;
}

export function createCockpitDashTexture(): THREE.CanvasTexture {
  if (cockpitDashCache) return cockpitDashCache;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#050811';
  ctx.fillRect(0, 0, 256, 128);

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 120);

  // RPM bar segments
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i < 8 ? '#10b981' : i < 10 ? '#f59e0b' : '#ef4444';
    ctx.fillRect(16 + i * 18, 18, 14, 22);
  }

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 26px monospace';
  ctx.fillText('ARGON MOTO', 18, 80);
  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 17px monospace';
  ctx.fillText('RACE // 6-SPD', 18, 108);

  const tex = new THREE.CanvasTexture(canvas);
  cockpitDashCache = tex;
  return tex;
}
