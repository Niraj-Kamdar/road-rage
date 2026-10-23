import * as THREE from 'three';
import { TrackSpec } from './types';
import { ROAD_HALF_WIDTH, ROAD_WIDTH, SHOULDER_WIDTH } from './config';
import {
  createAsphaltTexture,
  createBuildingWindowTexture,
  createCheckerBannerTexture,
  createSynthSunTexture,
} from './textures';

export class RoadEnvironment {
  private spec: TrackSpec;
  public group: THREE.Group;
  public sunMesh!: THREE.Mesh;
  public starField!: THREE.Points;
  private startLightMats: THREE.MeshBasicMaterial[] = [];

  // Track all disposable resources to prevent GPU memory leaks
  private disposables: Array<{ dispose: () => void }> = [];

  constructor(spec: TrackSpec) {
    this.spec = spec;
    this.group = new THREE.Group();
    this.buildRoadAndScenery();
  }

  /**
   * Periodic circuit curve function: exact harmonics of lengthUnits (L) guarantee
   * getCurveX(z + L) === getCurveX(z) and smooth derivatives across lap boundaries!
   */
  public getCurveX(z: number): number {
    const c = this.spec.curveIntensity;
    const w = (Math.PI * 2) / this.spec.lengthUnits;
    return (
      Math.sin(z * w * 3) * 38 * c +
      Math.cos(z * w * 6) * 18 * c +
      Math.sin(z * w * 1) * 55 * c
    );
  }

  public getCurveYaw(z: number): number {
    const dx = this.getCurveX(z + 1.0) - this.getCurveX(z - 1.0);
    return Math.atan2(dx, 2.0);
  }

  /**
   * Periodic circuit elevation function: exact harmonics of lengthUnits (L) guarantee
   * getElevationY(z + L) === getElevationY(z) for 100% seamless multi-lap looping!
   */
  public getElevationY(z: number): number {
    const h = this.spec.hillIntensity;
    const w = (Math.PI * 2) / this.spec.lengthUnits;
    return (
      Math.sin(z * w * 4) * 14 * h +
      Math.cos(z * w * 8) * 6.5 * h +
      Math.sin(z * w * 2) * 22 * h
    );
  }

  public getPitchAngle(z: number): number {
    const dy = this.getElevationY(z + 1.0) - this.getElevationY(z - 1.0);
    return Math.atan2(dy, 2.0);
  }

  private trackDisposable<T extends { dispose: () => void }>(resource: T): T {
    if (!this.disposables.includes(resource)) {
      this.disposables.push(resource);
    }
    return resource;
  }

