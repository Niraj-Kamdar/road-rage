import * as THREE from 'three/webgpu';

interface SparkParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  initialSize: number;
  life: number;
  maxLife: number;
  r: number;
  g: number;
  b: number;
  drag: number;
  gravity: number;
  rot: number;
  spin: number;
}

interface SmokeParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  initialSize: number;
  life: number;
  maxLife: number;
  r: number;
  g: number;
  b: number;
  drag: number;
  gravity: number;
  rot: number;
  spin: number;
}

interface SkidDecal {
  active: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  width: number;
  length: number;
  life: number;
  maxLife: number;
}

/**
 * WebGPU-Safe Dynamic Vertex Buffer Particle System.
 *
 * Uses standard non-instanced THREE.Mesh objects with pre-allocated dynamic Float32BufferAttributes
 * instead of THREE.InstancedMesh. This completely avoids Three.js r170 InstanceNode's 64KB UBO limit
 * crash and mid-frame WGSL pipeline recompilations when sparks, smoke, or skid marks spawn.
 */
export class GpuParticleSystem {
  public group: THREE.Group;

  // 1. Sparks & Nitro Flames (each particle = 2 perpendicular intersecting triangles = 6 vertices)
  private readonly maxSparks = 360;
  private sparks: SparkParticle[] = [];
  private sparkHead = 0;
  private sparkPositions: Float32Array;
  private sparkColors: Float32Array;
  private sparkPosAttr: THREE.BufferAttribute;
  private sparkColAttr: THREE.BufferAttribute;
  private sparkMesh: THREE.Mesh;

  // 2. Tire Smoke Puffs (each particle = 2 intersecting triangles = 6 vertices)
  private readonly maxSmoke = 180;
  private smokes: SmokeParticle[] = [];
  private smokeHead = 0;
  private smokePositions: Float32Array;
  private smokeColors: Float32Array;
  private smokePosAttr: THREE.BufferAttribute;
  private smokeColAttr: THREE.BufferAttribute;
  private smokeMesh: THREE.Mesh;

  // 3. Asphalt Skid Mark Quads (each decal = 2 triangles = 6 vertices)
  private readonly maxSkids = 160;
  private skids: SkidDecal[] = [];
  private skidHead = 0;
  private skidPositions: Float32Array;
  private skidPosAttr: THREE.BufferAttribute;
  private skidMesh: THREE.Mesh;

  private colorScratch = new THREE.Color();

