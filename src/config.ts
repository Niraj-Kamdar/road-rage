import { BikeSpec, TrackSpec, WeaponSpec, WeaponType } from './types';

export const ROAD_WIDTH = 28;
export const ROAD_HALF_WIDTH = ROAD_WIDTH / 2;
export const SHOULDER_WIDTH = 4.5;

// Off-Track Friction & Penalty Constants
export const OFF_TRACK_MAX_SPEED_MPH = 52;
export const OFF_TRACK_MAX_SPEED_UNITS = OFF_TRACK_MAX_SPEED_MPH * 0.6; // ~31.2 units/s
export const OFF_TRACK_DRAG = 48; // deceleration drag in units/s²

// 5 Highway Lanes across road width 28 (road boundary: -14 to +14)
export const HIGHWAY_LANES = [-10.4, -5.2, 0.0, 5.2, 10.4] as const;
export const LANE_ONCOMING_INDICES = [0, 1] as const; // Far-left (-10.4) & Inner-left (-5.2)
export const LANE_CENTER_INDEX = 2;                   // Center Express (0.0) - Forward-only, low-density passing corridor
export const LANE_FORWARD_INDICES = [2, 3, 4] as const; // Center (0.0), Inner-right (+5.2), Far-right (+10.4)

export const WEAPONS: Record<WeaponType, WeaponSpec> = {
  fists: {
    id: 'fists',
    name: 'TITANIUM KNUCKLES',
    icon: '👊',
    damage: 14,
    knockback: 24,
    range: 3.4,
    color: 0xffffff,
  },
  crowbar: {
    id: 'crowbar',
    name: 'STEEL CROWBAR',
    icon: '🔧',
    damage: 26,
    knockback: 35,
    range: 4.1,
    color: 0xff3b30,
  },
  chain: {
    id: 'chain',
    name: 'HEAVY IRON CHAIN',
    icon: '⛓️',
    damage: 32,
    knockback: 40,
    range: 4.6,
    color: 0xe2e8f0,
  },
  nunchuks: {
    id: 'nunchuks',
    name: 'CARBON NUNCHUKS',
    icon: '🥢',
    damage: 25,
    knockback: 32,
    range: 4.0,
    color: 0xffcc00,
  },
  baton: {
    id: 'baton',
    name: 'POLICE VOLT BATON',
    icon: '⚡',
    damage: 36,
    knockback: 44,
    range: 4.3,
    color: 0x00f0ff,
  },
  katana: {
    id: 'katana',
    name: 'PLASMA KATANA',
    icon: '🗡️',
    damage: 45,
    knockback: 48,
    range: 4.8,
    color: 0xff007f,
  },
};

// Track lengths are exact multiples of 480 units (60 road segments) so multi-lap circuit wrapping is 100% seamless
export const TRACKS: TrackSpec[] = [
  {
    id: 0,
    name: 'PACIFIC COAST HWY',
    lengthMiles: 2.5,
    lengthUnits: 3360,
    laps: 3,
    skyTopColor: 0x102542,
    skyBottomColor: 0xf48c56,
    fogColor: 0xd47a55,
    groundColor: 0x243b27,
    roadColor: 0x1c1f26,
    shoulderColor: 0xb89668,
    curveIntensity: 1.0,
    hillIntensity: 1.05,
    trafficDensity: 1.0,
    prizePurse: 450,
    isNight: false,
  },
  {
    id: 1,
    name: 'SIERRA CANYON RUN',
    lengthMiles: 3.0,
    lengthUnits: 3840,
    laps: 3,
    skyTopColor: 0x1e1633,
    skyBottomColor: 0xe87a3c,
    fogColor: 0xc26638,
    groundColor: 0x633722,
    roadColor: 0x211e20,
    shoulderColor: 0x9e5e3f,
    curveIntensity: 1.45,
    hillIntensity: 1.55,
    trafficDensity: 1.15,
    prizePurse: 850,
    isNight: false,
  },
  {
    id: 2,
    name: 'NEON METRO EXPRESS',
    lengthMiles: 3.5,
    lengthUnits: 4320,
    laps: 3,
    skyTopColor: 0x050814,
    skyBottomColor: 0x162038,
    fogColor: 0x0b1021,
    groundColor: 0x0a0d16,
    roadColor: 0x141822,
    shoulderColor: 0x262c3a,
    curveIntensity: 1.35,
    hillIntensity: 1.2,
    trafficDensity: 1.25,
    prizePurse: 1500,
    isNight: true,
  },
];

