import * as THREE from 'three';

export type WeaponType = 'fists' | 'crowbar' | 'chain' | 'nunchuks' | 'baton' | 'katana';

export interface WeaponSpec {
  id: WeaponType;
  name: string;
  icon: string;
  damage: number;
  knockback: number;
  range: number;
  color: number;
}

export interface TrackSpec {
  id: number;
  name: string;
  lengthMiles: number;
  lengthUnits: number;
  laps: number;
  skyTopColor: number;
  skyBottomColor: number;
  fogColor: number;
  groundColor: number;
  roadColor: number;
  shoulderColor: number;
  curveIntensity: number;
  hillIntensity: number;
  trafficDensity: number;
  prizePurse: number;
  isNight: boolean;
}

export interface BikeSpec {
  id: number;
  name: string;
  maxSpeedMph: number;
  accel: number;
  handling: number;
  meleeMult: number;
  armorMult: number;
  primaryColor: number;
  accentColor: number;
}

export interface GarageUpgrades {
  tier: number;
  engineLevel: number;
  nitroLevel: number;
  armorLevel: number;
  meleeLevel: number;
}

export type AttackSide = 'left' | 'right' | 'kick-left' | 'kick-right' | null;

export interface RacerEntity {
  id: string;
  name: string;
  isPlayer: boolean;
  isPolice: boolean;
  mesh: THREE.Group;
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

  // Spatial state along track
  z: number;
  totalDistance: number;
  lap: number;
  x: number;
  yOffset: number; // Vertical height above road surface (jumps/stunts!)
  vy: number; // Vertical velocity
  vx: number; // Lateral velocity
  speed: number; // Forward speed (units/sec)
  leanAngle: number;
  shoveTilt: number; // Wobble/tilt angle when shoved by weapon or collision
  wheelieAngle: number;
  airTime: number;

  // Combat & Health & Nitro Burst State
  hp: number;
  maxHp: number;
  bikeHp: number;
  maxBikeHp: number;
  nitro: number;
  nitroBoostTimer: number; // Active timed nitro speed-up burst (seconds remaining)
  nitroCooldown: number; // Cooldown before AI bot can trigger next nitro burst
  weapon: WeaponType;
  slipstreamCharge: number;

  // Attack & Stagger state
  attackSide: AttackSide;
  attackTimer: number;
  attackCooldown: number;
  hasDealtHitInSwing: boolean;
  staggerTimer: number;
  lastHitByPlayerTimer: number;

  // Wipeout / crash state
  wipedOut: boolean;
  wipeoutTimer: number;
  wipeoutSpin: number;
  invulnTimer: number;

  // AI parameters
  targetX: number;
  aiAggression: number;
  aiBaseSpeed: number;
  aiLaneTimer: number;
  primaryColor: number;

  // Smoothed 2D screen label coordinates
  screenX?: number;
  screenY?: number;
}

export interface TrafficVehicle {
  mesh: THREE.Group;
  wheels: THREE.Object3D[];
  z: number;
  x: number;
  targetX: number;
  laneIndex: number;
  laneChangeTimer: number;
  isChangingLanes: boolean;
  speed: number;
  baseSpeed: number;
  isBraking: boolean;
  width: number;
  length: number;
  type: 'sedan' | 'truck' | 'sports';
  oncoming: boolean;
  rearLightMat?: THREE.MeshStandardMaterial;
}

export interface PickupItem {
  mesh: THREE.Group;
  z: number;
  x: number;
  type: 'nitro' | 'repair' | 'weapon' | 'cash';
  weaponType?: WeaponType;
  collected: boolean;
}

export interface StuntRamp {
  mesh: THREE.Group;
  z: number;
  x: number;
  width: number;
  length: number;
}

export interface ParticleBurst {
  mesh: THREE.Points;
  velocities: Float32Array;
  life: number;
  maxLife: number;
}

export interface LapLeaderInfo {
  lap: number;
  racerId: string;
  racerName: string;
  isPlayer: boolean;
  splitTime: number;
  totalTimeAtCross: number;
}

export interface RacerLapRecord {
  id: string;
  name: string;
  isPlayer: boolean;
  color: number;
  prevDistance: number;
  lapTimes: number[];          // Split times in seconds for each completed lap [lap1, lap2, ...]
  lapTimestamps: number[];     // Race elapsed time at each lap completion
  lastLapCrossingTime: number; // Race elapsed time when the current lap began
  totalTime: number;           // Total official time across all laps
  finished: boolean;
  finishPosition: number;
  bestLap: number;
  isFastestLapHolder: boolean;
  isDNF: boolean;
}