  private buildRoadAndScenery(): void {
    const segmentLen = 8;
    const startSeg = -20; // -160m behind start line
    const endSeg = Math.floor((this.spec.lengthUnits + 960) / segmentLen);
    const totalRings = endSeg - startSeg;

    // 1. Dedicated Asphalt Road Surface
    const roadPositions: number[] = [];
    const roadUVs: number[] = [];
    const roadIndices: number[] = [];

    // 2. Dedicated Shoulders & Rolling Hills Terrain Mesh
    const terrainPositions: number[] = [];
    const terrainColors: number[] = [];
    const terrainIndices: number[] = [];

    const shoulderColor = new THREE.Color(this.spec.shoulderColor);
    const groundColorA = new THREE.Color(this.spec.groundColor);
    const groundColorB = groundColorA.clone().multiplyScalar(0.82);
    const ridgeColor = groundColorA.clone().lerp(new THREE.Color(this.spec.skyBottomColor), 0.25);

    for (let ring = 0; ring <= totalRings; ring++) {
      const segIdx = startSeg + ring;
      const z = segIdx * segmentLen;
      const cx = this.getCurveX(z);
      const cy = this.getElevationY(z);

      const v1x = cx - ROAD_HALF_WIDTH;
      const v2x = cx + ROAD_HALF_WIDTH;

      roadPositions.push(v1x, cy, -z, v2x, cy, -z);

      // Smooth continuous UV coordinate (1 full texture tile every 32m; L is a multiple of 480 so UV wraps at integer)
      const vCoord = segIdx * 0.25;
      roadUVs.push(0, vCoord, 1, vCoord);

      if (ring < totalRings) {
        const base = ring * 2;
        const a = base;
        const b = base + 1;
        const c = base + 2;
        const d = base + 3;
        roadIndices.push(a, b, c, b, d, c);
      }

      // Periodic terrain & shoulder vertices (period = 60 segments = 480m, dividing lengthUnits evenly)
      const phase60 = (segIdx * Math.PI * 2) / 60;
      const phase30 = (segIdx * Math.PI * 2) / 30;
      const waveL = Math.sin(phase60) * 14 + Math.cos(phase30) * 10 + 18;
      const waveR = Math.cos(phase60) * 14 + Math.sin(phase30) * 10 + 18;

      const t0x = cx - 280;
      const t1x = cx - ROAD_HALF_WIDTH - SHOULDER_WIDTH * 2.2;
      const t2x = cx - ROAD_HALF_WIDTH + 0.05;
      const t3x = cx + ROAD_HALF_WIDTH - 0.05;
      const t4x = cx + ROAD_HALF_WIDTH + SHOULDER_WIDTH * 2.2;
      const t5x = cx + 280;

      terrainPositions.push(
        t0x, cy + waveL, -z,
        t1x, cy - 0.35, -z,
        t2x, cy - 0.06, -z,
        t3x, cy - 0.06, -z,
        t4x, cy - 0.35, -z,
        t5x, cy + waveR, -z
      );

      const blend = 0.5 + 0.5 * Math.sin(phase30);
      const gCol = groundColorA.clone().lerp(groundColorB, blend);

      terrainColors.push(
        ridgeColor.r, ridgeColor.g, ridgeColor.b,
        gCol.r, gCol.g, gCol.b,
        shoulderColor.r, shoulderColor.g, shoulderColor.b,
        shoulderColor.r, shoulderColor.g, shoulderColor.b,
        gCol.r, gCol.g, gCol.b,
        ridgeColor.r, ridgeColor.g, ridgeColor.b
      );

      if (ring < totalRings) {
        const tBase = ring * 6;
        for (const q of [0, 1, 3, 4]) {
          const a = tBase + q;
          const b = tBase + q + 1;
          const c = tBase + 6 + q;
          const d = tBase + 6 + q + 1;
          terrainIndices.push(a, b, c, b, d, c);
        }
      }
    }

    const asphaltTex = createAsphaltTexture(this.spec.isNight);
    const roadGeo = this.trackDisposable(new THREE.BufferGeometry());
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUVs, 2));
    roadGeo.setIndex(roadIndices);
    roadGeo.computeVertexNormals();

    const roadMat = this.trackDisposable(
      new THREE.MeshStandardMaterial({
        map: asphaltTex,
        roughness: this.spec.isNight ? 0.58 : 0.76,
        metalness: this.spec.isNight ? 0.18 : 0.08,
      })
    );
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    this.group.add(roadMesh);

    const terrainGeo = this.trackDisposable(new THREE.BufferGeometry());
    terrainGeo.setAttribute('position', new THREE.Float32BufferAttribute(terrainPositions, 3));
    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3));
    terrainGeo.setIndex(terrainIndices);
    terrainGeo.computeVertexNormals();

    const terrainMat = this.trackDisposable(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.03,
      })
    );
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    this.group.add(terrainMesh);

    this.buildSceneryAndGuardrails(endSeg, segmentLen);
    this.buildStartAndFinishGates();
    this.buildSkyAndSynthSun();
  }

  /**
   * Batched GPU Instanced Scenery: Steel W-Beam Guardrail Barriers, Reflector Posts,
   * Streetlights, Overhead Highway Gantries, and Biome Props.
   */
  private buildSceneryAndGuardrails(endSeg: number, segmentLen: number): void {
    const dummy = new THREE.Object3D();

    // 1. Roadside Reflector Posts & Corrugated Steel W-Beam Guardrail Rails
    let postTotal = 0;
    for (let i = 0; i < endSeg; i += 2) {
      postTotal += 2;
    }
    const postGeo = this.trackDisposable(new THREE.BoxGeometry(0.22, 1.05, 0.22));
    const postMat = this.trackDisposable(
      new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.35,
        metalness: 0.72,
        emissive: this.spec.isNight ? 0x0284c7 : 0xdc2626,
        emissiveIntensity: 0.25,
      })
    );
    const railGeo = this.trackDisposable(new THREE.BoxGeometry(0.14, 0.36, segmentLen * 2 + 0.3));
    const railMat = this.trackDisposable(
      new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.38,
        metalness: 0.82,
      })
    );

    const postInst = new THREE.InstancedMesh(postGeo, postMat, postTotal);
    const railInst = new THREE.InstancedMesh(railGeo, railMat, postTotal);
    let pIdx = 0;

    for (let i = 0; i < endSeg; i += 2) {
      const z = i * segmentLen;
      const cx = this.getCurveX(z);
      const cy = this.getElevationY(z);
      const yaw = this.getCurveYaw(z);
      const pitch = this.getPitchAngle(z);

      // Midpoint between post i and post i+2 (where the 16m continuous W-beam rail connects)
      const zMid = z + segmentLen;
      const cxMid = this.getCurveX(zMid);
      const cyMid = this.getElevationY(zMid);
      const yawMid = this.getCurveYaw(zMid);
      const pitchMid = this.getPitchAngle(zMid);

      for (const side of [-1, 1]) {
        const gx = cx + side * (ROAD_HALF_WIDTH + SHOULDER_WIDTH);
        dummy.position.set(gx, cy + 0.5, -z);
        dummy.rotation.set(pitch, -yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        postInst.setMatrixAt(pIdx, dummy.matrix);

        dummy.position.set(cxMid + side * (ROAD_HALF_WIDTH + SHOULDER_WIDTH - 0.12), cyMid + 0.68, -zMid);
        dummy.rotation.set(pitchMid, -yawMid, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        railInst.setMatrixAt(pIdx, dummy.matrix);
        pIdx++;
      }
    }
    postInst.instanceMatrix.needsUpdate = true;
    railInst.instanceMatrix.needsUpdate = true;
    this.group.add(postInst, railInst);

    // 2. Batched Streetlights InstancedMesh (Pole, Arm, Bulb)
    let lampTotal = 0;
    for (let i = 0; i < endSeg; i += 6) {
      lampTotal += 2;
    }

    const poleGeo = this.trackDisposable(new THREE.CylinderGeometry(0.14, 0.2, 9.5, 8));
    const armGeo = this.trackDisposable(new THREE.BoxGeometry(2.8, 0.16, 0.16));
    const bulbGeo = this.trackDisposable(new THREE.BoxGeometry(0.85, 0.2, 0.42));

    const poleMat = this.trackDisposable(
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.78, roughness: 0.26 })
    );
    const bulbMat = this.trackDisposable(
      new THREE.MeshBasicMaterial({ color: this.spec.isNight ? 0xe0f2fe : 0xfef3c7 })
    );

    const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, lampTotal);
    const armInst = new THREE.InstancedMesh(armGeo, poleMat, lampTotal);
    const bulbInst = new THREE.InstancedMesh(bulbGeo, bulbMat, lampTotal);
    let lIdx = 0;

    for (let i = 0; i < endSeg; i += 6) {
      const z = i * segmentLen;
      const cx = this.getCurveX(z);
      const cy = this.getElevationY(z);
      const yaw = this.getCurveYaw(z);

      for (const side of [-1, 1]) {
        const lx = cx + side * (ROAD_HALF_WIDTH + SHOULDER_WIDTH + 1.35);
        const lz = -z;

        dummy.position.set(lx, cy + 4.75, lz);
        dummy.rotation.set(0, -yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        poleInst.setMatrixAt(lIdx, dummy.matrix);

        dummy.position.set(
          lx + -side * 1.3 * Math.cos(yaw),
          cy + 9.4,
          lz + -side * 1.3 * Math.sin(yaw)
        );
        dummy.rotation.set(0, -yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        armInst.setMatrixAt(lIdx, dummy.matrix);

        dummy.position.set(
          lx + -side * 2.3 * Math.cos(yaw),
          cy + 9.26,
          lz + -side * 2.3 * Math.sin(yaw)
        );
        dummy.rotation.set(0, -yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        bulbInst.setMatrixAt(lIdx, dummy.matrix);

        lIdx++;
      }
    }
    poleInst.instanceMatrix.needsUpdate = true;
    armInst.instanceMatrix.needsUpdate = true;
    bulbInst.instanceMatrix.needsUpdate = true;
    this.group.add(poleInst, armInst, bulbInst);

    // 3. Batched Highway Overhead Sign Gantries
    let gantryTotal = 0;
    for (let i = 30; i < endSeg; i += 30) {
      gantryTotal++;
    }

    const gLegGeo = this.trackDisposable(new THREE.CylinderGeometry(0.32, 0.36, 10.5, 8));
    const gBeamGeo = this.trackDisposable(new THREE.BoxGeometry(ROAD_WIDTH + 6, 1.1, 0.65));
    const gSignGeo = this.trackDisposable(new THREE.BoxGeometry(14, 1.15, 0.78));
    const signMat = this.trackDisposable(
      new THREE.MeshStandardMaterial({
        color: 0x064e3b,
        emissive: this.spec.isNight ? 0x047857 : 0x065f46,
        emissiveIntensity: 0.45,
        roughness: 0.32,
      })
    );

    const gLegLInst = new THREE.InstancedMesh(gLegGeo, poleMat, gantryTotal);
    const gLegRInst = new THREE.InstancedMesh(gLegGeo, poleMat, gantryTotal);
    const gBeamInst = new THREE.InstancedMesh(gBeamGeo, poleMat, gantryTotal);
    const gSignInst = new THREE.InstancedMesh(gSignGeo, signMat, gantryTotal);
    let gIdx = 0;

    for (let i = 30; i < endSeg; i += 30) {
      const z = i * segmentLen;
      const cx = this.getCurveX(z);
      const cy = this.getElevationY(z);
      const yaw = this.getCurveYaw(z);

      dummy.position.set(
        cx - (ROAD_HALF_WIDTH + 2.5) * Math.cos(yaw),
        cy + 5.25,
        -z + (ROAD_HALF_WIDTH + 2.5) * Math.sin(yaw)
      );
      dummy.rotation.set(0, -yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      gLegLInst.setMatrixAt(gIdx, dummy.matrix);

      dummy.position.set(
        cx + (ROAD_HALF_WIDTH + 2.5) * Math.cos(yaw),
        cy + 5.25,
        -z - (ROAD_HALF_WIDTH + 2.5) * Math.sin(yaw)
      );
      dummy.rotation.set(0, -yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      gLegRInst.setMatrixAt(gIdx, dummy.matrix);

      dummy.position.set(cx, cy + 10.2, -z);
      dummy.rotation.set(0, -yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      gBeamInst.setMatrixAt(gIdx, dummy.matrix);

      dummy.position.set(cx, cy + 10.2, -z);
      dummy.rotation.set(0, -yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      gSignInst.setMatrixAt(gIdx, dummy.matrix);

      gIdx++;
    }
    gLegLInst.instanceMatrix.needsUpdate = true;
    gLegRInst.instanceMatrix.needsUpdate = true;
    gBeamInst.instanceMatrix.needsUpdate = true;
    gSignInst.instanceMatrix.needsUpdate = true;
    this.group.add(gLegLInst, gLegRInst, gBeamInst, gSignInst);

    // 4. Batched Roadside Props with periodic placement (period = 60 segments)
    let propCount = 0;
    for (let i = 0; i < endSeg; i += 3) {
      propCount += 2;
    }

    if (this.spec.isNight) {
      const buildingTex = createBuildingWindowTexture(0x38bdf8);
      const buildingMat = this.trackDisposable(
        new THREE.MeshStandardMaterial({
          map: buildingTex,
          emissiveMap: buildingTex,
          emissive: 0xffffff,
          emissiveIntensity: 0.72,
          roughness: 0.3,
          metalness: 0.4,
        })
      );
      const towerGeo = this.trackDisposable(new THREE.BoxGeometry(1, 1, 1));
      const towerInst = new THREE.InstancedMesh(towerGeo, buildingMat, propCount);
      let tIdx = 0;

      for (let i = 0; i < endSeg; i += 3) {
        const m = ((i % 60) + 60) % 60;
        const z = i * segmentLen;
        const cx = this.getCurveX(z);
        const cy = this.getElevationY(z);

        for (const side of [-1, 1]) {
          const distFromRoad = ROAD_HALF_WIDTH + SHOULDER_WIDTH + 8 + ((m * 7) % 22);
          const px = cx + side * distFromRoad;
          const h = 22 + ((m * 13) % 38);
          const w = 6.5 + ((m * 3) % 4.5);

          dummy.position.set(px, cy - 0.5 + h / 2, -z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(w, h, w);
          dummy.updateMatrix();
          towerInst.setMatrixAt(tIdx++, dummy.matrix);
        }
      }
      towerInst.instanceMatrix.needsUpdate = true;
      this.group.add(towerInst);
    } else if (this.spec.id === 1) {
      const crownMat = this.trackDisposable(
        new THREE.MeshStandardMaterial({ color: 0xa14a24, roughness: 0.82, metalness: 0.05 })
      );
      const rockGeo = this.trackDisposable(new THREE.DodecahedronGeometry(1, 1));
      const rockInst = new THREE.InstancedMesh(rockGeo, crownMat, propCount);
      let rIdx = 0;

      for (let i = 0; i < endSeg; i += 3) {
        const m = ((i % 60) + 60) % 60;
        const z = i * segmentLen;
        const cx = this.getCurveX(z);
        const cy = this.getElevationY(z);

        for (const side of [-1, 1]) {
          const distFromRoad = ROAD_HALF_WIDTH + SHOULDER_WIDTH + 6 + ((m * 7) % 20);
          const px = cx + side * distFromRoad;
          const scale = 3.2 + ((m * 5) % 6.5);

          dummy.position.set(px, cy - 0.5 + scale * 0.6, -z);
          dummy.rotation.set(m * 0.3, m * 0.7, 0);
          dummy.scale.set(scale * 1.25, scale * 0.92, scale);
          dummy.updateMatrix();
          rockInst.setMatrixAt(rIdx++, dummy.matrix);
        }
      }
      rockInst.instanceMatrix.needsUpdate = true;
      this.group.add(rockInst);
    } else {
      const trunkMat = this.trackDisposable(
        new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.88 })
      );
      const palmCrownMat = this.trackDisposable(
        new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.62 })
      );
      const trunkGeo = this.trackDisposable(new THREE.CylinderGeometry(0.22, 0.52, 9.2, 7));
      const frondGeo = this.trackDisposable(new THREE.ConeGeometry(0.85, 4.2, 5));
      frondGeo.rotateX(Math.PI * 0.42);
      frondGeo.translate(0, 0, 1.8);

      const frondsPerTree = 5;
      const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, propCount);
      const frondInst = new THREE.InstancedMesh(frondGeo, palmCrownMat, propCount * frondsPerTree);
      let trIdx = 0;
      let frIdx = 0;

      for (let i = 0; i < endSeg; i += 3) {
        const m = ((i % 60) + 60) % 60;
        const z = i * segmentLen;
        const cx = this.getCurveX(z);
        const cy = this.getElevationY(z);

        for (const side of [-1, 1]) {
          const distFromRoad = ROAD_HALF_WIDTH + SHOULDER_WIDTH + 6 + ((m * 7) % 20);
          const px = cx + side * distFromRoad;
          const pz = -z;
          const treeScale = 0.85 + ((m * 3) % 5) * 0.08;

          dummy.position.set(px, cy - 0.4 + 4.4 * treeScale, pz);
          dummy.rotation.set(0.05, m * 0.5, side * -0.08);
          dummy.scale.set(treeScale, treeScale, treeScale);
          dummy.updateMatrix();
          trunkInst.setMatrixAt(trIdx++, dummy.matrix);

          for (let f = 0; f < frondsPerTree; f++) {
            const angle = (f * Math.PI * 2) / frondsPerTree + (m % 3) * 0.2;
            dummy.position.set(px - side * 0.3, cy - 0.4 + 8.8 * treeScale, pz);
            dummy.rotation.set(0.28, angle, 0);
            dummy.scale.set(treeScale, treeScale * 0.35, treeScale);
            dummy.updateMatrix();
            frondInst.setMatrixAt(frIdx++, dummy.matrix);
          }
        }
      }
      trunkInst.instanceMatrix.needsUpdate = true;
      frondInst.instanceMatrix.needsUpdate = true;
      this.group.add(trunkInst, frondInst);
    }
  }

  private buildStartAndFinishGates(): void {
    const checkerTex = createCheckerBannerTexture();
    const pillarGeo = this.trackDisposable(new THREE.CylinderGeometry(0.55, 0.55, 11.5, 10));
    const pillarMat = this.trackDisposable(
      new THREE.MeshStandardMaterial({
        color: 0xe11d48,
        metalness: 0.72,
        roughness: 0.24,
      })
    );
    const bannerGeo = this.trackDisposable(new THREE.BoxGeometry(ROAD_WIDTH + 4, 2.4, 1.0));
    const bannerMat = this.trackDisposable(new THREE.MeshBasicMaterial({ map: checkerTex }));

    const lightBoxGeo = this.trackDisposable(new THREE.BoxGeometry(7.2, 1.5, 0.9));
    const lightBoxMat = this.trackDisposable(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.25 })
    );
    const lampGeo = this.trackDisposable(new THREE.SphereGeometry(0.46, 12, 12));

    this.startLightMats = [
      this.trackDisposable(new THREE.MeshBasicMaterial({ color: 0x330a0a })),
      this.trackDisposable(new THREE.MeshBasicMaterial({ color: 0x332405 })),
      this.trackDisposable(new THREE.MeshBasicMaterial({ color: 0x052e16 })),
    ];

    for (const zPos of [0, this.spec.lengthUnits]) {
      const cx = this.getCurveX(zPos);
      const cy = this.getElevationY(zPos);
      const yaw = this.getCurveYaw(zPos);

      const gate = new THREE.Group();
      gate.position.set(cx, cy, -zPos);
      gate.rotation.set(0, -yaw, 0);

      const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
      leftPillar.position.set(-ROAD_HALF_WIDTH - 1.5, 5.75, 0);

      const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
      rightPillar.position.set(ROAD_HALF_WIDTH + 1.5, 5.75, 0);

      const topBanner = new THREE.Mesh(bannerGeo, bannerMat);
      topBanner.position.set(0, 10.8, 0);

      // Add 3D Starting Traffic Light Pod under the gantry banner
      const lightBox = new THREE.Mesh(lightBoxGeo, lightBoxMat);
      lightBox.position.set(0, 8.85, 0.2);
      gate.add(lightBox);

      const xOffsets = [-2.1, 0, 2.1];
      for (let i = 0; i < 3; i++) {
        const lamp = new THREE.Mesh(lampGeo, this.startLightMats[i]);
        lamp.position.set(xOffsets[i], 8.85, 0.52);
        gate.add(lamp);
      }

      gate.add(leftPillar, rightPillar, topBanner);
      this.group.add(gate);
    }
  }

  /**
   * Updates the 3D overhead gantry traffic lights during READY -> STEADY -> GO!
   */
  public setStartLightState(stage: 'off' | 'ready' | 'steady' | 'go'): void {
    if (this.startLightMats.length < 3) return;
    this.startLightMats[0].color.setHex(stage === 'ready' ? 0xff1744 : 0x330a0a);
    this.startLightMats[1].color.setHex(stage === 'steady' ? 0xffbe0b : 0x332405);
    this.startLightMats[2].color.setHex(stage === 'go' ? 0x00ff66 : 0x052e16);
  }

  private buildSkyAndSynthSun(): void {
    const sunTex = createSynthSunTexture(this.spec.isNight);
    const sunGeo = this.trackDisposable(new THREE.PlaneGeometry(340, 340));
    const sunMat = this.trackDisposable(
      new THREE.MeshBasicMaterial({
        map: sunTex,
        transparent: true,
        fog: false,
        depthWrite: false,
      })
    );
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.sunMesh.position.set(0, 134, -900);
    this.sunMesh.renderOrder = -1;
    this.group.add(this.sunMesh);

    const starCount = 700;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 1800;
      starPos[i * 3 + 1] = 75 + Math.random() * 420;
      starPos[i * 3 + 2] = -Math.random() * (this.spec.lengthUnits + 1200);
    }
    const starGeo = this.trackDisposable(new THREE.BufferGeometry());
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = this.trackDisposable(
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: this.spec.isNight ? 2.0 : 1.1,
        transparent: true,
        opacity: this.spec.isNight ? 0.9 : 0.35,
        fog: false,
        depthWrite: false,
      })
    );
    this.starField = new THREE.Points(starGeo, starMat);
    this.group.add(this.starField);
  }

  public dispose(): void {
    for (const item of this.disposables) {
      try {
        item.dispose();
      } catch {
        // Safe disposal fallback
      }
    }
    this.disposables = [];
  }
}