export const BIKES: BikeSpec[] = [
  {
    id: 0,
    name: 'ARGON INTERCEPTOR 750',
    maxSpeedMph: 140,
    accel: 72,
    handling: 27,
    meleeMult: 1.08,
    armorMult: 1.12,
    primaryColor: 0xe11d48,
    accentColor: 0xf8fafc,
  },
  {
    id: 1,
    name: 'KAWASAKI VIPER ZX-10R',
    maxSpeedMph: 150,
    accel: 82,
    handling: 32,
    meleeMult: 0.98,
    armorMult: 0.95,
    primaryColor: 0x10b981,
    accentColor: 0x0f172a,
  },
  {
    id: 2,
    name: 'DIABLO BRAWLER 1200',
    maxSpeedMph: 132,
    accel: 76,
    handling: 25,
    meleeMult: 1.42,
    armorMult: 1.45,
    primaryColor: 0x7c3aed,
    accentColor: 0xf59e0b,
  },
];

export interface RivalProfile {
  name: string;
  color: number;
  weapon: WeaponType;
  aggression: number;
  speedFactor: number;
}

// Economy balancing constants
export const INITIAL_CASH = 100;
export const CASH_PICKUP_VALUE = 35;
export const RIVAL_KO_BOUNTY = 45;
export const POLICE_KO_BOUNTY = 90;
export const STUNT_JUMP_BONUS = 20;

/**
 * Cost to upgrade an individual component from currentLevel to currentLevel + 1.
 * Tier 1: $50 -> $100 -> $200 -> $400
 * Higher tiers scale progressively so reaching high tiers remains achievable.
 */
export function getComponentUpgradeCost(level: number): number {
  const tier = Math.floor((level - 1) / 5) + 1;
  const stepInTier = (level - 1) % 5;

  if (tier === 1) {
    return Math.round(50 * Math.pow(2, stepInTier));
  }

  const tierBase = Math.round(50 * Math.pow(7, tier - 1));
  const stepMult = Math.pow(1.55, stepInTier);
  const rawCost = tierBase * stepMult;

  if (rawCost < 1000) return Math.round(rawCost / 50) * 50;
  if (rawCost < 10000) return Math.round(rawCost / 100) * 100;
  return Math.round(rawCost / 500) * 500;
}

/**
 * Cost to unlock the next Tier once all 4 components have reached the current tier cap.
 * Tier upgrade is more expensive than the last level upgrade in the tier.
 * T1 -> T2: $600 (last upgrade was $400)
 * T2 -> T3: $2,000 (last upgrade was $1,300)
 * T3 -> T4: $13,500 (last upgrade was $9,100)
 */
export function getTierUpgradeCost(tier: number): number {
  const lastLevelCost = getComponentUpgradeCost(tier * 5 - 1);
  const rawCost = lastLevelCost * 1.5;
  if (rawCost < 1000) return Math.round(rawCost / 50) * 50;
  if (rawCost < 10000) return Math.round(rawCost / 100) * 100;
  return Math.round(rawCost / 500) * 500;
}

// Alias for backward compatibility
export const getUpgradeCost = getComponentUpgradeCost;

// Competitive rival speed factors:
// Top rivals (Viper 1.05, Razor 1.03) are slightly faster than player base speed,
// but beatable by collecting nitro pickups.
export const RIVAL_PROFILES: RivalProfile[] = [
  { name: 'AXEL', color: 0x65a30d, weapon: 'fists', aggression: 0.74, speedFactor: 0.84 },
  { name: 'CRUSHER', color: 0x0284c7, weapon: 'chain', aggression: 0.86, speedFactor: 0.87 },
  { name: 'BLITZ', color: 0xeab308, weapon: 'fists', aggression: 0.78, speedFactor: 0.89 },
  { name: 'SPIKE', color: 0xf43f5e, weapon: 'crowbar', aggression: 0.89, speedFactor: 0.91 },
  { name: 'BANSHEE', color: 0x10b981, weapon: 'nunchuks', aggression: 0.85, speedFactor: 0.93 },
  { name: 'TORQUE', color: 0x3b82f6, weapon: 'crowbar', aggression: 0.80, speedFactor: 0.95 },
  { name: 'DIABLO', color: 0x8b5cf6, weapon: 'katana', aggression: 0.92, speedFactor: 0.98 },
  { name: 'ROADHOG', color: 0xea580c, weapon: 'chain', aggression: 0.95, speedFactor: 0.99 },
  { name: 'NATASHA', color: 0xec4899, weapon: 'nunchuks', aggression: 0.88, speedFactor: 1.01 },
  { name: 'RAZOR', color: 0x06b6d4, weapon: 'crowbar', aggression: 0.94, speedFactor: 1.03 },
  { name: 'VIPER', color: 0xf59e0b, weapon: 'katana', aggression: 0.96, speedFactor: 1.05 },
];