  constructor() {
    this.group = new THREE.Group();

    // =========================================================================
    // 1. SPARK / NITRO FLAME MESH (6 vertices per particle, always visible)
    // =========================================================================
    this.sparkPositions = new Float32Array(this.maxSparks * 6 * 3);
    this.sparkColors = new Float32Array(this.maxSparks * 6 * 3);

    for (let i = 0; i < this.maxSparks; i++) {
      this.sparks.push({
        active: false,
        x: 0,
        y: -9999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 0,
        initialSize: 0.5,
        life: 0,
        maxLife: 1,
        r: 1,
        g: 1,
        b: 1,
        drag: 0.94,
        gravity: -22,
        rot: 0,
        spin: 0,
      });
      this.hideVertices(this.sparkPositions, i * 18, 6);
    }

    const sparkGeo = new THREE.BufferGeometry();
    this.sparkPosAttr = new THREE.BufferAttribute(this.sparkPositions, 3);
    this.sparkPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.sparkColAttr = new THREE.BufferAttribute(this.sparkColors, 3);
    this.sparkColAttr.setUsage(THREE.DynamicDrawUsage);
    sparkGeo.setAttribute('position', this.sparkPosAttr);
    sparkGeo.setAttribute('color', this.sparkColAttr);

    const sparkMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.sparkMesh = new THREE.Mesh(sparkGeo, sparkMat);
    this.sparkMesh.frustumCulled = false;
    this.group.add(this.sparkMesh);

    // =========================================================================
    // 2. TIRE SMOKE MESH (6 vertices per particle, always visible)
    // =========================================================================
    this.smokePositions = new Float32Array(this.maxSmoke * 6 * 3);
    this.smokeColors = new Float32Array(this.maxSmoke * 6 * 3);

    for (let i = 0; i < this.maxSmoke; i++) {
      this.smokes.push({
        active: false,
        x: 0,
        y: -9999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 0,
        initialSize: 0.4,
        life: 0,
        maxLife: 1,
        r: 0.6,
        g: 0.6,
        b: 0.65,
        drag: 0.94,
        gravity: 1.5,
        rot: 0,
        spin: 0,
      });
      this.hideVertices(this.smokePositions, i * 18, 6);
    }

    const smokeGeo = new THREE.BufferGeometry();
    this.smokePosAttr = new THREE.BufferAttribute(this.smokePositions, 3);
    this.smokePosAttr.setUsage(THREE.DynamicDrawUsage);
    this.smokeColAttr = new THREE.BufferAttribute(this.smokeColors, 3);
    this.smokeColAttr.setUsage(THREE.DynamicDrawUsage);
    smokeGeo.setAttribute('position', this.smokePosAttr);
    smokeGeo.setAttribute('color', this.smokeColAttr);

    const smokeMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.smokeMesh = new THREE.Mesh(smokeGeo, smokeMat);
    this.smokeMesh.frustumCulled = false;
    this.group.add(this.smokeMesh);

    // =========================================================================
    // 3. ASPHALT SKID MARK MESH (6 vertices per quad, always visible)
    // =========================================================================
    this.skidPositions = new Float32Array(this.maxSkids * 6 * 3);

    for (let i = 0; i < this.maxSkids; i++) {
      this.skids.push({
        active: false,
        x: 0,
        y: -9999,
        z: 0,
        yaw: 0,
        width: 0.42,
        length: 2.2,
        life: 0,
        maxLife: 8.0,
      });
      this.hideVertices(this.skidPositions, i * 18, 6);
    }

    const skidGeo = new THREE.BufferGeometry();
    this.skidPosAttr = new THREE.BufferAttribute(this.skidPositions, 3);
    this.skidPosAttr.setUsage(THREE.DynamicDrawUsage);
    skidGeo.setAttribute('position', this.skidPosAttr);

    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x090b10,
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.skidMesh = new THREE.Mesh(skidGeo, skidMat);
    this.skidMesh.frustumCulled = false;
    this.group.add(this.skidMesh);
  }

  private hideVertices(arr: Float32Array, baseIdx: number, vertexCount: number): void {
    for (let v = 0; v < vertexCount; v++) {
      const idx = baseIdx + v * 3;
      arr[idx] = 0;
      arr[idx + 1] = -9999;
      arr[idx + 2] = 0;
    }
  }

  public spawnSparks(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    count = 16,
    speed = 18,
    dir?: THREE.Vector3
  ): void {
    this.colorScratch.setHex(colorHex);
    const cr = this.colorScratch.r;
    const cg = this.colorScratch.g;
    const cb = this.colorScratch.b;

    const safeCount = Math.min(count, 40);
    for (let i = 0; i < safeCount; i++) {
      const p = this.sparks[this.sparkHead];
      this.sparkHead = (this.sparkHead + 1) % this.maxSparks;

      p.active = true;
      p.x = x + (Math.random() - 0.5) * 0.4;
      p.y = y + (Math.random() - 0.5) * 0.4;
      p.z = z + (Math.random() - 0.5) * 0.4;

      if (dir) {
        const spread = 0.55;
        p.vx = (dir.x + (Math.random() - 0.5) * spread) * speed * (0.6 + Math.random() * 0.8);
        p.vy = (dir.y + Math.random() * spread + 0.2) * speed * (0.6 + Math.random() * 0.8);
        p.vz = (dir.z + (Math.random() - 0.5) * spread) * speed * (0.6 + Math.random() * 0.8);
      } else {
        p.vx = (Math.random() - 0.5) * speed;
        p.vy = Math.random() * speed * 0.8 + 2.5;
        p.vz = (Math.random() - 0.5) * speed;
      }

      p.initialSize = 0.24 + Math.random() * 0.28;
      p.size = p.initialSize;
      p.life = 0;
      p.maxLife = 0.28 + Math.random() * 0.32;
      p.drag = 0.94;
      p.gravity = -24;
      p.rot = Math.random() * Math.PI * 2;
      p.spin = (Math.random() - 0.5) * 12;

      p.r = Math.min(1.0, cr * 1.15);
      p.g = Math.min(1.0, cg * 1.15);
      p.b = Math.min(1.0, cb * 1.15);
    }
  }

