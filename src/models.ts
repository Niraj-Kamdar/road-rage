import * as THREE from 'three';
import { WeaponType } from './types';
import { WEAPONS } from './config';
import { createCockpitDashTexture } from './textures';

export interface BuiltBikeModel {
  group: THREE.Group;
  riderBodyGroup: THREE.Group;
  handlebarGroup: THREE.Group;
  frontWheelMesh: THREE.Object3D;
  rearWheelMesh: THREE.Object3D;
  leftArmPivot: THREE.Object3D;
  rightArmPivot: THREE.Object3D;
  leftLegPivot: THREE.Object3D;
  rightLegPivot: THREE.Object3D;
  weaponMesh: THREE.Object3D;
  swingArcMesh: THREE.Mesh;
  flameMeshLeft: THREE.Mesh;
  flameMeshRight: THREE.Mesh;
  sirenLightRed?: THREE.PointLight;
  sirenLightBlue?: THREE.PointLight;
  policeStrobeMeshes?: THREE.Mesh[];
}

function createWheelUnit(radius = 0.56, tube = 0.21, rimColor = 0xe2e8f0): THREE.Group {
  const wheelGroup = new THREE.Group();

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x111318,
    roughness: 0.82,
    metalness: 0.14,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: rimColor,
    roughness: 0.18,
    metalness: 0.9,
  });
  const rotorMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.28,
    metalness: 0.85,
  });
  const caliperMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.3,
    metalness: 0.65,
  });

  const tire = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 14, 28), tireMat);
  tire.rotation.y = Math.PI / 2;
  tire.castShadow = true;
  wheelGroup.add(tire);

  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.72, 0.055, 8, 24), rimMat);
  rimRing.rotation.y = Math.PI / 2;
  wheelGroup.add(rimRing);

  const spokeGeo = new THREE.BoxGeometry(0.075, radius * 1.38, 0.055);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(spokeGeo, rimMat);
    spoke.rotation.x = (i * Math.PI) / 5;
    wheelGroup.add(spoke);
  }

  const discGeo = new THREE.CylinderGeometry(radius * 0.54, radius * 0.54, 0.09, 16);
  discGeo.rotateZ(Math.PI / 2);
  const disc = new THREE.Mesh(discGeo, rotorMat);
  wheelGroup.add(disc);

  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.22), caliperMat);
  caliper.position.set(0, radius * 0.38, 0.22);
  wheelGroup.add(caliper);

  return wheelGroup;
}

