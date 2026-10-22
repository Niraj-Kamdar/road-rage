import { BikeSpec, TrackSpec, WeaponSpec, WeaponType } from './types';

export const ROAD_WIDTH = 28;
export const ROAD_HALF_WIDTH = ROAD_WIDTH / 2;
export const SHOULDER_WIDTH = 6.5;

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
    trafficDensity: 1.15,
    prizePurse: 1500,
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
    trafficDensity: 1.35,
    prizePurse: 2800,
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
    trafficDensity: 1.55,
    prizePurse: 4500,
    isNight: true,
  },
];

export const BIKES: BikeSpec[] = [
  {
    id: 0,
    name: 'ARGON INTERCEPTOR 750',
    maxSpeedMph: 190,
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
    maxSpeedMph: 212,
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
    maxSpeedMph: 198,
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

// Competitive rival speed factors (0.83 -> 0.97 of player base top speed) + dynamic AI nitro bursts
// so opponents actively battle, catch up, and surge ahead for an addictive race!
export const RIVAL_PROFILES: RivalProfile[] = [
  { name: 'AXEL', color: 0x65a30d, weapon: 'fists', aggression: 0.74, speedFactor: 0.83 },
  { name: 'CRUSHER', color: 0x0284c7, weapon: 'chain', aggression: 0.86, speedFactor: 0.85 },
  { name: 'BLITZ', color: 0xeab308, weapon: 'fists', aggression: 0.78, speedFactor: 0.86 },
  { name: 'SPIKE', color: 0xf43f5e, weapon: 'crowbar', aggression: 0.89, speedFactor: 0.88 },
  { name: 'BANSHEE', color: 0x10b981, weapon: 'nunchuks', aggression: 0.85, speedFactor: 0.89 },
  { name: 'TORQUE', color: 0x3b82f6, weapon: 'crowbar', aggression: 0.80, speedFactor: 0.91 },
  { name: 'DIABLO', color: 0x8b5cf6, weapon: 'katana', aggression: 0.92, speedFactor: 0.92 },
  { name: 'ROADHOG', color: 0xea580c, weapon: 'chain', aggression: 0.95, speedFactor: 0.93 },
  { name: 'NATASHA', color: 0xec4899, weapon: 'nunchuks', aggression: 0.88, speedFactor: 0.95 },
  { name: 'RAZOR', color: 0x06b6d4, weapon: 'crowbar', aggression: 0.94, speedFactor: 0.96 },
  { name: 'VIPER', color: 0xf59e0b, weapon: 'katana', aggression: 0.96, speedFactor: 0.97 },
];