  public spawnNitroFlames(pos: THREE.Vector3, yaw: number, count = 3): void {
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    const offsets = [-0.28, 0.28];
    for (const offset of offsets) {
      const ex = pos.x + rightX * offset - fwdX * 0.95;
      const ey = pos.y + 0.52;
      const ez = pos.z + rightZ * offset - fwdZ * 0.95;

      for (let i = 0; i < count; i++) {
        const p = this.sparks[this.sparkHead];
        this.sparkHead = (this.sparkHead + 1) % this.maxSparks;

        p.active = true;
        p.x = ex + (Math.random() - 0.5) * 0.12;
        p.y = ey + (Math.random() - 0.5) * 0.12;
        p.z = ez + (Math.random() - 0.5) * 0.12;

        const thrust = 24 + Math.random() * 14;
        p.vx = -fwdX * thrust + (Math.random() - 0.5) * 3.0;
        p.vy = (Math.random() - 0.5) * 2.0 + 0.8;
        p.vz = -fwdZ * thrust + (Math.random() - 0.5) * 3.0;

        p.initialSize = 0.28 + Math.random() * 0.22;
        p.size = p.initialSize;
        p.life = 0;
        p.maxLife = 0.12 + Math.random() * 0.12;
        p.drag = 0.92;
        p.gravity = -3;
        p.rot = Math.random() * Math.PI * 2;
        p.spin = (Math.random() - 0.5) * 8;

        if (Math.random() > 0.35) {
          p.r = 0.1;
          p.g = 0.92;
          p.b = 1.0;
        } else {
          p.r = 0.95;
          p.g = 0.2;
          p.b = 0.95;
        }
      }
    }
  }

  public spawnTireSmoke(x: number, y: number, z: number, count = 2): void {
    const safeCount = Math.min(count, 8);
    for (let i = 0; i < safeCount; i++) {
      const p = this.smokes[this.smokeHead];
      this.smokeHead = (this.smokeHead + 1) % this.maxSmoke;

      p.active = true;
      p.x = x + (Math.random() - 0.5) * 0.3;
      p.y = y + 0.15 + Math.random() * 0.15;
      p.z = z + (Math.random() - 0.5) * 0.3;

      p.vx = (Math.random() - 0.5) * 3.0;
      p.vy = Math.random() * 2.2 + 0.9;
      p.vz = (Math.random() - 0.5) * 3.0;

      p.initialSize = 0.28 + Math.random() * 0.25;
      p.size = p.initialSize;
      p.life = 0;
      p.maxLife = 0.55 + Math.random() * 0.4;
      p.drag = 0.95;
      p.gravity = 1.2;
      p.rot = Math.random() * Math.PI * 2;
      p.spin = (Math.random() - 0.5) * 2.5;

      const grey = 0.5 + Math.random() * 0.25;
      p.r = grey;
      p.g = grey;
      p.b = grey + 0.05;
    }
  }

  public spawnExplosion(x: number, y: number, z: number, colorHex = 0xff4500, count = 36): void {
    this.spawnSparks(x, y + 1.0, z, colorHex, Math.min(count, 28), 22);
    this.spawnSparks(x, y + 1.2, z, 0xffe600, Math.min(Math.floor(count * 0.5), 18), 26);
    for (let i = 0; i < 8; i++) {
      this.spawnTireSmoke(
        x + (Math.random() - 0.5) * 1.4,
        y + 0.5 + Math.random() * 1.6,
        z + (Math.random() - 0.5) * 1.4,
        1
      );
    }
  }

  public spawnSkidMark(x: number, y: number, z: number, yaw: number, width = 0.42, length = 2.4): void {
    const s = this.skids[this.skidHead];
    this.skidHead = (this.skidHead + 1) % this.maxSkids;

    s.active = true;
    s.x = x;
    s.y = y + 0.06;
    s.z = z;
    s.yaw = yaw;
    s.width = width;
    s.length = length;
    s.life = 0;
    s.maxLife = 8.0;
  }