export function createBikeAndRiderMesh(
  primaryColor: number,
  accentColor: number,
  isPolice: boolean = false,
  initialWeapon: WeaponType = 'fists',
  isPlayer: boolean = false
): BuiltBikeModel {
  const root = new THREE.Group();

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.12,
    metalness: 0.94,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.38,
    metalness: 0.78,
  });
  // High-contrast CHP Black & White Interceptor livery for Police; metallic paint for racers
  const bodyMat = new THREE.MeshStandardMaterial({
    color: isPolice ? 0xf8fafc : primaryColor,
    roughness: 0.16,
    metalness: isPolice ? 0.45 : 0.74,
  });
  const lowerFairingMat = new THREE.MeshStandardMaterial({
    color: isPolice ? 0x090d16 : primaryColor,
    roughness: 0.22,
    metalness: 0.68,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: isPolice ? 0x0284c7 : accentColor,
    roughness: 0.24,
    metalness: 0.62,
  });
  const neonTrimMat = new THREE.MeshBasicMaterial({
    color: isPolice ? 0x0088ff : primaryColor,
  });

  // Spinning Front & Rear Wheels
  const rearWheelMesh = createWheelUnit(0.56, 0.22, isPolice ? 0xcbd5e1 : 0xe2e8f0);
  rearWheelMesh.position.set(0, 0.58, 1.18);
  root.add(rearWheelMesh);

  const frontWheelMesh = createWheelUnit(0.54, 0.19, isPolice ? 0xcbd5e1 : 0xe2e8f0);
  frontWheelMesh.position.set(0, 0.56, -1.28);
  root.add(frontWheelMesh);

  // Rear Swingarm, Chain Guard & Fender
  const swingArm = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 1.12), darkMetalMat);
  swingArm.position.set(0, 0.64, 0.72);
  swingArm.rotation.x = -0.15;
  root.add(swingArm);

  // Engine Block, Radiator & Crankcase
  const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.62, 0.98), darkMetalMat);
  engineBlock.position.set(0, 0.75, 0.08);
  root.add(engineBlock);

  const radiator = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.42, 0.12), chromeMat);
  radiator.position.set(0, 0.78, -0.58);
  radiator.rotation.x = 0.28;
  root.add(radiator);

  const cylinderHead = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.28, 0.54), chromeMat);
  cylinderHead.position.set(0, 0.96, -0.1);
  cylinderHead.rotation.x = 0.35;
  root.add(cylinderHead);

  // Sculpted Side Fairings
  const sideFairingGeo = new THREE.BoxGeometry(0.78, 0.44, 1.05);
  const sideFairing = new THREE.Mesh(sideFairingGeo, lowerFairingMat);
  sideFairing.position.set(0, 0.86, -0.32);
  sideFairing.rotation.x = 0.14;
  sideFairing.castShadow = true;
  root.add(sideFairing);

  // Dual Chrome Exhaust Pipes & Twin Nitro Flame Cones
  const pipeGeo = new THREE.CylinderGeometry(0.075, 0.105, 1.45, 12);
  pipeGeo.rotateX(Math.PI / 2.18);
  const leftPipe = new THREE.Mesh(pipeGeo, chromeMat);
  leftPipe.position.set(-0.38, 0.54, 0.8);
  root.add(leftPipe);

  const rightPipe = new THREE.Mesh(pipeGeo, chromeMat);
  rightPipe.position.set(0.38, 0.54, 0.8);
  root.add(rightPipe);

  const flameGeo = new THREE.ConeGeometry(0.16, 1.35, 12);
  flameGeo.rotateX(Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const flameMeshLeft = new THREE.Mesh(flameGeo, flameMat);
  flameMeshLeft.position.set(-0.38, 0.58, 1.92);
  root.add(flameMeshLeft);

  const flameMeshRight = new THREE.Mesh(flameGeo, flameMat.clone());
  flameMeshRight.position.set(0.38, 0.58, 1.92);
  root.add(flameMeshRight);

  // Sculpted Fuel Tank & Tail Cowl
  const tankMesh = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.5, 1.42), bodyMat);
  tankMesh.position.set(0, 1.14, -0.05);
  tankMesh.castShadow = true;
  root.add(tankMesh);

  // Racing Stripe cleanly raised above top of tank
  const stripeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 1.38), accentMat);
  stripeMesh.position.set(0, 1.4, -0.05);
  root.add(stripeMesh);

  // Side Aero Winglets + Underglow Strip
  const wingGeo = new THREE.BoxGeometry(0.98, 0.07, 0.62);
  const winglet = new THREE.Mesh(wingGeo, accentMat);
  winglet.position.set(0, 1.02, -0.62);
  winglet.rotation.x = 0.18;
  root.add(winglet);

  const underglow = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.04, 1.35), neonTrimMat);
  underglow.position.set(0, 0.44, 0.0);
  root.add(underglow);

  // Raised Sport Tail Section & Saddle Seat
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.85 });
  const seatMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.68), seatMat);
  seatMesh.position.set(0, 1.24, 0.48);
  root.add(seatMesh);

  const tailCowl = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.26, 0.82), bodyMat);
  tailCowl.position.set(0, 1.28, 0.92);
  tailCowl.rotation.x = 0.28;
  root.add(tailCowl);

  // Aggressive Front Nose Fairing & Tinted Bubble Visor
  const noseGeo = new THREE.ConeGeometry(0.48, 0.94, 6);
  noseGeo.rotateX(-Math.PI / 2);
  const noseMesh = new THREE.Mesh(noseGeo, bodyMat);
  noseMesh.position.set(0, 1.16, -1.18);
  root.add(noseMesh);

  const visorMat = new THREE.MeshStandardMaterial({
    color: isPolice ? 0x38bdf8 : 0x0ea5e9,
    roughness: 0.1,
    metalness: 0.4,
    transparent: true,
    opacity: isPlayer ? 0.3 : 0.72,
    depthWrite: false,
  });
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.28, 0.52), visorMat);
  windshield.position.set(0, 1.43, -0.96);
  windshield.rotation.x = 0.48;
  root.add(windshield);

  // ==========================================
  // COCKPIT & HANDLEBAR GROUP (Visible in FPV!)
  // ==========================================
  const handlebarGroup = new THREE.Group();
  root.add(handlebarGroup);

  const dashTex = createCockpitDashTexture();
  const dashScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.2),
    new THREE.MeshBasicMaterial({ map: dashTex })
  );
  dashScreen.position.set(0, 1.44, -0.82);
  dashScreen.rotation.x = -0.45;
  handlebarGroup.add(dashScreen);

  const dashHousing = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.23, 0.06), darkMetalMat);
  dashHousing.position.set(0, 1.43, -0.85);
  dashHousing.rotation.x = -0.45;
  handlebarGroup.add(dashHousing);

  // Inverted Gold Front Forks & Clip-on Handlebars
  const goldForkMat = new THREE.MeshStandardMaterial({
    color: isPolice ? 0xe2e8f0 : 0xfbbf24,
    roughness: 0.22,
    metalness: 0.88,
  });
  const forkGeo = new THREE.CylinderGeometry(0.05, 0.046, 1.15, 10);
  const leftFork = new THREE.Mesh(forkGeo, goldForkMat);
  leftFork.position.set(-0.22, 0.96, -1.06);
  leftFork.rotation.x = 0.32;
  handlebarGroup.add(leftFork);

  const rightFork = new THREE.Mesh(forkGeo, goldForkMat);
  rightFork.position.set(0.22, 0.96, -1.06);
  rightFork.rotation.x = 0.32;
  handlebarGroup.add(rightFork);

  const barGeo = new THREE.CylinderGeometry(0.034, 0.034, 1.08, 10);
  barGeo.rotateZ(Math.PI / 2);
  const handlebar = new THREE.Mesh(barGeo, chromeMat);
  handlebar.position.set(0, 1.45, -0.74);
  handlebarGroup.add(handlebar);

  const gripGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.24, 10);
  gripGeo.rotateZ(Math.PI / 2);
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
  const leftGrip = new THREE.Mesh(gripGeo, gripMat);
  leftGrip.position.set(-0.44, 1.45, -0.74);
  const rightGrip = new THREE.Mesh(gripGeo, gripMat);
  rightGrip.position.set(0.44, 1.45, -0.74);
  handlebarGroup.add(leftGrip, rightGrip);

  // Headlight + Player SpotLight
  const headLightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfef08a,
    emissiveIntensity: 1.6,
    roughness: 0.15,
  });
  const headLight = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), headLightMat);
  headLight.position.set(0, 1.15, -1.58);
  root.add(headLight);

  if (isPlayer) {
    const beam = new THREE.SpotLight(0xe0f2fe, 3.0, 95, Math.PI / 4.8, 0.5, 1.1);
    beam.position.set(0, 1.25, -1.55);
    beam.target.position.set(0, 0.1, -36);
    root.add(beam);
    root.add(beam.target);
  }

  // LED Taillight Bar
  const tailLightMat = new THREE.MeshStandardMaterial({
    color: 0xff1744,
    emissive: 0xff1744,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });
  const tailLight = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.08), tailLightMat);
  tailLight.position.set(0, 1.32, 1.34);
  root.add(tailLight);

  // Melee Swing Slash Arc Mesh
  const arcGeo = new THREE.RingGeometry(1.1, 2.6, 18, 1, 0, Math.PI * 0.85);
  arcGeo.rotateX(-Math.PI / 2);
  const arcMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const swingArcMesh = new THREE.Mesh(arcGeo, arcMat);
  swingArcMesh.position.set(0, 1.55, -0.2);
  root.add(swingArcMesh);

  // =========================================================
  // DISTINCT HIGHWAY PATROL POLICE INTERCEPTOR EQUIPMENT
  // =========================================================
  let sirenLightRed: THREE.PointLight | undefined;
  let sirenLightBlue: THREE.PointLight | undefined;
  let policeStrobeMeshes: THREE.Mesh[] | undefined;

  if (isPolice) {
    policeStrobeMeshes = [];

    // 1. Twin White Police Hard-Case Saddlebags / Panniers with Red/Blue Patrol Stripes
    const pannierGeo = new THREE.BoxGeometry(0.28, 0.42, 0.78);
    const pannierStripeRedMat = new THREE.MeshBasicMaterial({ color: 0xff1744 });
    const pannierStripeBlueMat = new THREE.MeshBasicMaterial({ color: 0x0088ff });

    for (const side of [-1, 1]) {
      const pannier = new THREE.Mesh(pannierGeo, bodyMat);
      pannier.position.set(side * 0.46, 0.96, 0.78);
      pannier.castShadow = true;
      root.add(pannier);

      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.1, 0.74),
        side < 0 ? pannierStripeRedMat : pannierStripeBlueMat
      );
      stripe.position.set(side * 0.46, 1.02, 0.78);
      root.add(stripe);
    }

    // 2. Chrome Front Police Bullbar / Crash Guard
    const crashBar = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.038, 8, 16), chromeMat);
    crashBar.position.set(0, 0.86, -0.68);
    root.add(crashBar);

    // 3. Front Fairing Police Strobe Lightbar (visible from ahead & in mirrors)
    const frontRedMat = new THREE.MeshBasicMaterial({ color: 0xff1744 });
    const frontBlueMat = new THREE.MeshBasicMaterial({ color: 0x0088ff });
    const frontPodGeo = new THREE.BoxGeometry(0.26, 0.13, 0.14);

    const frontRedPod = new THREE.Mesh(frontPodGeo, frontRedMat);
    frontRedPod.position.set(-0.26, 1.38, -1.28);
    root.add(frontRedPod);

    const frontBluePod = new THREE.Mesh(frontPodGeo, frontBlueMat);
    frontBluePod.position.set(0.26, 1.38, -1.28);
    root.add(frontBluePod);

    // 4. Dual Rear Telescopic Police Siren Poles & High-Visibility Beacons
    const poleGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.88);
    const leftPole = new THREE.Mesh(poleGeo, chromeMat);
    leftPole.position.set(-0.38, 1.68, 1.05);
    const rightPole = new THREE.Mesh(poleGeo, chromeMat);
    rightPole.position.set(0.38, 1.68, 1.05);
    root.add(leftPole, rightPole);

    const redBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 12),
      frontRedMat
    );
    redBeacon.position.set(-0.38, 2.15, 1.05);
    root.add(redBeacon);

    const blueBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 12),
      frontBlueMat
    );
    blueBeacon.position.set(0.38, 2.15, 1.05);
    root.add(blueBeacon);

    // Overhead Police Lightbar Bridge between rear beacons
    const lightBridge = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.12, 0.22), darkMetalMat);
    lightBridge.position.set(0, 2.12, 1.05);
    root.add(lightBridge);

    policeStrobeMeshes.push(redBeacon, blueBeacon, frontRedPod, frontBluePod);

    sirenLightRed = new THREE.PointLight(0xff1744, 3.8, 22);
    sirenLightRed.position.copy(redBeacon.position);
    root.add(sirenLightRed);

    sirenLightBlue = new THREE.PointLight(0x0088ff, 3.8, 22);
    sirenLightBlue.position.copy(blueBeacon.position);
    root.add(sirenLightBlue);
  }

  // ==========================================
  // RIDER BODY GROUP (Hidden in FPV!)
  // ==========================================
  const riderBodyGroup = new THREE.Group();
  root.add(riderBodyGroup);

  const jacketMat = new THREE.MeshStandardMaterial({
    color: isPolice ? 0x0a1931 : primaryColor,
    roughness: 0.38,
    metalness: 0.24,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: isPolice ? 0x0f172a : 0x141720,
    roughness: 0.62,
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color: 0x090b10,
    roughness: 0.38,
    metalness: 0.32,
  });
  const helmetMat = new THREE.MeshStandardMaterial({
    color: isPolice ? 0xf8fafc : 0x0f172a,
    roughness: 0.12,
    metalness: 0.82,
  });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.78, 0.42), jacketMat);
  torso.position.set(0, 1.74, 0.16);
  torso.rotation.x = -0.52;
  torso.castShadow = true;
  riderBodyGroup.add(torso);

  const goldBadgeMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xca8a04,
    emissiveIntensity: 0.35,
    roughness: 0.2,
    metalness: 0.9,
  });

  const padGeo = new THREE.SphereGeometry(0.17, 10, 10);
  const leftPad = new THREE.Mesh(padGeo, isPolice ? goldBadgeMat : accentMat);
  leftPad.position.set(-0.35, 0.28, 0);
  const rightPad = new THREE.Mesh(padGeo, isPolice ? goldBadgeMat : accentMat);
  rightPad.position.set(0.35, 0.28, 0);
  torso.add(leftPad, rightPad);

  const backPatch = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.48, 0.05),
    isPolice ? goldBadgeMat : accentMat
  );
  backPatch.position.set(0, 0.08, 0.23);
  torso.add(backPatch);

  if (isPolice) {
    // White Police Utility Belt & Chest Shield
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.12, 0.46),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })
    );
    belt.position.set(0, -0.28, 0);
    torso.add(belt);
  }

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.31, 16, 16), helmetMat);
  helmet.position.set(0, 2.24, -0.15);
  helmet.castShadow = true;
  riderBodyGroup.add(helmet);

  if (isPolice) {
    // Dark Blue Police Patrol Helmet Trim Band
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.315, 0.315, 0.1, 16),
      new THREE.MeshBasicMaterial({ color: 0x0284c7 })
    );
    helmet.add(band);
  }

  const helmetVisor = new THREE.Mesh(
    new THREE.SphereGeometry(0.295, 12, 12, 0, Math.PI, 0, Math.PI * 0.45),
    new THREE.MeshBasicMaterial({ color: isPolice ? 0x00f0ff : 0xffea00 })
  );
  helmetVisor.rotation.x = -Math.PI * 0.65;
  helmet.add(helmetVisor);

  // ==========================================
  // ARTICULATED ARMS, PRE-BUILT WEAPONS & LEGS
  // ==========================================
  const leftArmPivot = new THREE.Object3D();
  leftArmPivot.position.set(-0.39, 1.9, -0.05);
  root.add(leftArmPivot);

  const armGeo = new THREE.BoxGeometry(0.2, 0.2, 0.78);
  const gloveGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  const leftArmMesh = new THREE.Mesh(armGeo, jacketMat);
  leftArmMesh.position.set(0, -0.1, -0.35);
  leftArmMesh.rotation.x = 0.35;
  const leftGlove = new THREE.Mesh(gloveGeo, bootMat);
  leftGlove.position.set(0, 0, -0.4);
  leftArmMesh.add(leftGlove);
  leftArmPivot.add(leftArmMesh);

  const rightArmPivot = new THREE.Object3D();
  rightArmPivot.position.set(0.39, 1.9, -0.05);
  root.add(rightArmPivot);

  const rightArmMesh = new THREE.Mesh(armGeo, jacketMat);
  rightArmMesh.position.set(0, -0.1, -0.35);
  rightArmMesh.rotation.x = 0.35;
  const rightGlove = new THREE.Mesh(gloveGeo, bootMat);
  rightGlove.position.set(0, 0, -0.4);
  rightArmMesh.add(rightGlove);
  rightArmPivot.add(rightArmMesh);

  // Pre-build all weapon sub-meshes inside weaponMesh so switching weapons mid-race NEVER compiles new WebGPU pipelines!
  const weaponMesh = createPrebuiltWeaponHolder(initialWeapon);
  weaponMesh.position.set(0, -0.15, -0.74);
  rightArmPivot.add(weaponMesh);

  const leftLegPivot = new THREE.Object3D();
  leftLegPivot.position.set(-0.35, 1.4, 0.32);
  root.add(leftLegPivot);

  const legGeo = new THREE.BoxGeometry(0.22, 0.68, 0.24);
  const bootMeshGeo = new THREE.BoxGeometry(0.24, 0.24, 0.38);
  const leftLegMesh = new THREE.Mesh(legGeo, pantsMat);
  leftLegMesh.position.set(0, -0.32, 0);
  leftLegMesh.rotation.x = 0.25;
  const leftBoot = new THREE.Mesh(bootMeshGeo, bootMat);
  leftBoot.position.set(0, -0.36, -0.06);
  leftLegMesh.add(leftBoot);
  leftLegPivot.add(leftLegMesh);

  const rightLegPivot = new THREE.Object3D();
  rightLegPivot.position.set(0.35, 1.4, 0.32);
  root.add(rightLegPivot);

  const rightLegMesh = new THREE.Mesh(legGeo, pantsMat);
  rightLegMesh.position.set(0, -0.32, 0);
  rightLegMesh.rotation.x = 0.25;
  const rightBoot = new THREE.Mesh(bootMeshGeo, bootMat);
  rightBoot.position.set(0, -0.36, -0.06);
  rightLegMesh.add(rightBoot);
  rightLegPivot.add(rightLegMesh);

  return {
    group: root,
    riderBodyGroup,
    handlebarGroup,
    frontWheelMesh,
    rearWheelMesh,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    weaponMesh,
    swingArcMesh,
    flameMeshLeft,
    flameMeshRight,
    sirenLightRed,
    sirenLightBlue,
    policeStrobeMeshes,
  };
}

/**
 * Pre-creates all weapon geometries inside a single Group and toggles active weapon via non-zero scale
 * so WebGPU compiles all weapon shaders on Frame 0 and NEVER pauses when picking up or stealing weapons.
 */
export function createPrebuiltWeaponHolder(activeWeapon: WeaponType): THREE.Object3D {
  const holder = new THREE.Group();
  const weaponTypes: WeaponType[] = ['crowbar', 'chain', 'nunchuks', 'baton', 'katana'];

  for (const wType of weaponTypes) {
    const sub = createWeaponMesh(wType);
    sub.name = `weapon_${wType}`;
    const isVisible = wType === activeWeapon;
    sub.scale.setScalar(isVisible ? 1 : 0.0001);
    holder.add(sub);
  }

  return holder;
}

export function setActiveWeaponOnHolder(holder: THREE.Object3D, activeWeapon: WeaponType): void {
  for (const child of holder.children) {
    const isTarget = child.name === `weapon_${activeWeapon}`;
    child.scale.setScalar(isTarget ? 1 : 0.0001);
  }
}

export function createWeaponMesh(weapon: WeaponType): THREE.Object3D {
  const holder = new THREE.Group();
  if (weapon === 'fists') return holder;

  const spec = WEAPONS[weapon];
  const mat = new THREE.MeshStandardMaterial({
    color: spec.color,
    roughness: 0.2,
    metalness: 0.85,
    emissive: weapon === 'baton' || weapon === 'katana' ? spec.color : 0x000000,
    emissiveIntensity: weapon === 'baton' || weapon === 'katana' ? 0.65 : 0.1,
  });

  if (weapon === 'crowbar' || weapon === 'baton') {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.25, 10), mat);
    bar.rotation.z = Math.PI / 2;
    bar.position.x = 0.48;
    holder.add(bar);
  } else if (weapon === 'katana') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.04, 0.12), mat);
    blade.position.x = 0.62;
    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.24, 0.24),
      new THREE.MeshBasicMaterial({ color: 0xffea00 })
    );
    guard.position.x = -0.05;
    holder.add(blade, guard);
  } else if (weapon === 'chain') {
    for (let i = 0; i < 7; i++) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.03, 6, 12), mat);
      link.position.set(0.16 + i * 0.16, 0, 0);
      link.rotation.x = (i % 2) * (Math.PI / 2);
      holder.add(link);
    }
  } else if (weapon === 'nunchuks') {
    const stick1 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.58, 8), mat);
    stick1.rotation.z = Math.PI / 2;
    stick1.position.set(0.25, 0, 0);
    const stick2 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.58, 8), mat);
    stick2.rotation.z = Math.PI / 3;
    stick2.position.set(0.65, -0.15, 0);
    holder.add(stick1, stick2);
  }

  return holder;
}