  public update(dt: number): void {
    // 1. Update Sparks
    for (let i = 0; i < this.maxSparks; i++) {
      const p = this.sparks[i];
      const baseIdx = i * 18;
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.hideVertices(this.sparkPositions, baseIdx, 6);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vz *= p.drag;
      p.rot += p.spin * dt;

      const progress = p.life / p.maxLife;
      const s = p.initialSize * (1 - progress * 0.8);
      const fade = 1 - progress;

      const cr = p.r * fade;
      const cg = p.g * fade;
      const cb = p.b * fade;

      const cosR = Math.cos(p.rot) * s;
      const sinR = Math.sin(p.rot) * s;
      const tailX = -p.vx * 0.028;
      const tailY = -p.vy * 0.028;
      const tailZ = -p.vz * 0.028;

      // Triangle 1 (Horizontal-ish ribbon)
      this.sparkPositions[baseIdx + 0] = p.x + cosR;
      this.sparkPositions[baseIdx + 1] = p.y;
      this.sparkPositions[baseIdx + 2] = p.z + sinR;

      this.sparkPositions[baseIdx + 3] = p.x - cosR;
      this.sparkPositions[baseIdx + 4] = p.y;
      this.sparkPositions[baseIdx + 5] = p.z - sinR;

      this.sparkPositions[baseIdx + 6] = p.x + tailX;
      this.sparkPositions[baseIdx + 7] = p.y + tailY + s * 1.4;
      this.sparkPositions[baseIdx + 8] = p.z + tailZ;

      // Triangle 2 (Vertical-ish cross fin)
      this.sparkPositions[baseIdx + 9] = p.x;
      this.sparkPositions[baseIdx + 10] = p.y + s;
      this.sparkPositions[baseIdx + 11] = p.z;

      this.sparkPositions[baseIdx + 12] = p.x;
      this.sparkPositions[baseIdx + 13] = p.y - s;
      this.sparkPositions[baseIdx + 14] = p.z;

      this.sparkPositions[baseIdx + 15] = p.x + tailX;
      this.sparkPositions[baseIdx + 16] = p.y + tailY;
      this.sparkPositions[baseIdx + 17] = p.z + tailZ - s * 1.4;

      for (let v = 0; v < 6; v++) {
        const cIdx = baseIdx + v * 3;
        this.sparkColors[cIdx] = cr;
        this.sparkColors[cIdx + 1] = cg;
        this.sparkColors[cIdx + 2] = cb;
      }
    }
    this.sparkPosAttr.needsUpdate = true;
    this.sparkColAttr.needsUpdate = true;

    // 2. Update Smoke
    for (let i = 0; i < this.maxSmoke; i++) {
      const p = this.smokes[i];
      const baseIdx = i * 18;
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.hideVertices(this.smokePositions, baseIdx, 6);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vz *= p.drag;
      p.rot += p.spin * dt;

      const progress = p.life / p.maxLife;
      const s = p.initialSize * (1 + progress * 2.2);
      const fade = Math.sin((1 - progress) * Math.PI * 0.5);

      const cr = p.r * fade;
      const cg = p.g * fade;
      const cb = p.b * fade;

      const cosR = Math.cos(p.rot) * s;
      const sinR = Math.sin(p.rot) * s;

      // Crossed puffs
      this.smokePositions[baseIdx + 0] = p.x - cosR;
      this.smokePositions[baseIdx + 1] = p.y - s * 0.6;
      this.smokePositions[baseIdx + 2] = p.z - sinR;

      this.smokePositions[baseIdx + 3] = p.x + cosR;
      this.smokePositions[baseIdx + 4] = p.y - s * 0.6;
      this.smokePositions[baseIdx + 5] = p.z + sinR;

      this.smokePositions[baseIdx + 6] = p.x;
      this.smokePositions[baseIdx + 7] = p.y + s * 0.9;
      this.smokePositions[baseIdx + 8] = p.z;

      this.smokePositions[baseIdx + 9] = p.x + sinR;
      this.smokePositions[baseIdx + 10] = p.y - s * 0.5;
      this.smokePositions[baseIdx + 11] = p.z - cosR;

      this.smokePositions[baseIdx + 12] = p.x - sinR;
      this.smokePositions[baseIdx + 13] = p.y - s * 0.5;
      this.smokePositions[baseIdx + 14] = p.z + cosR;

      this.smokePositions[baseIdx + 15] = p.x;
      this.smokePositions[baseIdx + 16] = p.y + s * 0.9;
      this.smokePositions[baseIdx + 17] = p.z;

      for (let v = 0; v < 6; v++) {
        const cIdx = baseIdx + v * 3;
        this.smokeColors[cIdx] = cr;
        this.smokeColors[cIdx + 1] = cg;
        this.smokeColors[cIdx + 2] = cb;
      }
    }
    this.smokePosAttr.needsUpdate = true;
    this.smokeColAttr.needsUpdate = true;

    // 3. Update Skid Marks
    for (let i = 0; i < this.maxSkids; i++) {
      const s = this.skids[i];
      const baseIdx = i * 18;
      if (!s.active) continue;

      s.life += dt;
      if (s.life >= s.maxLife) {
        s.active = false;
        this.hideVertices(this.skidPositions, baseIdx, 6);
        continue;
      }

      const fade = Math.max(0.1, 1 - s.life / s.maxLife);
      const hw = s.width * 0.5;
      const hl = s.length * 0.5 * fade;
      const cosY = Math.cos(s.yaw);
      const sinY = Math.sin(s.yaw);

      const x0 = s.x - hw * cosY - hl * sinY;
      const z0 = s.z + hw * sinY - hl * cosY;

      const x1 = s.x + hw * cosY - hl * sinY;
      const z1 = s.z - hw * sinY - hl * cosY;

      const x2 = s.x + hw * cosY + hl * sinY;
      const z2 = s.z - hw * sinY + hl * cosY;

      const x3 = s.x - hw * cosY + hl * sinY;
      const z3 = s.z + hw * sinY + hl * cosY;

      this.skidPositions[baseIdx + 0] = x0;
      this.skidPositions[baseIdx + 1] = s.y;
      this.skidPositions[baseIdx + 2] = z0;

      this.skidPositions[baseIdx + 3] = x1;
      this.skidPositions[baseIdx + 4] = s.y;
      this.skidPositions[baseIdx + 5] = z1;

      this.skidPositions[baseIdx + 6] = x2;
      this.skidPositions[baseIdx + 7] = s.y;
      this.skidPositions[baseIdx + 8] = z2;

      this.skidPositions[baseIdx + 9] = x0;
      this.skidPositions[baseIdx + 10] = s.y;
      this.skidPositions[baseIdx + 11] = z0;

      this.skidPositions[baseIdx + 12] = x2;
      this.skidPositions[baseIdx + 13] = s.y;
      this.skidPositions[baseIdx + 14] = z2;

      this.skidPositions[baseIdx + 15] = x3;
      this.skidPositions[baseIdx + 16] = s.y;
      this.skidPositions[baseIdx + 17] = z3;
    }
    this.skidPosAttr.needsUpdate = true;
  }

  public shiftZ(deltaWorldZ: number): void {
    for (let i = 0; i < this.maxSparks; i++) {
      if (this.sparks[i].active) {
        this.sparks[i].z += deltaWorldZ;
      }
    }
    for (let i = 0; i < this.maxSmoke; i++) {
      if (this.smokes[i].active) {
        this.smokes[i].z += deltaWorldZ;
      }
    }
    for (let i = 0; i < this.maxSkids; i++) {
      if (this.skids[i].active) {
        this.skids[i].z += deltaWorldZ;
      }
    }
  }

  public clear(): void {
    for (let i = 0; i < this.maxSparks; i++) {
      this.sparks[i].active = false;
      this.hideVertices(this.sparkPositions, i * 18, 6);
    }
    for (let i = 0; i < this.maxSmoke; i++) {
      this.smokes[i].active = false;
      this.hideVertices(this.smokePositions, i * 18, 6);
    }
    for (let i = 0; i < this.maxSkids; i++) {
      this.skids[i].active = false;
      this.hideVertices(this.skidPositions, i * 18, 6);
    }
    this.sparkPosAttr.needsUpdate = true;
    this.smokePosAttr.needsUpdate = true;
    this.skidPosAttr.needsUpdate = true;
  }
}