export function createTrafficCarMesh(
  type: 'sedan' | 'truck' | 'sports',
  oncoming: boolean
): {
  mesh: THREE.Group;
  wheels: THREE.Object3D[];
  width: number;
  length: number;
  rearLightMat: THREE.MeshStandardMaterial;
} {
  const group = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const palette = [0xdc2626, 0x2563eb, 0xd97706, 0x059669, 0x4f46e5, 0xe11d48, 0x0284c7, 0x475569];
  const color = palette[Math.floor(Math.random() * palette.length)];

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.2,
    metalness: 0.72,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.08,
    metalness: 0.9,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.5,
    metalness: 0.6,
  });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111115, roughness: 0.85 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.25, metalness: 0.85 });

  let width = 2.45;
  let length = 4.9;
  let height = 1.45;

  if (type === 'truck') {
    width = 2.95;
    length = 8.2;
    height = 3.0;
  } else if (type === 'sports') {
    width = 2.42;
    length = 4.65;
    height = 1.22;
  }

  // Lower body & bumpers
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(width, height * 0.52, length), bodyMat);
  chassis.position.y = height * 0.34 + 0.32;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  group.add(chassis);

  const bumperGeo = new THREE.BoxGeometry(width * 0.96, 0.24, length + 0.16);
  const bumper = new THREE.Mesh(bumperGeo, trimMat);
  bumper.position.y = 0.44;
  group.add(bumper);

  if (type === 'truck') {
    // Realistic Semi-Truck Cab + Cargo Trailer Box
    const trailerMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.42,
      metalness: 0.35,
    });
    const trailerLen = length * 0.64;
    const trailerZ = oncoming ? -length * 0.16 : length * 0.16;
    const trailer = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.96, height * 0.62, trailerLen),
      trailerMat
    );
    trailer.position.set(0, height * 0.82 + 0.32, trailerZ);
    trailer.castShadow = true;
    group.add(trailer);

    const cabZ = oncoming ? length * 0.32 : -length * 0.32;
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.88, height * 0.45, length * 0.26),
      bodyMat
    );
    cab.position.set(0, height * 0.72 + 0.32, cabZ);
    group.add(cab);

    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.82, height * 0.28, length * 0.27),
      glassMat
    );
    windshield.position.set(0, height * 0.78 + 0.32, cabZ);
    group.add(windshield);
  } else {
    // Realistic Greenhouse Cabin + Roof Pillbox
    const cabinLength = length * 0.54;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.84, height * 0.44, cabinLength),
      glassMat
    );
    cabin.position.set(0, height * 0.8 + 0.32, oncoming ? -0.15 : 0.15);
    group.add(cabin);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.78, 0.08, cabinLength * 0.76),
      bodyMat
    );
    roof.position.set(0, height * 1.02 + 0.32, oncoming ? -0.15 : 0.15);
    group.add(roof);
  }

  if (type === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, 0.08, 0.38), trimMat);
    spoiler.position.set(0, height * 0.82 + 0.28, oncoming ? -length * 0.42 : length * 0.42);
    group.add(spoiler);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.32, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.34, 10);
  rimGeo.rotateZ(Math.PI / 2);

  const wx = width * 0.49;
  const wz = length * 0.33;
  for (const sx of [-wx, wx]) {
    for (const sz of [-wz, wz]) {
      const wGroup = new THREE.Group();
      wGroup.position.set(sx, 0.44, sz);
      const tire = new THREE.Mesh(wheelGeo, wheelMat);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      wGroup.add(tire, rim);
      wheels.push(wGroup);
      group.add(wGroup);
    }
  }

  const frontLightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfef08a,
    emissiveIntensity: 1.6,
  });
  const rearLightMat = new THREE.MeshStandardMaterial({
    color: 0xff1744,
    emissive: 0xff1744,
    emissiveIntensity: 1.6,
  });

  const frontZ = oncoming ? length / 2 + 0.06 : -length / 2 - 0.06;
  const backZ = oncoming ? -length / 2 - 0.06 : length / 2 + 0.06;

  const hlLeft = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.22, 0.08), frontLightMat);
  hlLeft.position.set(-width * 0.33, 0.74, frontZ);
  const hlRight = hlLeft.clone();
  hlRight.position.x = width * 0.33;

  const tlLeft = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.22, 0.08), rearLightMat);
  tlLeft.position.set(-width * 0.33, 0.74, backZ);
  const tlRight = tlLeft.clone();
  tlRight.position.x = width * 0.33;

  group.add(hlLeft, hlRight, tlLeft, tlRight);

  return { mesh: group, wheels, width, length, rearLightMat };
}

export function createStuntRampMesh(): { mesh: THREE.Group; width: number; length: number } {
  const group = new THREE.Group();
  const width = 4.6;
  const length = 7.0;

  const rampGeo = new THREE.BoxGeometry(width, 0.35, length);
  const rampMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.42,
    metalness: 0.68,
  });
  const deck = new THREE.Mesh(rampGeo, rampMat);
  deck.rotation.x = 0.24;
  deck.position.set(0, 0.75, 0);
  group.add(deck);

  const stripMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
  for (let i = -2; i <= 2; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, 0.08, 0.36), stripMat);
    bar.position.set(0, 0.24, i * 1.15);
    deck.add(bar);
  }

  const railMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
  const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.48, length), railMat);
  leftRail.position.set(-width / 2 - 0.1, 0.18, 0);
  const rightRail = leftRail.clone();
  rightRail.position.x = width / 2 + 0.1;
  deck.add(leftRail, rightRail);

  return { mesh: group, width, length };
}

/**
 * Builds distinct, unmistakable 3D Symbol Pickups:
 * - 'cash': 3D Gold Dollar Sign ($) + Green Cash Bundle
 * - 'repair': 3D Crossed Steel Wrench / Spanner Repair Tool + Mechanic Cross
 * - 'nitro': 3D Twin NOS Nitrous Bottle Canisters + Electric Lightning Bolt
 * - 'weapon': 3D Crossed Katana / Crowbar Weapon Emblem
 */
export function createPickupMesh(type: 'nitro' | 'repair' | 'weapon' | 'cash'): THREE.Group {
  const group = new THREE.Group();

  let ringColor = 0x00f0ff;
  if (type === 'cash') ringColor = 0x00ff88;
  else if (type === 'repair') ringColor = 0x38bdf8;
  else if (type === 'weapon') ringColor = 0xff2a54;

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.15, 0.08, 8, 24),
    new THREE.MeshBasicMaterial({ color: ringColor })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.22;
  group.add(ring);

  const iconHolder = new THREE.Group();
  iconHolder.position.y = 1.45;
  group.add(iconHolder);

  if (type === 'cash') {
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffe600,
      emissive: 0xffb700,
      emissiveIntensity: 0.65,
      roughness: 0.2,
      metalness: 0.85,
    });
    const billMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.45,
      roughness: 0.4,
    });

    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.55, 0.18), goldMat);
    iconHolder.add(spine);

    const barGeo = new THREE.BoxGeometry(0.82, 0.18, 0.18);
    const topBar = new THREE.Mesh(barGeo, goldMat);
    topBar.position.y = 0.52;
    const midBar = new THREE.Mesh(barGeo, goldMat);
    midBar.position.y = 0.0;
    const botBar = new THREE.Mesh(barGeo, goldMat);
    botBar.position.y = -0.52;
    iconHolder.add(topBar, midBar, botBar);

    const sideGeo = new THREE.BoxGeometry(0.18, 0.54, 0.18);
    const leftUpper = new THREE.Mesh(sideGeo, goldMat);
    leftUpper.position.set(-0.32, 0.26, 0);
    const rightLower = new THREE.Mesh(sideGeo, goldMat);
    rightLower.position.set(0.32, -0.26, 0);
    iconHolder.add(leftUpper, rightLower);

    const billStack = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.55), billMat);
    billStack.position.y = -0.9;
    iconHolder.add(billStack);
  } else if (type === 'repair') {
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.9,
    });
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x00ff88,
      emissiveIntensity: 0.55,
      roughness: 0.3,
    });

    const wrenchGroup = new THREE.Group();
    wrenchGroup.rotation.z = Math.PI / 4;

    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.45, 0.14), steelMat);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.65, 0.16), handleMat);
    grip.position.y = -0.25;
    wrenchGroup.add(shaft, grip);

    const jawBaseGeo = new THREE.BoxGeometry(0.56, 0.16, 0.16);
    const jawProngGeo = new THREE.BoxGeometry(0.14, 0.32, 0.16);

    const topJawBase = new THREE.Mesh(jawBaseGeo, steelMat);
    topJawBase.position.y = 0.72;
    const topLeftProng = new THREE.Mesh(jawProngGeo, steelMat);
    topLeftProng.position.set(-0.21, 0.9, 0);
    const topRightProng = new THREE.Mesh(jawProngGeo, steelMat);
    topRightProng.position.set(0.21, 0.9, 0);
    wrenchGroup.add(topJawBase, topLeftProng, topRightProng);

    const tool2Group = new THREE.Group();
    tool2Group.rotation.z = -Math.PI / 4;
    const driverShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 8), steelMat);
    const driverHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.58, 8), handleMat);
    driverHandle.position.y = -0.5;
    const driverTip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.06), steelMat);
    driverTip.position.y = 0.78;
    tool2Group.add(driverShaft, driverHandle, driverTip);

    iconHolder.add(wrenchGroup, tool2Group);
  } else if (type === 'nitro') {
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x0284c7,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.8,
    });
    const boltMat = new THREE.MeshBasicMaterial({ color: 0xffe600 });

    for (const side of [-0.32, 0.32]) {
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 12), tankMat);
      bottle.position.x = side;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), tankMat);
      dome.position.set(side, 0.55, 0);
      iconHolder.add(bottle, dome);
    }

    const boltUpper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.58), boltMat);
    boltUpper.position.set(0.08, 0.25, 0);
    boltUpper.rotation.z = -0.35;
    const boltLower = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.58), boltMat);
    boltLower.position.set(-0.08, -0.25, 0);
    boltLower.rotation.z = -0.35;
    iconHolder.add(boltUpper, boltLower);
  } else {
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xff2a54,
      emissive: 0xff1744,
      emissiveIntensity: 0.65,
      roughness: 0.2,
      metalness: 0.85,
    });
    const hiltMat = new THREE.MeshBasicMaterial({ color: 0xffe600 });

    for (const sign of [-1, 1]) {
      const sword = new THREE.Group();
      sword.rotation.z = sign * (Math.PI / 4);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.55, 0.08), bladeMat);
      blade.position.y = 0.15;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.14), hiltMat);
      guard.position.y = -0.45;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.38, 0.12), hiltMat);
      grip.position.y = -0.7;
      sword.add(blade, guard, grip);
      iconHolder.add(sword);
    }
  }

  return group;
}
