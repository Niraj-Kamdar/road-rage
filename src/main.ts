import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import confetti from 'canvas-confetti';
import {
  AttackSide,
  BikeSpec,
  GarageUpgrades,
  LapLeaderInfo,
  PickupItem,
  RacerEntity,
  RacerLapRecord,
  StuntRamp,
  TrackSpec,
  TrafficVehicle,
  WeaponType,
} from './types';
import {
  BIKES,
  HIGHWAY_LANES,
  LANE_CENTER_INDEX,
  LANE_FORWARD_INDICES,
  LANE_ONCOMING_INDICES,
  OFF_TRACK_DRAG,
  OFF_TRACK_MAX_SPEED_MPH,
  OFF_TRACK_MAX_SPEED_UNITS,
  RIVAL_PROFILES,
  ROAD_HALF_WIDTH,
  SHOULDER_WIDTH,
  TRACKS,
  WEAPONS,
  INITIAL_CASH,
  CASH_PICKUP_VALUE,
  RIVAL_KO_BOUNTY,
  POLICE_KO_BOUNTY,
  STUNT_JUMP_BONUS,
  getComponentUpgradeCost,
  getTierUpgradeCost,
} from './config';
import {
  createBikeAndRiderMesh,
  createPickupMesh,
  createStuntRampMesh,
  createTrafficCarMesh,
  setActiveWeaponOnHolder,
} from './models';
import { RoadEnvironment } from './track';
import { SoundEngine } from './audio';
import { GpuParticleSystem } from './particles';

class ArgonRoadRashGame {
  private canvas: HTMLCanvasElement;
  private renderer!: THREE.WebGPURenderer;
  private postProcessing: THREE.PostProcessing | null = null;
  private scenePass: any = null;
  private bloomNode: any = null;
  private useBloom = false;
  private isWebGPU = false;
  private gpuAdapterName = 'GPU';
  private hasF16 = false;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private mirrorCanvas: HTMLCanvasElement;
  private mirrorCtx: CanvasRenderingContext2D;
  private sound: SoundEngine;
  private dirLight!: THREE.DirectionalLight;
  private particleSystem: GpuParticleSystem;

  // Game State
  private selectedTrackIdx = 0;
  private selectedBikeIdx = 0;
  private totalLaps = 3;
  private state: 'menu' | 'countdown' | 'racing' | 'finished' = 'menu';
  private countdownTimer = 0;
  private countdownStage: 'ready' | 'steady' | 'go' | 'done' = 'ready';
  private goBannerTimer = 0;
  private revLaunchCharge = 0;

  // 0 = Chase Cam, 1 = FPV Cockpit Cam, 2 = Wide Action Cam
  private cameraMode: 0 | 1 | 2 = 0;

  // Smoothed Camera Relative Coordinates
  private camSmoothX = 0;
  private camSmoothY = 2.65;
  private camSmoothDistZ = 6.2;
  private camSmoothLookY = 1.65;
  private camSmoothRoll = 0;

  // Performance & Graphics Settings
  private qualityPreset: 'perf' | 'balanced' | 'ultra' = 'balanced';
  private rearMirrorMode: 'normal' | 'eco' | 'off' = 'eco';
  private showFps = true;
  private fpsDetailed = false;
  private frameCount = 0;
  private fpsFrames = 0;
  private lastFpsUpdate = performance.now();

  // Scratch objects to avoid GC pressure
  private staticProj = new THREE.Vector3();
  private lastRivalHudKey = '';
  private policePursuitAnnounced = false;
  private wasManualNitroActive = false;

  // Garage Upgrades
  private upgrades: GarageUpgrades = {
    tier: 1,
    engineLevel: 1,
    nitroLevel: 1,
    armorLevel: 1,
    meleeLevel: 1,
  };

  // Track & Entities
  private trackSpec: TrackSpec = TRACKS[0];
  private bikeSpec: BikeSpec = BIKES[0];
  private roadEnv!: RoadEnvironment;
  private player!: RacerEntity;
  private rivals: RacerEntity[] = [];
  private policeUnit: RacerEntity | null = null;
  private traffic: TrafficVehicle[] = [];
  private pickups: PickupItem[] = [];
  private stuntRamps: StuntRamp[] = [];

  // Stats & Scoring
  private cash = INITIAL_CASH;
  private raceCashEarned = 0;
  private racePursePrize = 0;
  private raceBounties = 0;
  private racePickupsStunts = 0;
  private knockdowns = 0;
  private peakSpeedMph = 0;
  private sirenTimer = 0;
  private screenShake = 0;

  // Lap Timing & Standings Telemetry
  private raceElapsed = 0;
  private racerLapRecords: Map<string, RacerLapRecord> = new Map();
  private lapLeaders: LapLeaderInfo[] = [];
  private fastestLapRecord: { racerName: string; time: number; lap: number; isPlayer: boolean } | null = null;
  private activeResultView: 'player' | 'grid' = 'player';

  // Input Map
  private keys: Record<string, boolean> = {};
  private lastTime = performance.now();

  // Radar & World Labels
  private radarCanvas: HTMLCanvasElement;
  private radarCtx: CanvasRenderingContext2D;
  private worldLabelsContainer: HTMLElement;
  private labelElements: Map<string, HTMLElement> = new Map();

  // Comprehensive DOM Cache
  private dom!: {
    hud: HTMLElement;
    menuOverlay: HTMLElement;
    resultOverlay: HTMLElement;
    hudPos: HTMLElement;
    hudLap: HTMLElement | null;
    hudCash: HTMLElement;
    hudKos: HTMLElement;
    hudTopSpeed: HTMLElement;
    hudProgressFill: HTMLElement;
    hudDistance: HTMLElement;
    hudPlayerHp: HTMLElement;
    hudPlayerHpText: HTMLElement;
    hudBikeHp: HTMLElement;
    hudBikeHpText: HTMLElement;
    hudWeaponIcon: HTMLElement;
    hudWeaponName: HTMLElement;
    hudWeaponHint: HTMLElement | null;
    hudSpeed: HTMLElement;
    hudGear: HTMLElement;
    hudRpm: HTMLElement;
    hudNitro: HTMLElement;
    hudNitroText: HTMLElement;
    hudNitroLabel: HTMLElement | null;
    speedLines: HTMLElement;
    rivalName: HTMLElement;
    rivalWeapon: HTMLElement;
    rivalHp: HTMLElement;
    rivalDist: HTMLElement;
    statusBadge: HTMLElement;
    policeBanner: HTMLElement;
    policeSirenOverlay: HTMLElement;
    damageFlash: HTMLElement;
    combatFeed: HTMLElement;
    comboCallout: HTMLElement;
    rearMirrorFrame: HTMLElement | null;
    hudTrackName: HTMLElement;

    // Starting Grid Countdown DOM
    countdownOverlay: HTMLElement | null;
    countdownText: HTMLElement | null;
    countdownSub: HTMLElement | null;
    lightRed: HTMLElement | null;
    lightAmber: HTMLElement | null;
    lightGreen: HTMLElement | null;

    // Menu & Showroom DOM
    menuCash: HTMLElement;
    upgEngineLvl: HTMLElement;
    upgNitroLvl: HTMLElement;
    upgArmorLvl: HTMLElement;
    upgMeleeLvl: HTMLElement;
    summaryBikeName: HTMLElement;
    summarySpeedFill: HTMLElement;
    summarySpeedVal: HTMLElement;
    summaryAccelFill: HTMLElement;
    summaryAccelVal: HTMLElement;
    summaryHandlingFill: HTMLElement;
    summaryHandlingVal: HTMLElement;
    summaryArmorFill: HTMLElement;
    summaryArmorVal: HTMLElement;
    qualityBadge: HTMLElement;
    menuEngineBadge: HTMLElement;
    menuAudioToggle: HTMLElement;

    // Tier Advancement & Results DOM
    tierAdvancementCard: HTMLElement | null;
    currentTierBadge: HTMLElement | null;
    tierProgressText: HTMLElement | null;
    tierCardTitle: HTMLElement | null;
    tierCardDesc: HTMLElement | null;
    tierProgressFill: HTMLElement | null;
    tierUpgradeBtn: HTMLElement | null;
    displayTierNum: HTMLElement | null;
    tierMinLvl: HTMLElement | null;
    tierMaxLvl: HTMLElement | null;
    resRaceCash: HTMLElement | null;
    resBreakdown: HTMLElement | null;

    // Performance HUD DOM
    perfHud: HTMLElement;
    perfFps: HTMLElement;
    perfMs: HTMLElement;
    perfEngineBadge: HTMLElement;
    perfDetails: HTMLElement;
    perfBackend: HTMLElement;
    perfPrecision: HTMLElement;
    perfCalls: HTMLElement;
    perfTris: HTMLElement;
    perfGeos: HTMLElement;
    perfTex: HTMLElement;
    camToggleBtn: HTMLElement | null;
    toggleFpsBtn: HTMLElement;
    toggleBloomBtn: HTMLElement;
    toggleMirrorBtn: HTMLElement;
    toggleBackendBtn: HTMLElement;

    // Post-Race Telemetry & Views
    resLeadersBar: HTMLElement | null;
    resPlayerView: HTMLElement | null;
    resGridView: HTMLElement | null;
    playerLapsGrid: HTMLElement | null;
    raceStandingsThead: HTMLElement | null;
    raceStandingsTbody: HTMLElement | null;
    viewGridBtn: HTMLElement | null;
    backSummaryBtn: HTMLElement | null;
    gridRaceAgainBtn: HTMLElement | null;
    gridBackMenuBtn: HTMLElement | null;
  };

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.radarCanvas = document.getElementById('radar-canvas') as HTMLCanvasElement;
    this.radarCtx = this.radarCanvas.getContext('2d')!;
    this.mirrorCanvas = document.getElementById('mirror-canvas') as HTMLCanvasElement;
    this.mirrorCtx = this.mirrorCanvas.getContext('2d')!;
    this.worldLabelsContainer = document.getElementById('world-labels')!;

    this.cacheDOMElements();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.45,
      1100
    );
    this.sound = new SoundEngine();
    this.particleSystem = new GpuParticleSystem();

    this.initEngine().then(() => {
      this.setupMenusAndListeners();
      this.buildPreviewScene();
      requestAnimationFrame((t) => this.loop(t));
    });
  }

  private cacheDOMElements(): void {
    const get = (id: string) => document.getElementById(id)!;
    this.dom = {
      hud: get('hud'),
      menuOverlay: get('menu-overlay'),
      resultOverlay: get('result-overlay'),
      hudPos: get('hud-pos'),
      hudLap: document.getElementById('hud-lap'),
      hudCash: get('hud-cash'),
      hudKos: get('hud-kos'),
      hudTopSpeed: get('hud-top-speed'),
      hudProgressFill: get('hud-progress-fill'),
      hudDistance: get('hud-distance'),
      hudPlayerHp: get('hud-player-hp'),
      hudPlayerHpText: get('hud-player-hp-text'),
      hudBikeHp: get('hud-bike-hp'),
      hudBikeHpText: get('hud-bike-hp-text'),
      hudWeaponIcon: get('hud-weapon-icon'),
      hudWeaponName: get('hud-weapon-name'),
      hudWeaponHint: document.getElementById('hud-weapon-hint'),
      hudSpeed: get('hud-speed'),
      hudGear: get('hud-gear'),
      hudRpm: get('hud-rpm'),
      hudNitro: get('hud-nitro'),
      hudNitroText: get('hud-nitro-text'),
      hudNitroLabel: document.getElementById('hud-nitro-label'),
      speedLines: get('speed-lines'),
      rivalName: get('hud-rival-name'),
      rivalWeapon: get('hud-rival-weapon'),
      rivalHp: get('hud-rival-hp'),
      rivalDist: get('hud-rival-dist'),
      statusBadge: get('hud-status-badge'),
      policeBanner: get('police-banner'),
      policeSirenOverlay: get('police-siren-overlay'),
      damageFlash: get('damage-flash'),
      combatFeed: get('combat-feed'),
      comboCallout: get('combo-callout'),
      rearMirrorFrame: document.getElementById('rear-mirror-frame'),
      hudTrackName: get('hud-track-name'),

      // Countdown
      countdownOverlay: document.getElementById('countdown-overlay'),
      countdownText: document.getElementById('countdown-text'),
      countdownSub: document.getElementById('countdown-sub'),
      lightRed: document.getElementById('light-red'),
      lightAmber: document.getElementById('light-amber'),
      lightGreen: document.getElementById('light-green'),

      // Menu
      menuCash: get('menu-cash'),
      upgEngineLvl: get('upg-engine-lvl'),
      upgNitroLvl: get('upg-nitro-lvl'),
      upgArmorLvl: get('upg-armor-lvl'),
      upgMeleeLvl: get('upg-melee-lvl'),
      summaryBikeName: get('summary-bike-name'),
      summarySpeedFill: get('summary-speed-fill'),
      summarySpeedVal: get('summary-speed-val'),
      summaryAccelFill: get('summary-accel-fill'),
      summaryAccelVal: get('summary-accel-val'),
      summaryHandlingFill: get('summary-handling-fill'),
      summaryHandlingVal: get('summary-handling-val'),
      summaryArmorFill: get('summary-armor-fill'),
      summaryArmorVal: get('summary-armor-val'),
      qualityBadge: get('menu-quality-badge'),
      menuEngineBadge: get('menu-engine-badge'),
      menuAudioToggle: get('menu-audio-toggle'),

      // Tier Advancement & Results
      tierAdvancementCard: document.getElementById('tier-advancement-card'),
      currentTierBadge: document.getElementById('current-tier-badge'),
      tierProgressText: document.getElementById('tier-progress-text'),
      tierCardTitle: document.getElementById('tier-card-title'),
      tierCardDesc: document.getElementById('tier-card-desc'),
      tierProgressFill: document.getElementById('tier-progress-fill'),
      tierUpgradeBtn: document.getElementById('tier-upgrade-btn'),
      displayTierNum: document.getElementById('display-tier-num'),
      tierMinLvl: document.getElementById('tier-min-lvl'),
      tierMaxLvl: document.getElementById('tier-max-lvl'),
      resRaceCash: document.getElementById('res-race-cash'),
      resBreakdown: document.getElementById('res-breakdown'),

      // Performance HUD
      perfHud: get('perf-hud'),
      perfFps: get('perf-fps'),
      perfMs: get('perf-ms'),
      perfEngineBadge: get('perf-engine-badge'),
      perfDetails: get('perf-details'),
      perfBackend: get('perf-backend'),
      perfPrecision: get('perf-precision'),
      perfCalls: get('perf-calls'),
      perfTris: get('perf-tris'),
      perfGeos: get('perf-geos'),
      perfTex: get('perf-tex'),
      camToggleBtn: document.getElementById('cam-toggle-btn'),
      toggleFpsBtn: get('toggle-fps-btn'),
      toggleBloomBtn: get('toggle-bloom-btn'),
      toggleMirrorBtn: get('toggle-mirror-btn'),
      toggleBackendBtn: get('toggle-backend-btn'),

      // Post-Race Telemetry & Views
      resLeadersBar: document.getElementById('res-leaders-bar'),
      resPlayerView: document.getElementById('res-player-view'),
      resGridView: document.getElementById('res-grid-view'),
      playerLapsGrid: document.getElementById('player-laps-grid'),
      raceStandingsThead: document.getElementById('race-standings-thead'),
      raceStandingsTbody: document.getElementById('race-standings-tbody'),
      viewGridBtn: document.getElementById('view-grid-btn'),
      backSummaryBtn: document.getElementById('back-summary-btn'),
      gridRaceAgainBtn: document.getElementById('grid-race-again-btn'),
      gridBackMenuBtn: document.getElementById('grid-back-menu-btn'),
    };
  }

  private async initEngine(forceWebGL = false): Promise<void> {
    let useWebGPU = !forceWebGL;
    this.hasF16 = false;
    this.gpuAdapterName = forceWebGL ? 'WebGL2 Pipeline' : 'Apple Silicon / Metal GPU';

    if (useWebGPU && typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (adapter) {
          this.hasF16 = adapter.features.has('shader-f16');
          const info = await (adapter as any).requestAdapterInfo?.();
          this.gpuAdapterName =
            info?.description || info?.vendor || (adapter as any).name || 'Apple Silicon / Metal GPU';
          useWebGPU = true;
        } else {
          useWebGPU = false;
        }
      } catch (err) {
        console.warn('WebGPU adapter query failed, falling back to WebGL2:', err);
        useWebGPU = false;
      }
    } else {
      useWebGPU = false;
    }

    if (this.renderer) {
      this.renderer.dispose();
    }

    try {
      this.renderer = new THREE.WebGPURenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: 'high-performance',
        forceWebGL: !useWebGPU,
      });
      await this.renderer.init();
      this.isWebGPU = (this.renderer.backend as any)?.isWebGPUBackend === true;
    } catch (e) {
      console.warn('WebGPURenderer init failed, falling back to WebGL backend:', e);
      this.renderer = new THREE.WebGPURenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: 'high-performance',
        forceWebGL: true,
      });
      await this.renderer.init();
      this.isWebGPU = false;
    }

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.setupPostProcessing();
    this.updateEngineBadgeUI();
  }

  private setupPostProcessing(): void {
    this.postProcessing = new THREE.PostProcessing(this.renderer);
    this.scenePass = pass(this.scene, this.camera);
    const sceneColor = this.scenePass.getTextureNode();

    this.bloomNode = bloom(sceneColor, 0.22, 0.25, 0.92);
    this.postProcessing.outputNode = sceneColor.add(this.bloomNode);
  }

  private updateEngineBadgeUI(): void {
    const isWebGPU = this.isWebGPU;
    const badgeText = isWebGPU ? '⚡ WEBGPU' : '🎮 WEBGL2';
    const menuBadgeText = isWebGPU ? '⚡ WEBGPU (METAL)' : '🎮 WEBGL2 MODE';
    const toggleBtnText = isWebGPU ? '⚡ WEBGPU (METAL)' : '🎮 WEBGL2 MODE';

    if (this.dom.perfEngineBadge) {
      this.dom.perfEngineBadge.textContent = badgeText;
      this.dom.perfEngineBadge.classList.toggle('webgl', !isWebGPU);
    }
    if (this.dom.menuEngineBadge) {
      this.dom.menuEngineBadge.textContent = menuBadgeText;
      this.dom.menuEngineBadge.classList.toggle('webgl', !isWebGPU);
      this.dom.menuEngineBadge.title = `GPU: ${this.gpuAdapterName} | f16: ${this.hasF16 ? 'Supported' : 'Disabled'}`;
    }
    if (this.dom.toggleBackendBtn) {
      this.dom.toggleBackendBtn.textContent = toggleBtnText;
      this.dom.toggleBackendBtn.classList.toggle('active', isWebGPU);
    }
    if (this.dom.perfBackend) {
      this.dom.perfBackend.textContent = isWebGPU ? 'WebGPU (Metal/Vulkan)' : 'WebGL2 Backend';
    }
    if (this.dom.perfPrecision) {
      this.dom.perfPrecision.textContent = this.hasF16 ? 'f16 Half-Float (Metal)' : 'f32 High Precision';
    }
  }

  private async toggleEngineBackend(): Promise<void> {
    const nextForceWebGL = this.isWebGPU;
    this.showCallout(nextForceWebGL ? 'SWITCHING TO WEBGL2...' : 'SWITCHING TO WEBGPU (METAL)...');
    await this.initEngine(nextForceWebGL);
    if (this.state === 'racing' || this.state === 'countdown') {
      this.scene.add(this.particleSystem.group);
    }
    this.showCallout(this.isWebGPU ? '⚡ WEBGPU ACTIVE' : '🎮 WEBGL2 ACTIVE');
  }

  private cycleCameraMode(forceFpv = false): void {
    if (forceFpv) {
      this.cameraMode = this.cameraMode === 1 ? 0 : 1;
    } else {
      this.cameraMode = ((this.cameraMode + 1) % 3) as 0 | 1 | 2;
    }

    const camNames = ['CHASE CAM', 'FPV COCKPIT CAM', 'WIDE ACTION CAM'];
    const btnLabels = ['🎥 CHASE [C]', '🎥 FPV CAM [C]', '🎥 WIDE [C]'];

    if (this.dom.camToggleBtn) {
      this.dom.camToggleBtn.textContent = btnLabels[this.cameraMode];
    }

    if (this.player) {
      this.player.riderBodyGroup.visible = this.cameraMode !== 1 || this.state === 'menu';
    }

    this.showCallout(camNames[this.cameraMode]);
  }

  private applyQualityPreset(preset: 'perf' | 'balanced' | 'ultra'): void {
    this.qualityPreset = preset;
    const btns = document.querySelectorAll('.preset-btn');
    btns.forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.preset === preset);
    });

    if (preset === 'perf') {
      this.renderer.setPixelRatio(1.0);
      this.useBloom = false;
      this.rearMirrorMode = 'off';
      this.dom.qualityBadge.textContent = '🚀 MAX FPS';
      this.dom.toggleBloomBtn.textContent = 'OFF (CRISP MSAA)';
      this.dom.toggleBloomBtn.classList.remove('active');
      this.dom.toggleMirrorBtn.textContent = 'OFF';
      this.dom.toggleMirrorBtn.classList.remove('active');
    } else if (preset === 'balanced') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      this.useBloom = false;
      this.rearMirrorMode = 'eco';
      this.dom.qualityBadge.textContent = '⚡ BALANCED';
      this.dom.toggleBloomBtn.textContent = 'OFF (CRISP MSAA)';
      this.dom.toggleBloomBtn.classList.remove('active');
      this.dom.toggleMirrorBtn.textContent = 'ECO (30 FPS)';
      this.dom.toggleMirrorBtn.classList.add('active');
    } else {
      this.renderer.setPixelRatio(window.devicePixelRatio);
      this.useBloom = false;
      this.rearMirrorMode = 'normal';
      this.dom.qualityBadge.textContent = '💎 ULTRA WEBGPU';
      this.dom.toggleBloomBtn.textContent = 'OFF (CRISP MSAA)';
      this.dom.toggleBloomBtn.classList.remove('active');
      this.dom.toggleMirrorBtn.textContent = 'NORMAL (60 FPS)';
      this.dom.toggleMirrorBtn.classList.add('active');
    }

    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private setupMenusAndListeners(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    window.addEventListener('keydown', (e) => {
      const code = e.code;
      this.keys[code] = true;

      if (code === 'KeyP') {
        this.toggleFpsStats();
      }

      if (code === 'KeyG') {
        this.toggleEngineBackend();
      }

      if (this.state === 'finished') {
        if (code === 'Tab' || code === 'KeyT') {
          e.preventDefault();
          this.toggleResultView();
          return;
        }
        if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') {
          e.preventDefault();
          this.sound.init();
          this.startRace();
          return;
        }
        if (code === 'Escape') {
          e.preventDefault();
          this.goToGarage();
          return;
        }
      }

      if (this.state === 'menu' && (code === 'Enter' || code === 'NumpadEnter')) {
        this.sound.init();
        this.startRace();
        return;
      }

      if (this.state === 'racing' || this.state === 'countdown') {
        if (code === 'KeyC') {
          this.cycleCameraMode(false);
        } else if (code === 'KeyV') {
          this.cycleCameraMode(true);
        } else if (code === 'KeyB') {
          this.useBloom = !this.useBloom;
          if (this.bloomNode) this.bloomNode.strength.value = this.useBloom ? 0.22 : 0.0;
          this.dom.toggleBloomBtn.textContent = this.useBloom ? 'ACTIVE' : 'OFF (CRISP MSAA)';
          this.dom.toggleBloomBtn.classList.toggle('active', this.useBloom);
          this.showCallout(this.useBloom ? 'BLOOM ON' : 'CRISP 4X MSAA ON');
        } else if (code === 'KeyM') {
          const muted = this.sound.toggleMute();
          this.updateAudioButtonUI(muted);
          this.showCallout(muted ? 'AUDIO MUTED' : 'AUDIO ACTIVE');
        }
      }

      if (this.state === 'racing') {
        if (code === 'KeyZ' || code === 'KeyQ') {
          this.triggerProximityPlayerAttack('left', false);
        } else if (code === 'KeyX' || code === 'KeyE') {
          this.triggerProximityPlayerAttack('right', false);
        } else if (code === 'KeyF') {
          this.triggerProximityPlayerAttack(undefined, false);
        } else if (code === 'Space') {
          e.preventDefault();
          this.triggerProximityPlayerAttack(undefined, true);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    this.dom.camToggleBtn?.addEventListener('click', () => {
      this.sound.playUiSelect();
      this.cycleCameraMode(false);
    });

    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('mouseenter', () => this.sound.playUiHover());
      tab.addEventListener('click', () => {
        this.sound.playUiSelect();
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const targetTab = (tab as HTMLElement).dataset.tab;
        document.querySelectorAll('.tab-pane').forEach((pane) => {
          pane.classList.add('hidden');
        });
        document.getElementById(`tab-${targetTab}`)?.classList.remove('hidden');
      });
    });

    document.getElementById('open-garage-tab-btn')?.addEventListener('click', () => {
      this.sound.playUiSelect();
      const garageTab = document.querySelector('.nav-tab[data-tab="garage"]') as HTMLElement;
      garageTab?.click();
    });

    this.dom.menuAudioToggle.addEventListener('click', () => {
      this.sound.init();
      const muted = this.sound.toggleMute();
      this.updateAudioButtonUI(muted);
      if (!muted) this.sound.playUiSelect();
    });

    const lapBtns = document.querySelectorAll('#lap-options .lap-btn');
    lapBtns.forEach((btn) => {
      btn.addEventListener('mouseenter', () => this.sound.playUiHover());
      btn.addEventListener('click', () => {
        this.sound.playUiSelect();
        lapBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.totalLaps = Number((btn as HTMLElement).dataset.laps || 3);
      });
    });

    const trackCards = document.querySelectorAll('#track-options .track-card');
    trackCards.forEach((card) => {
      card.addEventListener('mouseenter', () => this.sound.playUiHover());
      card.addEventListener('click', () => {
        this.sound.playUiSelect();
        trackCards.forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        this.selectedTrackIdx = Number((card as HTMLElement).dataset.track || 0);
        this.buildPreviewScene();
      });
    });

    const bikeCards = document.querySelectorAll('#bike-options .bike-card');
    bikeCards.forEach((card) => {
      card.addEventListener('mouseenter', () => this.sound.playUiHover());
      card.addEventListener('click', () => {
        this.sound.init();
        this.sound.playEngineRev();
        bikeCards.forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        this.selectedBikeIdx = Number((card as HTMLElement).dataset.bike || 0);
        this.buildPreviewScene();
      });
    });

    const upgBtns = document.querySelectorAll('.upgrade-btn');
    upgBtns.forEach((btn) => {
      btn.addEventListener('mouseenter', () => this.sound.playUiHover());
      btn.addEventListener('click', () => {
        const type = (btn as HTMLElement).dataset.upg;
        let currentLvl = 1;
        if (type === 'engine') currentLvl = this.upgrades.engineLevel;
        if (type === 'nitro') currentLvl = this.upgrades.nitroLevel;
        if (type === 'armor') currentLvl = this.upgrades.armorLevel;
        if (type === 'melee') currentLvl = this.upgrades.meleeLevel;

        const tierCap = this.upgrades.tier * 5;
        if (currentLvl >= tierCap) {
          this.sound.playHit(false);
          this.showCallout(`MAXED FOR TIER ${this.upgrades.tier}! OVERHAUL REQUIRED`);
          return;
        }

        const cost = getComponentUpgradeCost(currentLvl);
        if (this.cash < cost) {
          this.sound.playHit(false);
          return;
        }
        this.cash -= cost;
        if (type === 'engine') this.upgrades.engineLevel++;
        if (type === 'nitro') this.upgrades.nitroLevel++;
        if (type === 'armor') this.upgrades.armorLevel++;
        if (type === 'melee') this.upgrades.meleeLevel++;
        this.sound.playPickup();
        this.syncGarageMenuUI();
      });
    });

    this.dom.tierUpgradeBtn?.addEventListener('click', () => {
      const tierCap = this.upgrades.tier * 5;
      const allMaxed =
        this.upgrades.engineLevel >= tierCap &&
        this.upgrades.nitroLevel >= tierCap &&
        this.upgrades.armorLevel >= tierCap &&
        this.upgrades.meleeLevel >= tierCap;

      if (!allMaxed) {
        this.sound.playHit(false);
        this.showCallout('MAX OUT ALL 4 COMPONENTS TO UNLOCK NEXT TIER!');
        return;
      }

      const tierCost = getTierUpgradeCost(this.upgrades.tier);
      if (this.cash < tierCost) {
        this.sound.playHit(false);
        this.showCallout(`NEED $${tierCost.toLocaleString()} FOR TIER OVERHAUL!`);
        return;
      }

      this.cash -= tierCost;
      this.upgrades.tier++;
      this.sound.playPickup();
      confetti({ particleCount: 130, spread: 85, origin: { y: 0.55 } });
      this.showCallout(`⚡ TIER ${this.upgrades.tier} CHASSIS OVERHAUL UNLOCKED!`);
      this.syncGarageMenuUI();
    });

    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach((btn) => {
      btn.addEventListener('mouseenter', () => this.sound.playUiHover());
      btn.addEventListener('click', () => {
        this.sound.playUiSelect();
        const p = (btn as HTMLElement).dataset.preset as 'perf' | 'balanced' | 'ultra';
        this.applyQualityPreset(p);
      });
    });

    this.dom.toggleBackendBtn?.addEventListener('click', () => {
      this.sound.playUiSelect();
      this.toggleEngineBackend();
    });

    this.dom.toggleFpsBtn.addEventListener('click', () => {
      this.sound.playUiSelect();
      this.toggleFpsStats();
    });

    document.getElementById('perf-toggle-btn')?.addEventListener('click', () => {
      this.sound.playUiSelect();
      this.toggleFpsStats();
    });

    this.dom.toggleBloomBtn.addEventListener('click', () => {
      this.sound.playUiSelect();
      this.useBloom = !this.useBloom;
      if (this.bloomNode) this.bloomNode.strength.value = this.useBloom ? 0.22 : 0.0;
      this.dom.toggleBloomBtn.textContent = this.useBloom ? 'ACTIVE' : 'OFF (CRISP MSAA)';
      this.dom.toggleBloomBtn.classList.toggle('active', this.useBloom);
    });

    this.dom.toggleMirrorBtn.addEventListener('click', () => {
      this.sound.playUiSelect();
      if (this.rearMirrorMode === 'eco') {
        this.rearMirrorMode = 'normal';
        this.dom.toggleMirrorBtn.textContent = 'NORMAL (60 FPS)';
      } else if (this.rearMirrorMode === 'normal') {
        this.rearMirrorMode = 'off';
        this.dom.toggleMirrorBtn.textContent = 'OFF';
        this.dom.toggleMirrorBtn.classList.remove('active');
      } else {
        this.rearMirrorMode = 'eco';
        this.dom.toggleMirrorBtn.textContent = 'ECO (30 FPS)';
        this.dom.toggleMirrorBtn.classList.add('active');
      }
    });

    this.dom.hudTrackName.textContent = this.trackSpec.name;
    document.getElementById('start-race-btn')?.addEventListener('click', () => {
      this.sound.init();
      this.startRace();
    });

    document.getElementById('race-again-btn')?.addEventListener('click', () => {
      this.sound.init();
      this.startRace();
    });

    document.getElementById('back-menu-btn')?.addEventListener('click', () => {
      this.goToGarage();
    });

    this.dom.viewGridBtn?.addEventListener('click', () => {
      this.toggleResultView('grid');
    });

    this.dom.backSummaryBtn?.addEventListener('click', () => {
      this.toggleResultView('player');
    });

    this.dom.gridRaceAgainBtn?.addEventListener('click', () => {
      this.sound.init();
      this.startRace();
    });

    this.dom.gridBackMenuBtn?.addEventListener('click', () => {
      this.goToGarage();
    });
  }

  private goToGarage(): void {
    this.state = 'menu';
    this.sound.stopEngine();
    this.clearWorldLabels();
    this.dom.countdownOverlay?.classList.add('hidden');
    this.dom.resultOverlay.classList.add('hidden');
    this.dom.hud.classList.add('hidden');
    this.dom.menuOverlay.classList.remove('hidden');
    this.syncGarageMenuUI();
    this.buildPreviewScene();
  }

  private toggleResultView(forceView?: 'player' | 'grid'): void {
    if (forceView) {
      this.activeResultView = forceView;
    } else {
      this.activeResultView = this.activeResultView === 'player' ? 'grid' : 'player';
    }
    this.sound.playUiSelect();
    if (this.activeResultView === 'grid') {
      this.dom.resPlayerView?.classList.add('hidden');
      this.dom.resGridView?.classList.remove('hidden');
    } else {
      this.dom.resGridView?.classList.add('hidden');
      this.dom.resPlayerView?.classList.remove('hidden');
    }
  }

  private formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '--:--.---';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const secStr = secs < 10 ? '0' + secs.toFixed(3) : secs.toFixed(3);
    return mins > 0 ? `${mins}:${secStr}` : `0:${secStr}`;
  }

  private formatGap(gapSeconds: number, isWinner: boolean, isDNF: boolean): string {
    if (isDNF) return 'DNF';
    if (isWinner) return 'WINNER';
    if (!isFinite(gapSeconds) || gapSeconds < 0) return '--';
    return `+${gapSeconds.toFixed(3)}s`;
  }

  private checkLapCrossing(racer: RacerEntity, dt: number): void {
    const rec = this.racerLapRecords.get(racer.id);
    if (!rec || rec.finished || rec.isDNF) return;

    const targetLap = rec.lapTimes.length + 1;
    if (targetLap > this.totalLaps) return;

    const targetDist = targetLap * this.trackSpec.lengthUnits;
    if (racer.totalDistance >= targetDist && rec.prevDistance < targetDist) {
      const deltaDist = racer.totalDistance - rec.prevDistance;
      const frac =
        deltaDist > 0.0001
          ? Math.min(1.0, Math.max(0.0, (targetDist - rec.prevDistance) / deltaDist))
          : 1.0;
      const crossTime = Math.max(0, this.raceElapsed - dt + frac * dt);
      const split = Math.max(0.05, crossTime - rec.lastLapCrossingTime);

      rec.lapTimes.push(split);
      rec.lapTimestamps.push(crossTime);
      rec.lastLapCrossingTime = crossTime;
      if (split < rec.bestLap) {
        rec.bestLap = split;
      }

      // Check Lap Leader for targetLap
      if (!this.lapLeaders[targetLap - 1]) {
        this.lapLeaders[targetLap - 1] = {
          lap: targetLap,
          racerId: racer.id,
          racerName: racer.name,
          isPlayer: racer.isPlayer,
          splitTime: split,
          totalTimeAtCross: crossTime,
        };
        const leaderMsg = racer.isPlayer
          ? `🏁 YOU LEAD LAP ${targetLap}! (${this.formatTime(split)})`
          : `🏁 ${racer.name} LEADS LAP ${targetLap}! (${this.formatTime(split)})`;
        this.addCombatFeed(leaderMsg);
        this.showCallout(leaderMsg);
      }

      // Check Fastest Lap of the race
      if (!this.fastestLapRecord || split < this.fastestLapRecord.time) {
        this.fastestLapRecord = {
          racerName: racer.name,
          time: split,
          lap: targetLap,
          isPlayer: racer.isPlayer,
        };
        if (racer.isPlayer) {
          this.addCombatFeed(`🟣 YOU SET FASTEST LAP! (${this.formatTime(split)})`);
        }
      }

      // If completed final lap
      if (targetLap >= this.totalLaps) {
        rec.finished = true;
        rec.totalTime = crossTime;
      }
    }

    rec.prevDistance = racer.totalDistance;
  }

  private renderLapLeadersBar(): void {
    const container = this.dom.resLeadersBar;
    if (!container) return;
    container.innerHTML = '';

    // Render Lap Leaders for each lap
    for (let lap = 1; lap <= this.totalLaps; lap++) {
      const leader = this.lapLeaders[lap - 1];
      const isWinner = lap === this.totalLaps;
      const card = document.createElement('div');
      card.className = 'res-leader-card' + (isWinner ? ' winner' : '');
      const label = isWinner ? '🏆 RACE WINNER' : `🏁 LAP ${lap} LEADER`;
      const name = leader ? leader.racerName + (leader.isPlayer ? ' (YOU)' : '') : 'N/A';
      const time = leader ? this.formatTime(leader.splitTime) : '--:--.---';
      const isPlayerClass = leader?.isPlayer ? ' player-name' : '';

      card.innerHTML = `
        <div class="res-leader-label">${label}</div>
        <div class="res-leader-name${isPlayerClass}">${name}</div>
        <div class="res-leader-time">${time}</div>
      `;
      container.appendChild(card);
    }

    // Render Fastest Lap of the Race Card
    if (this.fastestLapRecord) {
      const card = document.createElement('div');
      card.className = 'res-leader-card fastest';
      const fl = this.fastestLapRecord;
      const name = fl.racerName + (fl.isPlayer ? ' (YOU)' : '');
      const isPlayerClass = fl.isPlayer ? ' player-name' : '';
      card.innerHTML = `
        <div class="res-leader-label">🟣 FASTEST LAP</div>
        <div class="res-leader-name${isPlayerClass}">${name}</div>
        <div class="res-leader-time">${this.formatTime(fl.time)} <span style="font-size:10px;color:rgba(255,255,255,0.6)">(LAP ${fl.lap})</span></div>
      `;
      container.appendChild(card);
    }
  }

  private renderPlayerLapBreakdown(pRec: RacerLapRecord, winnerRec: RacerLapRecord): void {
    const grid = this.dom.playerLapsGrid;
    if (!grid) return;
    grid.innerHTML = '';

    for (let lap = 1; lap <= this.totalLaps; lap++) {
      const split = pRec.lapTimes[lap - 1];
      const leader = this.lapLeaders[lap - 1];
      const ledLap = leader && leader.racerId === this.player.id;
      const isFastestOverall =
        this.fastestLapRecord?.isPlayer && this.fastestLapRecord?.lap === lap;
      const isBestPlayerLap = split !== undefined && split === pRec.bestLap;

      const box = document.createElement('div');
      box.className =
        'lap-split-box' +
        (isFastestOverall ? ' fastest-lap-overall' : isBestPlayerLap ? ' best-lap' : '') +
        (ledLap ? ' leader-lap' : '');

      let subText = '';
      if (ledLap) subText = '<span class="lap-split-sub crown">👑 LED LAP</span>';
      else if (isFastestOverall) subText = '<span class="lap-split-sub purple">🟣 FASTEST IN RACE</span>';
      else if (isBestPlayerLap) subText = '<span class="lap-split-sub">⭐ YOUR BEST LAP</span>';

      box.innerHTML = `
        <div class="lap-split-label">
          <span>LAP ${lap}</span>
          ${ledLap ? '👑' : ''}
        </div>
        <div class="lap-split-time">${split !== undefined ? this.formatTime(split) : pRec.isDNF ? 'DNF' : '--:--.---'}</div>
        ${subText}
      `;
      grid.appendChild(box);
    }

    // Best Lap Box
    const bestBox = document.createElement('div');
    const isFlHolder = pRec.isFastestLapHolder;
    bestBox.className = 'lap-split-box' + (isFlHolder ? ' fastest-lap-overall' : ' best-lap');
    bestBox.innerHTML = `
      <div class="lap-split-label">
        <span>BEST LAP</span>
        ${isFlHolder ? '🟣' : '⭐'}
      </div>
      <div class="lap-split-time">${isFinite(pRec.bestLap) ? this.formatTime(pRec.bestLap) : '--:--.---'}</div>
      <div class="lap-split-sub${isFlHolder ? ' purple' : ''}">${isFlHolder ? '🟣 RACE FASTEST' : 'PERSONAL BEST'}</div>
    `;
    grid.appendChild(bestBox);

    // Total Time & Gap Box
    const totalBox = document.createElement('div');
    totalBox.className = 'lap-split-box';
    const isWinner = pRec.finishPosition === 1;
    const gap = isWinner ? 0 : Math.max(0, pRec.totalTime - winnerRec.totalTime);
    totalBox.innerHTML = `
      <div class="lap-split-label">
        <span>TOTAL TIME</span>
        <span>${pRec.isDNF ? 'DNF' : isWinner ? '🏆 P1' : `P${pRec.finishPosition}`}</span>
      </div>
      <div class="lap-split-time">${pRec.isDNF ? 'DNF' : this.formatTime(pRec.totalTime)}</div>
      <div class="lap-split-sub">${pRec.isDNF ? 'DID NOT FINISH' : this.formatGap(gap, isWinner, false)}</div>
    `;
    grid.appendChild(totalBox);
  }

  private renderStandingsTable(records: RacerLapRecord[]): void {
    const thead = this.dom.raceStandingsThead;
    const tbody = this.dom.raceStandingsTbody;
    if (!thead || !tbody) return;

    // Header
    let thHtml = `
      <tr>
        <th style="width:50px;">POS</th>
        <th>RACER</th>
        <th>TOTAL TIME</th>
        <th>GAP</th>
    `;
    for (let lap = 1; lap <= this.totalLaps; lap++) {
      thHtml += `<th>LAP ${lap}</th>`;
    }
    thHtml += `<th>BEST LAP</th></tr>`;
    thead.innerHTML = thHtml;

    // Rows
    const winnerTime = records[0]?.totalTime || 0;
    let tbodyHtml = '';

    for (const rec of records) {
      const isPlayer = rec.isPlayer;
      const isWinner = rec.finishPosition === 1;
      const gap = rec.isDNF ? 0 : Math.max(0, rec.totalTime - winnerTime);
      const posClass = rec.isDNF
        ? 'dnf'
        : rec.finishPosition === 1
        ? 'gold'
        : rec.finishPosition === 2
        ? 'silver'
        : rec.finishPosition === 3
        ? 'bronze'
        : '';

      const posLabel = rec.isDNF
        ? 'DNF'
        : rec.finishPosition === 1
        ? '1st'
        : rec.finishPosition === 2
        ? '2nd'
        : rec.finishPosition === 3
        ? '3rd'
        : `${rec.finishPosition}th`;

      const hexColor = '#' + rec.color.toString(16).padStart(6, '0');

      tbodyHtml += `<tr class="${isPlayer ? 'player-row' : ''}">`;
      tbodyHtml += `<td><span class="pos-pill ${posClass}">${posLabel}</span></td>`;
      tbodyHtml += `
        <td>
          <div class="racer-identity">
            <span class="racer-color-dot" style="background:${hexColor};color:${hexColor};"></span>
            <span class="racer-name-text">${rec.name}</span>
            ${isPlayer ? '<span class="player-tag">YOU</span>' : ''}
          </div>
        </td>
      `;
      tbodyHtml += `<td class="time-cell">${rec.isDNF ? 'DNF' : this.formatTime(rec.totalTime)}</td>`;
      tbodyHtml += `<td class="gap-text ${isWinner ? 'winner' : ''}">${this.formatGap(gap, isWinner, rec.isDNF)}</td>`;

      for (let lap = 1; lap <= this.totalLaps; lap++) {
        const split = rec.lapTimes[lap - 1];
        const leader = this.lapLeaders[lap - 1];
        const ledLap = leader && leader.racerId === rec.id;
        const isRaceFastestLap =
          this.fastestLapRecord &&
          this.fastestLapRecord.racerName === rec.name &&
          this.fastestLapRecord.lap === lap;

        let splitClass = 'split-text';
        let badge = '';
        if (isRaceFastestLap) {
          splitClass += ' fastest-split';
          badge = '<span class="purple-badge">🟣</span>';
        } else if (ledLap) {
          splitClass += ' leader-split';
          badge = '<span class="crown-badge">👑</span>';
        }

        tbodyHtml += `<td class="${splitClass}">${split !== undefined ? this.formatTime(split) + badge : rec.isDNF ? 'DNF' : '--:--.---'}</td>`;
      }

      const isFastestOverall = rec.isFastestLapHolder;
      tbodyHtml += `
        <td class="split-text ${isFastestOverall ? 'fastest-split' : ''}">
          ${isFinite(rec.bestLap) ? this.formatTime(rec.bestLap) : '--:--.---'}
          ${isFastestOverall ? '<span class="purple-badge">🟣</span>' : ''}
        </td>
      `;
      tbodyHtml += `</tr>`;
    }

    tbody.innerHTML = tbodyHtml;
  }

  private toggleFpsStats(): void {
    if (!this.showFps) {
      this.showFps = true;
      this.fpsDetailed = false;
      this.dom.perfHud.classList.remove('hidden');
      this.dom.perfDetails.classList.add('hidden');
      this.dom.toggleFpsBtn.textContent = 'ACTIVE';
      this.dom.toggleFpsBtn.classList.add('active');
    } else if (!this.fpsDetailed) {
      this.fpsDetailed = true;
      this.dom.perfDetails.classList.remove('hidden');
      this.dom.toggleFpsBtn.textContent = 'DETAILED';
    } else {
      this.showFps = false;
      this.fpsDetailed = false;
      this.dom.perfHud.classList.add('hidden');
      this.dom.toggleFpsBtn.textContent = 'OFF';
      this.dom.toggleFpsBtn.classList.remove('active');
    }
  }

  private updateAudioButtonUI(muted: boolean): void {
    this.dom.menuAudioToggle.textContent = muted ? '🔇 MUTED' : '🔊 AUDIO ON';
    this.dom.menuAudioToggle.style.borderColor = muted ? 'rgba(255, 42, 84, 0.5)' : '';
  }

  private syncGarageMenuUI(): void {
    const tier = this.upgrades.tier;
    const tierCap = tier * 5;
    const minLvl = (tier - 1) * 5 + 1;

    this.dom.menuCash.textContent = this.cash.toLocaleString();
    this.dom.upgEngineLvl.textContent = String(this.upgrades.engineLevel);
    this.dom.upgNitroLvl.textContent = String(this.upgrades.nitroLevel);
    this.dom.upgArmorLvl.textContent = String(this.upgrades.armorLevel);
    this.dom.upgMeleeLvl.textContent = String(this.upgrades.meleeLevel);

    if (this.dom.displayTierNum) this.dom.displayTierNum.textContent = String(tier);
    if (this.dom.tierMinLvl) this.dom.tierMinLvl.textContent = String(minLvl);
    if (this.dom.tierMaxLvl) this.dom.tierMaxLvl.textContent = String(tierCap);

    let readyCount = 0;
    if (this.upgrades.engineLevel >= tierCap) readyCount++;
    if (this.upgrades.nitroLevel >= tierCap) readyCount++;
    if (this.upgrades.armorLevel >= tierCap) readyCount++;
    if (this.upgrades.meleeLevel >= tierCap) readyCount++;

    const tierCost = getTierUpgradeCost(tier);

    if (this.dom.currentTierBadge) {
      this.dom.currentTierBadge.textContent = `TIER ${tier} CHASSIS`;
    }
    if (this.dom.tierProgressText) {
      this.dom.tierProgressText.textContent = `${readyCount}/4 COMPONENTS READY`;
    }
    if (this.dom.tierProgressFill) {
      this.dom.tierProgressFill.style.width = `${(readyCount / 4) * 100}%`;
    }

    if (this.dom.tierAdvancementCard && this.dom.tierUpgradeBtn) {
      if (readyCount === 4) {
        this.dom.tierAdvancementCard.classList.add('active-advancement');
        if (this.dom.tierCardTitle) {
          this.dom.tierCardTitle.textContent = `⚡ TIER ${tier + 1} OVERHAUL READY!`;
        }
        if (this.dom.tierCardDesc) {
          this.dom.tierCardDesc.textContent = `All 4 components maxed for Tier ${tier}! Overhaul powertrain & chassis to unlock Levels ${tierCap + 1}–${tierCap + 5}.`;
        }
        (this.dom.tierUpgradeBtn as HTMLButtonElement).disabled = false;
        this.dom.tierUpgradeBtn.classList.remove('disabled');
        this.dom.tierUpgradeBtn.textContent = `⚡ UNLOCK TIER ${tier + 1} • $${tierCost.toLocaleString()}`;
        if (this.cash < tierCost) {
          this.dom.tierUpgradeBtn.classList.add('disabled');
          this.dom.tierUpgradeBtn.style.opacity = '0.6';
        } else {
          this.dom.tierUpgradeBtn.style.opacity = '1.0';
        }
      } else {
        this.dom.tierAdvancementCard.classList.remove('active-advancement');
        if (this.dom.tierCardTitle) {
          this.dom.tierCardTitle.textContent = `TIER ${tier + 1} OVERHAUL LOCKED`;
        }
        if (this.dom.tierCardDesc) {
          this.dom.tierCardDesc.textContent = `Max out all 4 components to Level ${tierCap} to unlock the Tier ${tier + 1} high-performance overhaul (Levels ${tierCap + 1}–${tierCap + 5}).`;
        }
        (this.dom.tierUpgradeBtn as HTMLButtonElement).disabled = true;
        this.dom.tierUpgradeBtn.classList.add('disabled');
        this.dom.tierUpgradeBtn.textContent = `🔒 LOCKED • ${readyCount}/4 MAXED`;
        this.dom.tierUpgradeBtn.style.opacity = '0.5';
      }
    }

    const upgBtns = document.querySelectorAll('.upgrade-btn');
    upgBtns.forEach((btn) => {
      const type = (btn as HTMLElement).dataset.upg;
      let lvl = 1;
      if (type === 'engine') lvl = this.upgrades.engineLevel;
      if (type === 'nitro') lvl = this.upgrades.nitroLevel;
      if (type === 'armor') lvl = this.upgrades.armorLevel;
      if (type === 'melee') lvl = this.upgrades.meleeLevel;

      if (lvl >= tierCap) {
        btn.textContent = `TIER ${tier} MAX`;
        btn.classList.add('tier-maxed', 'disabled');
        (btn as HTMLElement).style.opacity = '0.65';
      } else {
        btn.classList.remove('tier-maxed');
        const cost = getComponentUpgradeCost(lvl);
        btn.textContent = `UPGRADE • $${cost.toLocaleString()}`;
        if (this.cash < cost) {
          btn.classList.add('disabled');
          (btn as HTMLElement).style.opacity = '0.55';
        } else {
          btn.classList.remove('disabled');
          (btn as HTMLElement).style.opacity = '1.0';
        }
      }
    });

    const b = this.bikeSpec;
    const engineBonus = (this.upgrades.engineLevel - 1) * 4;
    const totalTopMph = b.maxSpeedMph + engineBonus;

    this.dom.summaryBikeName.textContent = b.name;
    this.dom.summarySpeedVal.textContent = `${totalTopMph} MPH`;
    this.dom.summarySpeedFill.style.width = `${Math.min(100, (totalTopMph / 250) * 100)}%`;

    const totalAccel = Math.min(100, Math.round(b.accel * (1 + (this.upgrades.nitroLevel - 1) * 0.06)));
    this.dom.summaryAccelVal.textContent = `${totalAccel}/100`;
    this.dom.summaryAccelFill.style.width = `${totalAccel}%`;

    this.dom.summaryHandlingVal.textContent = `${b.handling}/40`;
    this.dom.summaryHandlingFill.style.width = `${Math.min(100, (b.handling / 40) * 100)}%`;

    this.dom.summaryArmorVal.textContent = `STAGE ${this.upgrades.armorLevel}`;
    this.dom.summaryArmorFill.style.width = `${Math.min(100, 50 + this.upgrades.armorLevel * 10)}%`;
  }

  private clearWorldLabels(): void {
    this.worldLabelsContainer.innerHTML = '';
    this.labelElements.clear();
  }

  private disposeHierarchy(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (
        child instanceof THREE.Mesh ||
        child instanceof THREE.Points ||
        child instanceof THREE.InstancedMesh
      ) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => {
              mat.dispose();
            });
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }

  private clearScene(): void {
    if (this.roadEnv) {
      this.roadEnv.dispose();
    }
    for (const child of this.scene.children) {
      if (child !== this.particleSystem.group) {
        this.disposeHierarchy(child);
      }
    }
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    this.rivals = [];
    this.traffic = [];
    this.pickups = [];
    this.stuntRamps = [];
    this.particleSystem.clear();
    this.policeUnit = null;
    this.clearWorldLabels();
  }

  private setupLightingAndSky(spec: TrackSpec): void {
    this.scene.background = new THREE.Color(spec.skyTopColor);
    this.scene.fog = new THREE.FogExp2(spec.fogColor, 0.0015);

    if (this.bloomNode) {
      this.bloomNode.strength.value = this.useBloom ? (spec.isNight ? 0.28 : 0.2) : 0.0;
    }

    const hemi = new THREE.HemisphereLight(
      spec.skyBottomColor,
      spec.groundColor,
      spec.isNight ? 0.85 : 1.15
    );
    this.scene.add(hemi);

    this.dirLight = new THREE.DirectionalLight(
      spec.isNight ? 0xa5b4fc : 0xfff7ed,
      spec.isNight ? 1.25 : 1.75
    );
    this.dirLight.position.set(45, 95, 60);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.bias = -0.0008;
    this.dirLight.shadow.normalBias = 0.04;
    this.dirLight.shadow.camera.near = 5;
    this.dirLight.shadow.camera.far = 170;
    this.dirLight.shadow.camera.left = -38;
    this.dirLight.shadow.camera.right = 38;
    this.dirLight.shadow.camera.top = 38;
    this.dirLight.shadow.camera.bottom = -38;

    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);
  }

  private buildPreviewScene(): void {
    this.clearScene();
    this.trackSpec = TRACKS[this.selectedTrackIdx];
    this.bikeSpec = BIKES[this.selectedBikeIdx];

    this.setupLightingAndSky(this.trackSpec);
    this.roadEnv = new RoadEnvironment(this.trackSpec);
    this.scene.add(this.roadEnv.group);
    this.scene.add(this.particleSystem.group);

    this.player = this.createRacer(
      'player',
      'YOU',
      true,
      false,
      0,
      10,
      this.bikeSpec.primaryColor,
      this.bikeSpec.accentColor,
      'fists',
      1.0,
      1.0
    );
    this.player.riderBodyGroup.visible = true;
    this.syncGarageMenuUI();
  }

  private createRacer(
    id: string,
    name: string,
    isPlayer: boolean,
    isPolice: boolean,
    x: number,
    z: number,
    primaryColor: number,
    accentColor: number,
    weapon: WeaponType,
    aggression: number,
    speedFactor: number
  ): RacerEntity {
    const built = createBikeAndRiderMesh(primaryColor, accentColor, isPolice, weapon, isPlayer);
    this.scene.add(built.group);

    const effectivePlayerMaxMph = this.bikeSpec.maxSpeedMph + (this.upgrades.engineLevel - 1) * 4;
    const effectivePlayerMaxUnits = effectivePlayerMaxMph * 0.6;
    const aiBaseSpeed = effectivePlayerMaxUnits * speedFactor;
    const opponentHp = isPlayer ? 100 : Math.round(100 * (1 + (this.upgrades.armorLevel - 1) * 0.15));

    const entity: RacerEntity = {
      id,
      name,
      isPlayer,
      isPolice,
      mesh: built.group,
      riderBodyGroup: built.riderBodyGroup,
      handlebarGroup: built.handlebarGroup,
      frontWheelMesh: built.frontWheelMesh,
      rearWheelMesh: built.rearWheelMesh,
      leftArmPivot: built.leftArmPivot,
      rightArmPivot: built.rightArmPivot,
      leftLegPivot: built.leftLegPivot,
      rightLegPivot: built.rightLegPivot,
      weaponMesh: built.weaponMesh,
      swingArcMesh: built.swingArcMesh,
      flameMeshLeft: built.flameMeshLeft,
      flameMeshRight: built.flameMeshRight,
      sirenLightRed: built.sirenLightRed,
      sirenLightBlue: built.sirenLightBlue,
      policeStrobeMeshes: built.policeStrobeMeshes,
      z,
      totalDistance: z,
      lap: 1,
      x,
      yOffset: 0,
      vy: 0,
      vx: 0,
      speed: 0,
      leanAngle: 0,
      shoveTilt: 0,
      wheelieAngle: 0,
      airTime: 0,
      hp: opponentHp,
      maxHp: opponentHp,
      bikeHp: opponentHp,
      maxBikeHp: opponentHp,
      nitro: 100,
      nitroBoostTimer: 0,
      nitroCooldown: isPlayer ? 0 : isPolice ? 2.0 : 3.0 + Math.random() * 3.5,
      weapon,
      slipstreamCharge: 0,
      attackSide: null,
      attackTimer: 0,
      attackCooldown: isPlayer ? 0 : isPolice ? 1.5 : 2.2 + Math.random() * 2.0,
      hasDealtHitInSwing: false,
      wipedOut: false,
      wipeoutTimer: 0,
      wipeoutSpin: 0,
      invulnTimer: 0,
      staggerTimer: 0,
      lastHitByPlayerTimer: 0,
      targetX: x,
      aiAggression: aggression,
      aiBaseSpeed,
      aiLaneTimer: Math.random() * 1.6,
      primaryColor: isPolice ? 0x0088ff : primaryColor,
    };

    if (!isPlayer) {
      const tag = document.createElement('div');
      tag.className = `rival-tag-3d ${isPolice ? 'police' : ''}`;
      const prefix = isPolice ? '🚨 ' : '';
      const tierBadge = isPolice ? '' : `<span style="color:#00f0ff;font-size:10px;margin-right:4px;">[T${this.upgrades.tier}]</span>`;
      tag.innerHTML = `
        <div class="rival-tag-name">${prefix}${tierBadge}${name} ${WEAPONS[weapon].icon}</div>
        <div class="rival-tag-bar"><div class="rival-tag-fill" style="width:100%"></div></div>
      `;
      this.worldLabelsContainer.appendChild(tag);
      this.labelElements.set(id, tag);
    }

    this.syncRacerTransform(entity);
    return entity;
  }

  /**
   * Guaranteed Solvable Highway Slot Finder
   * Finds a safe, non-overlapping (x, z, laneIndex, speed) slot such that:
   * 1. No other vehicle in the same lane is within 55 units.
   * 2. No other vehicle in an adjacent lane (|L1 - L2| <= 1) is within 40 units (guaranteed escape corridor).
   * 3. Center lane (Lane 2) is strictly forward-only and guarantees both flanking lanes (1 and 3) are clear for 45 units.
   * 4. Safe clearance from stunt ramps (>= 38 units).
   */
  private findValidTrafficSlot(
    carType: 'sedan' | 'truck' | 'sports',
    oncoming: boolean,
    minZ: number,
    maxZ: number,
    excludeCar?: TrafficVehicle
  ): { x: number; z: number; laneIndex: number; speed: number } {
    let candidateLanes: number[];

    if (oncoming) {
      // Oncoming traffic is strictly confined to Lane 0 (-10.4) and Lane 1 (-5.2)
      if (carType === 'truck') {
        candidateLanes = [0]; // Heavy trucks stay in outermost oncoming lane
      } else {
        candidateLanes = Math.random() < 0.5 ? [0, 1] : [1, 0];
      }
    } else {
      // Forward traffic occupies Lane 2 (0.0 Center Express), Lane 3 (+5.2), Lane 4 (+10.4)
      if (carType === 'truck') {
        candidateLanes = [4]; // Semi-trucks stay in outermost slow forward lane
      } else {
        // Center lane has heavily reduced probability (< 6%)
        const rand = Math.random();
        if (rand < 0.06) {
          candidateLanes = [LANE_CENTER_INDEX, 3, 4];
        } else if (rand < 0.55) {
          candidateLanes = [3, 4];
        } else {
          candidateLanes = [4, 3];
        }
      }
    }

    const zSpan = Math.max(80, maxZ - minZ);
    const step = 14;
    const maxSteps = Math.floor(zSpan / step);
    const startStep = Math.floor(Math.random() * maxSteps);

    for (let s = 0; s < maxSteps; s++) {
      const curStep = (startStep + s) % maxSteps;
      const testZ = minZ + curStep * step + (Math.random() - 0.5) * 4;

      // Stunt ramp collision check
      let nearRamp = false;
      for (const ramp of this.stuntRamps) {
        if (Math.abs(ramp.z - testZ) < 38) {
          nearRamp = true;
          break;
        }
      }
      if (nearRamp) continue;

      for (const laneIdx of candidateLanes) {
        // Zero oncoming in center lane
        if (oncoming && laneIdx === LANE_CENTER_INDEX) continue;

        let blocked = false;

        for (const other of this.traffic) {
          if (other === excludeCar) continue;
          const dz = Math.abs(other.z - testZ);

          // 1. Same lane headway exclusion
          if (other.laneIndex === laneIdx && dz < 55) {
            blocked = true;
            break;
          }

          // 2. Adjacent lane exclusion (strict escape corridor guarantee)
          const laneDiff = Math.abs(other.laneIndex - laneIdx);
          if (laneDiff === 1 && dz < 40) {
            blocked = true;
            break;
          }

          // 3. Center Lane Special Rule: If placed in center lane, both flanking lanes must be clear for 45 units
          if (
            laneIdx === LANE_CENTER_INDEX &&
            (other.laneIndex === 1 || other.laneIndex === 3) &&
            dz < 45
          ) {
            blocked = true;
            break;
          }
        }

        if (!blocked) {
          const laneX = HIGHWAY_LANES[laneIdx];
          let speed: number;
          if (oncoming) {
            speed = laneIdx === 0
              ? -(42 + Math.random() * 5)
              : -(36 + Math.random() * 5);
          } else {
            speed = laneIdx === LANE_CENTER_INDEX
              ? 50 + Math.random() * 5
              : laneIdx === 3
                ? 42 + Math.random() * 4
                : 34 + Math.random() * 4;
          }

          return {
            x: laneX,
            z: testZ,
            laneIndex: laneIdx,
            speed,
          };
        }
      }
    }

    // Safe fallback if highway slice is heavily saturated
    const fallbackLane = oncoming ? 0 : 4;
    const fallbackSpeed = oncoming ? -40 : 36;
    return {
      x: HIGHWAY_LANES[fallbackLane],
      z: maxZ + 60,
      laneIndex: fallbackLane,
      speed: fallbackSpeed,
    };
  }

  public startRace(): void {
    this.clearScene();
    this.trackSpec = TRACKS[this.selectedTrackIdx];
    this.bikeSpec = BIKES[this.selectedBikeIdx];

    this.setupLightingAndSky(this.trackSpec);
    this.roadEnv = new RoadEnvironment(this.trackSpec);
    this.scene.add(this.roadEnv.group);
    this.scene.add(this.particleSystem.group);

    this.knockdowns = 0;
    this.peakSpeedMph = 0;
    this.raceCashEarned = 0;
    this.racePursePrize = 0;
    this.raceBounties = 0;
    this.racePickupsStunts = 0;
    this.lastRivalHudKey = '';
    this.policePursuitAnnounced = false;
    this.revLaunchCharge = 0;
    this.goBannerTimer = 0;

    // Player starts at the back of the starting grid (12th/12 position, z = 0) at 0 MPH
    this.player = this.createRacer(
      'player',
      'PLAYER',
      true,
      false,
      0,
      0,
      this.bikeSpec.primaryColor,
      this.bikeSpec.accentColor,
      'fists',
      1.0,
      1.0
    );
    this.player.riderBodyGroup.visible = this.cameraMode !== 1;
    this.camSmoothX = 0;

    // Spawn all 11 Rival Bots in a staggered starting grid directly ahead of the player (z = 5.5m to 33m) at 0 MPH!
    const gridSlotsX = [-6.8, 6.8, -2.6, 2.6, -8.5, 0.0, 8.5, -4.8, 4.8, -3.2, 3.2];
    RIVAL_PROFILES.forEach((prof, idx) => {
      const row = Math.floor(idx / 2);
      const laneX = gridSlotsX[idx % gridSlotsX.length];
      const startZ = 5.5 + row * 5.2 + (idx % 2) * 1.6;
      const rival = this.createRacer(
        `rival_${idx}`,
        prof.name,
        false,
        false,
        laneX,
        startZ,
        prof.color,
        0xffffff,
        prof.weapon,
        prof.aggression,
        prof.speedFactor
      );
      rival.speed = 0;
      this.rivals.push(rival);
    });

    // Initialize Lap Records for Player and all Rivals
    this.raceElapsed = 0;
    this.lapLeaders = [];
    this.fastestLapRecord = null;
    this.activeResultView = 'player';
    this.racerLapRecords.clear();

    const makeLapRecord = (racer: RacerEntity): RacerLapRecord => ({
      id: racer.id,
      name: racer.name,
      isPlayer: racer.isPlayer,
      color: racer.primaryColor,
      prevDistance: racer.totalDistance,
      lapTimes: [],
      lapTimestamps: [],
      lastLapCrossingTime: 0,
      totalTime: 0,
      finished: false,
      finishPosition: 0,
      bestLap: Infinity,
      isFastestLapHolder: false,
      isDNF: false,
    });

    this.racerLapRecords.set(this.player.id, makeLapRecord(this.player));
    for (const r of this.rivals) {
      this.racerLapRecords.set(r.id, makeLapRecord(r));
    }

    // Highway Patrol Officer O'Connor waits on the right shoulder ahead at 0 MPH until GO!
    this.policeUnit = this.createRacer(
      'police_1',
      "OFFICER O'CONNOR",
      false,
      true,
      ROAD_HALF_WIDTH - 2.0,
      115,
      0x111625,
      0xffffff,
      'baton',
      0.92,
      0.96
    );
    this.policeUnit.speed = 0;

    // Spawn Civilian Traffic across 5 Highway Lanes with guaranteed solvable corridors
    // Tuned base count (15 * trafficDensity -> 15 to 18 cars total)
    const numCars = Math.floor(15 * this.trackSpec.trafficDensity);

    for (let i = 0; i < numCars; i++) {
      // Direction distribution: ~40% oncoming (Lanes 0 & 1), ~60% forward (Lanes 3, 4, and sparse Lane 2)
      const oncoming = i < Math.floor(numCars * 0.42);
      let type: 'sedan' | 'truck' | 'sports';
      if (i % 5 === 0) {
        type = 'truck';
      } else if (i % 3 === 0) {
        type = 'sports';
      } else {
        type = 'sedan';
      }

      const builtCar = createTrafficCarMesh(type, oncoming);
      this.scene.add(builtCar.mesh);

      const segmentSpan = (this.trackSpec.lengthUnits - 320) / numCars;
      const minZ = 200 + i * segmentSpan;
      const maxZ = minZ + segmentSpan;

      const slot = this.findValidTrafficSlot(type, oncoming, minZ, maxZ);

      this.traffic.push({
        mesh: builtCar.mesh,
        wheels: builtCar.wheels,
        z: slot.z,
        x: slot.x,
        targetX: slot.x,
        laneIndex: slot.laneIndex,
        laneChangeTimer: 4.0 + Math.random() * 6.0,
        isChangingLanes: false,
        speed: slot.speed,
        baseSpeed: slot.speed,
        isBraking: false,
        width: builtCar.width,
        length: builtCar.length,
        type,
        oncoming,
        rearLightMat: builtCar.rearLightMat,
      });
    }

    // Spawn 3D Symbol Pickups ($ Cash, Wrench Repair Tool, NOS Nitro, Crossed Blades Weapon)
    // Balanced pickup frequency: spaced 145m apart with 33% nitro in pool
    const pickupTypes: Array<'nitro' | 'repair' | 'weapon' | 'cash'> = [
      'cash',
      'nitro',
      'repair',
      'cash',
      'nitro',
      'weapon',
    ];
    const weaponPool: WeaponType[] = ['crowbar', 'chain', 'nunchuks', 'baton', 'katana'];
    let pIdx = 0;
    for (let z = 140; z < this.trackSpec.lengthUnits - 140; z += 145) {
      const pType = pickupTypes[pIdx % pickupTypes.length];
      pIdx++;
      const pMesh = createPickupMesh(pType);
      const px = (Math.random() - 0.5) * (ROAD_HALF_WIDTH * 1.35);
      const cx = this.roadEnv.getCurveX(z);
      const cy = this.roadEnv.getElevationY(z);
      pMesh.position.set(cx + px, cy, -z);
      this.scene.add(pMesh);

      this.pickups.push({
        mesh: pMesh,
        z,
        x: px,
        type: pType,
        weaponType: weaponPool[Math.floor(Math.random() * weaponPool.length)],
        collected: false,
      });
    }

    // Spawn Highway Stunt Ramps
    for (let z = 320; z < this.trackSpec.lengthUnits - 260; z += 380) {
      const builtRamp = createStuntRampMesh();
      const rx = ((Math.floor(z / 380) % 3) - 1) * 6.5;
      const cx = this.roadEnv.getCurveX(z);
      const cy = this.roadEnv.getElevationY(z);
      const yaw = this.roadEnv.getCurveYaw(z);
      const pitch = this.roadEnv.getPitchAngle(z);

      builtRamp.mesh.position.set(cx + rx, cy, -z);
      builtRamp.mesh.rotation.set(pitch, -yaw, 0);
      this.scene.add(builtRamp.mesh);

      this.stuntRamps.push({
        mesh: builtRamp.mesh,
        z,
        x: rx,
        width: builtRamp.width,
        length: builtRamp.length,
      });
    }

    this.dom.menuOverlay.classList.add('hidden');
    this.dom.resultOverlay.classList.add('hidden');
    this.dom.hud.classList.remove('hidden');
    this.dom.combatFeed.innerHTML = '';
    this.dom.hudTrackName.textContent = this.trackSpec.name;
    if (this.dom.hudLap) {
      this.dom.hudLap.textContent = `LAP 1/${this.totalLaps}`;
    }

    // Enter Starting Grid Countdown State (READY... -> STEADY... -> GO!)
    this.state = 'countdown';
    this.countdownTimer = 2.4;
    this.countdownStage = 'ready';
    this.setCountdownUI('ready');
    this.roadEnv.setStartLightState('ready');
    this.sound.playCountdownBeep('ready');

    this.addCombatFeed(
      `🚦 STARTING GRID: YOU ARE P12/12! HOLD [W / ↑] TO REV ENGINE FOR LAUNCH!`
    );
    this.updateHUD();
  }

  private setCountdownUI(stage: 'ready' | 'steady' | 'go' | 'hidden'): void {
    const overlay = this.dom.countdownOverlay;
    const textEl = this.dom.countdownText;
    const subEl = this.dom.countdownSub;
    const lRed = this.dom.lightRed;
    const lAmber = this.dom.lightAmber;
    const lGreen = this.dom.lightGreen;

    if (!overlay || !textEl || !lRed || !lAmber || !lGreen) return;

    if (stage === 'hidden') {
      overlay.classList.add('hidden');
      return;
    }

    overlay.classList.remove('hidden');
    lRed.className = 'gantry-lamp red' + (stage === 'ready' ? ' active' : '');
    lAmber.className = 'gantry-lamp amber' + (stage === 'steady' ? ' active' : '');
    lGreen.className = 'gantry-lamp green' + (stage === 'go' ? ' active' : '');

    if (stage === 'ready') {
      textEl.textContent = 'READY...';
      textEl.className = 'countdown-stage-text ready';
      if (subEl) subEl.textContent = 'ALL 12 BIKERS ON STARTING GRID — HOLD [W / ↑] TO REV!';
    } else if (stage === 'steady') {
      textEl.textContent = 'STEADY...';
      textEl.className = 'countdown-stage-text steady';
      if (subEl) subEl.textContent = 'BUILD RPM FOR SIMULTANEOUS GRID LAUNCH!';
    } else if (stage === 'go') {
      textEl.textContent = 'GO!';
      textEl.className = 'countdown-stage-text go';
      if (subEl) {
        subEl.textContent =
          this.revLaunchCharge > 0.35
            ? '🔥 TURBO RPM LAUNCH BOOST! OVERTAKE THE PACK!'
            : '🏁 RACE LIVE — DRAFT & BRAWL THROUGH THE PACK TO P1!';
      }
    }
  }

  /**
   * Updates the Starting Grid during READY... STEADY... GO!
   * All racers stay at z (0 MPH forward speed) until GO! triggers, while revving engines on the line.
   */
  private updateCountdown(dt: number): void {
    this.countdownTimer -= dt;

    const throttle = this.keys['KeyW'] || this.keys['ArrowUp'];
    const p = this.player;
    const flameMatL = p.flameMeshLeft.material as THREE.MeshBasicMaterial;
    const flameMatR = p.flameMeshRight.material as THREE.MeshBasicMaterial;

    if (throttle) {
      this.revLaunchCharge = Math.min(1.0, this.revLaunchCharge + dt * 0.65);
      p.wheelieAngle = Math.sin(performance.now() * 0.04) * 0.035 + 0.04;
      flameMatL.opacity = 0.75;
      flameMatR.opacity = 0.75;
      this.sound.updateEngine(95 + this.revLaunchCharge * 85, this.bikeSpec.maxSpeedMph, true, dt);
      if (Math.random() < 0.45) {
        this.particleSystem.spawnTireSmoke(
          p.mesh.position.x,
          p.mesh.position.y,
          p.mesh.position.z,
          1
        );
      }
    } else {
      this.revLaunchCharge = Math.max(0, this.revLaunchCharge - dt * 0.5);
      p.wheelieAngle = THREE.MathUtils.lerp(p.wheelieAngle, 0, dt * 8);
      flameMatL.opacity = 0.2;
      flameMatR.opacity = 0.2;
      this.sound.updateEngine(18, this.bikeSpec.maxSpeedMph, false, dt);
    }

    this.syncRacerTransform(p);

    // Rival bots idle-rev on the starting grid waiting for green light
    for (const r of this.rivals) {
      const rFlameL = r.flameMeshLeft.material as THREE.MeshBasicMaterial;
      const rFlameR = r.flameMeshRight.material as THREE.MeshBasicMaterial;
      const revPulse = 0.25 + 0.45 * Math.abs(Math.sin(performance.now() * 0.012 + r.z));
      rFlameL.opacity = revPulse;
      rFlameR.opacity = revPulse;
      if (Math.random() < 0.08) {
        this.particleSystem.spawnTireSmoke(
          r.mesh.position.x,
          r.mesh.position.y,
          r.mesh.position.z,
          1
        );
      }
      this.syncRacerTransform(r);
    }

    // Update RPM bar & status badge during countdown
    const revRpmPct = throttle
      ? 45 + this.revLaunchCharge * 50 + Math.sin(performance.now() * 0.05) * 5
      : 15;
    this.dom.hudRpm.style.width = `${Math.min(100, Math.max(12, revRpmPct))}%`;
    this.dom.statusBadge.textContent =
      this.countdownStage === 'ready' ? '🔴 READY ON GRID' : '🟡 STEADY — REV ENGINE!';

    // Transition READY -> STEADY at 1.2s remaining
    if (this.countdownTimer <= 1.2 && this.countdownStage === 'ready') {
      this.countdownStage = 'steady';
      this.setCountdownUI('steady');
      this.roadEnv.setStartLightState('steady');
      this.sound.playCountdownBeep('steady');
    }

    // Transition STEADY -> GO! at 0.0s remaining — simultaneous launch!
    if (this.countdownTimer <= 0) {
      this.countdownStage = 'go';
      this.state = 'racing';
      this.goBannerTimer = 0.85;
      this.setCountdownUI('go');
      this.roadEnv.setStartLightState('go');
      this.sound.playCountdownBeep('go');

      // Simultaneous launch from standstill: player gets bonus launch impulse if revving!
      if (this.revLaunchCharge > 0.25) {
        this.player.speed = 24 + this.revLaunchCharge * 28;
        this.player.wheelieAngle = 0.14;
        this.particleSystem.spawnNitroFlames(
          this.player.mesh.position,
          this.roadEnv.getCurveYaw(this.player.z),
          6
        );
      } else {
        this.player.speed = 12;
      }

      // All 11 bots launch simultaneously off the line from 0 MPH
      for (const r of this.rivals) {
        r.speed = 10 + r.aiAggression * 8;
      }
      if (this.policeUnit) {
        this.policeUnit.speed = 16;
      }

      this.addCombatFeed(
        `🟢 GREEN LIGHT — GO! ALL 12 RACERS LAUNCHED! CATCH UP & OVERTAKE TO 1ST!`
      );
    }
  }

  /**
   * Switches active weapon on the pre-built weapon holder without allocating new Meshes/Materials mid-frame.
   */
  private equipWeapon(racer: RacerEntity, newWeapon: WeaponType): void {
    racer.weapon = newWeapon;
    setActiveWeaponOnHolder(racer.weaponMesh, newWeapon);

    const tag = this.labelElements.get(racer.id);
    if (tag) {
      const nameEl = tag.querySelector('.rival-tag-name');
      const prefix = racer.isPolice ? '🚨 ' : '';
      if (nameEl) nameEl.textContent = `${prefix}${racer.name} ${WEAPONS[newWeapon].icon}`;
    }
  }

  /**
   * Finds the nearest active biker in combat proximity and determines whether to strike/kick LEFT or RIGHT.
   */
  private findProximityCombatSide(
    racer: RacerEntity,
    fallbackSide?: 'left' | 'right'
  ): { side: 'left' | 'right'; target: RacerEntity | null; dist: number } {
    const candidates: RacerEntity[] = racer.isPlayer
      ? [...this.rivals, ...(this.policeUnit ? [this.policeUnit] : [])]
      : [this.player, ...this.rivals.filter((r) => r !== racer)];

    let closestInCombatZone: RacerEntity | null = null;
    let closestCombatScore = Infinity;

    let closestOverall: RacerEntity | null = null;
    let closestOverallDist = Infinity;

    for (const c of candidates) {
      if (c.wipedOut) continue;
      const dz = Math.abs(c.z - racer.z);
      const dx = c.x - racer.x;
      const absDx = Math.abs(dx);
      const euclid = Math.hypot(dz, absDx);

      if (euclid < closestOverallDist) {
        closestOverallDist = euclid;
        closestOverall = c;
      }

      if (dz < 18 && absDx < 12) {
        const score = dz * 1.15 + absDx;
        if (score < closestCombatScore) {
          closestCombatScore = score;
          closestInCombatZone = c;
        }
      }
    }

    if (closestInCombatZone) {
      const side: 'left' | 'right' = closestInCombatZone.x < racer.x ? 'left' : 'right';
      return {
        side,
        target: closestInCombatZone,
        dist: Math.hypot(closestInCombatZone.z - racer.z, closestInCombatZone.x - racer.x),
      };
    }

    if (!fallbackSide && closestOverall && closestOverallDist < 40) {
      const side: 'left' | 'right' = closestOverall.x < racer.x ? 'left' : 'right';
      return { side, target: closestOverall, dist: closestOverallDist };
    }

    const steerLeft = this.keys['KeyA'] || this.keys['ArrowLeft'];
    const steerRight = this.keys['KeyD'] || this.keys['ArrowRight'];
    const defaultSide: 'left' | 'right' =
      fallbackSide ?? (steerLeft ? 'left' : steerRight ? 'right' : 'right');

    return { side: defaultSide, target: null, dist: Infinity };
  }

  private triggerProximityPlayerAttack(preferredSide: 'left' | 'right' | undefined, isKick: boolean): void {
    const prox = this.findProximityCombatSide(this.player, preferredSide);
    const attackSide: AttackSide = isKick
      ? prox.side === 'left'
        ? 'kick-left'
        : 'kick-right'
      : prox.side;

    // Slight magnetic lunge toward nearby biker so strikes & kicks connect reliably at high speed
    if (prox.target && prox.dist < 9.5) {
      const dx = prox.target.x - this.player.x;
      const range = WEAPONS[this.player.weapon].range;
      if (Math.abs(dx) > range * 0.55) {
        this.player.vx += Math.sign(dx) * 5.2;
      }
    }

    this.triggerAttack(this.player, attackSide);
  }

  private triggerAttack(racer: RacerEntity, side: AttackSide): void {
    if (!side || racer.wipedOut || racer.attackTimer > 0 || racer.attackCooldown > 0) return;
    racer.attackSide = side;
    racer.attackTimer = racer.isPlayer ? 0.28 : 0.34;
    // Police officer attacks more frequently (1.5s-2.3s) than regular rivals (2.4s-3.8s)
    racer.attackCooldown = racer.isPlayer
      ? 0.28
      : racer.isPolice
      ? 1.5 + Math.random() * 0.8
      : 2.4 + Math.random() * 1.4;
    racer.hasDealtHitInSwing = false;

    const isLeft = side === 'left' || side === 'kick-left';
    const isKick = side === 'kick-left' || side === 'kick-right';

    if (side === 'left') {
      racer.leftArmPivot.add(racer.weaponMesh);
      racer.weaponMesh.rotation.y = Math.PI;
    } else if (side === 'right') {
      racer.rightArmPivot.add(racer.weaponMesh);
      racer.weaponMesh.rotation.y = 0;
    }

    const arcMat = racer.swingArcMesh.material as THREE.MeshBasicMaterial;
    arcMat.color.setHex(isKick ? 0xffbe0b : WEAPONS[racer.weapon].color);
    racer.swingArcMesh.rotation.y = isLeft ? Math.PI * 0.55 : -Math.PI * 0.35;

    if (racer.isPlayer) {
      this.sound.playSwing();
    }
  }

  private spawnParticles(worldPos: THREE.Vector3, color: number, count = 18): void {
    this.particleSystem.spawnSparks(worldPos.x, worldPos.y + 0.8, worldPos.z, color, count, 18);
  }

  private triggerWipeout(victim: RacerEntity, attacker?: RacerEntity, customReason?: string): void {
    if (victim.wipedOut || victim.invulnTimer > 0) return;
    victim.wipedOut = true;
    victim.wipeoutTimer = 1.45;
    victim.wipeoutSpin = (Math.random() > 0.5 ? 1 : -1) * 10;
    victim.speed *= 0.28;
    victim.staggerTimer = 0;

    this.sound.playCrash();
    this.particleSystem.spawnExplosion(
      victim.mesh.position.x,
      victim.mesh.position.y,
      victim.mesh.position.z,
      0xff4500,
      36
    );

    if (victim.isPlayer) {
      this.flashDamageOverlay();
      this.screenShake = 0.65;
      this.showCallout(customReason || '💥 WIPEOUT!');
      this.addCombatFeed('💥 YOU WIPED OUT! RECOVERING ON THE ASPHALT...');
      if (victim.bikeHp <= 0 || victim.hp <= 0) {
        this.finishRace(false, customReason || 'WRECKED OUT!');
      }
    } else if (attacker && attacker.isPlayer) {
      this.knockdowns++;
      const bounty = victim.isPolice ? POLICE_KO_BOUNTY : RIVAL_KO_BOUNTY;
      this.cash += bounty;
      this.raceCashEarned += bounty;
      this.raceBounties += bounty;
      const reasonPrefix = customReason ? `${customReason} ` : 'WRECKED ';
      this.showCallout(`${reasonPrefix}${victim.name}! +$${bounty}`);
      this.addCombatFeed(
        `💀 ${customReason || 'KNOCKED OUT'} ${victim.name}! +$${bounty} BOUNTY`
      );

      if (
        victim.weapon !== 'fists' &&
        WEAPONS[victim.weapon].damage > WEAPONS[this.player.weapon].damage
      ) {
        this.equipWeapon(this.player, victim.weapon);
        this.addCombatFeed(`🔥 STOLE ${WEAPONS[victim.weapon].name} FROM ${victim.name}!`);
      }
    }
  }

  /**
   * Resolves authentic Road Rash melee weapon strikes & directional kicks:
   * - Applies strong lateral knockback velocity (`vx`)
   * - Forces `target.targetX` in the shove direction and locks counter-steering during `staggerTimer`
   * - Tilts/wobbles the hit biker (`shoveTilt`) and slows them slightly on impact
   */
  private resolveMeleeHit(attacker: RacerEntity, target: RacerEntity): void {
    const weaponSpec = WEAPONS[attacker.weapon];
    const isKick = attacker.attackSide === 'kick-left' || attacker.attackSide === 'kick-right';
    const upgBonus = attacker.isPlayer
      ? 1 + (this.upgrades.meleeLevel - 1) * 0.2
      : attacker.isPolice
      ? 0.58 * (1 + (this.upgrades.meleeLevel - 1) * 0.12)
      : 0.42 * (1 + (this.upgrades.meleeLevel - 1) * 0.12);
    const mult = (attacker.isPlayer ? this.bikeSpec.meleeMult : 1.0) * upgBonus;
    const dmg = (isKick ? 20 : weaponSpec.damage) * mult;

    // Strong lateral shove force so kicks & weapons visibly send bikers careening across lanes!
    const baseKnock = isKick ? 38 : weaponSpec.knockback;
    const knock = baseKnock * (attacker.isPlayer ? Math.min(1.55, mult) : attacker.isPolice ? 0.72 : 0.58);

    const dir =
      attacker.attackSide === 'left' || attacker.attackSide === 'kick-left'
        ? -1
        : attacker.attackSide === 'right' || attacker.attackSide === 'kick-right'
        ? 1
        : target.x >= attacker.x
        ? 1
        : -1;

    target.vx += dir * knock;
    target.shoveTilt = dir * (isKick ? 0.78 : 0.62);
    target.staggerTimer = attacker.isPlayer ? (isKick ? 0.78 : 0.58) : 0.35;
    target.speed = Math.max(25, target.speed * (isKick ? 0.91 : 0.94));
    target.hp = Math.max(0, target.hp - dmg);

    if (!target.isPlayer) {
      // Shift AI target lane in the shove direction so AI doesn't immediately steer back against the blow
      const laneShift = dir * (isKick ? 8.5 : 6.2);
      target.targetX = THREE.MathUtils.clamp(
        target.x + laneShift,
        -ROAD_HALF_WIDTH - SHOULDER_WIDTH + 0.5,
        ROAD_HALF_WIDTH + SHOULDER_WIDTH - 0.5
      );
      target.aiLaneTimer = Math.max(target.aiLaneTimer, 1.05);
      if (attacker.isPlayer) {
        target.lastHitByPlayerTimer = 3.2;
      }
    }

    // Attacker gets a slight recoil brace
    attacker.vx -= dir * (isKick ? 4.5 : 2.5);

    this.sound.playHit(attacker.weapon !== 'fists' || isKick);
    this.spawnParticles(target.mesh.position, isKick ? 0xffbe0b : weaponSpec.color, 24);

    if (attacker.isPlayer) {
      this.screenShake = isKick ? 0.32 : 0.28;
      const sideLabel = dir < 0 ? 'LEFT' : 'RIGHT';
      const actionWord = isKick ? `${sideLabel}-KICKED` : `${sideLabel}-SMASHED`;
      this.addCombatFeed(
        `⚔️ ${actionWord} ${target.name} WITH ${isKick ? 'HEAVY BOOT KICK' : weaponSpec.name}! (-${Math.round(dmg)} HP)`
      );

      if (
        !isKick &&
        target.weapon !== 'fists' &&
        WEAPONS[target.weapon].damage > WEAPONS[attacker.weapon].damage
      ) {
        const stolen = target.weapon;
        this.equipWeapon(attacker, stolen);
        this.equipWeapon(target, 'fists');
        this.showCallout(`SNATCHED ${WEAPONS[stolen].name}!`);
        this.addCombatFeed(`⚡ SNATCHED ${WEAPONS[stolen].name} FROM ${target.name}!`);
      }
    } else if (target.isPlayer) {
      target.invulnTimer = Math.max(target.invulnTimer, 0.95);
      this.flashDamageOverlay();
      this.screenShake = 0.34;
      const atkTitle = attacker.isPolice ? `🚨 ${attacker.name}` : `⚠️ ${attacker.name}`;
      this.addCombatFeed(
        `${atkTitle} ${isKick ? 'KICKED' : 'STRUCK'} YOU WITH ${isKick ? 'BOOT' : weaponSpec.name}!`
      );
    }

    if (target.hp <= 0) {
      this.triggerWipeout(target, attacker);
    }
  }

  /**
   * Resolves physical bike-to-bike side bumping & grinding sparks when riders rub fairings.
   */
  private resolveBikeCollisions(dt: number): void {
    const activeRacers: RacerEntity[] = [
      this.player,
      ...this.rivals,
      ...(this.policeUnit ? [this.policeUnit] : []),
    ];

    for (let i = 0; i < activeRacers.length; i++) {
      const a = activeRacers[i];
      if (a.wipedOut || a.yOffset > 1.2) continue;

      for (let j = i + 1; j < activeRacers.length; j++) {
        const b = activeRacers[j];
        if (b.wipedOut || b.yOffset > 1.2) continue;

        const dz = Math.abs(a.z - b.z);
        const dx = b.x - a.x;
        const absDx = Math.abs(dx);

        if (dz < 2.15 && absDx < 1.32) {
          const pushDir = dx >= 0 ? 1 : -1;
          const overlap = 1.32 - absDx;
          const pushForce = 12 + overlap * 16;

          a.x -= pushDir * overlap * 0.5;
          b.x += pushDir * overlap * 0.5;
          a.vx -= pushDir * pushForce * dt * 12;
          b.vx += pushDir * pushForce * dt * 12;
          a.shoveTilt = THREE.MathUtils.clamp(a.shoveTilt - pushDir * 0.22, -0.65, 0.65);
          b.shoveTilt = THREE.MathUtils.clamp(b.shoveTilt + pushDir * 0.22, -0.65, 0.65);

          if (a.isPlayer || b.isPlayer) {
            const other = a.isPlayer ? b : a;
            other.lastHitByPlayerTimer = Math.max(other.lastHitByPlayerTimer, 1.8);
            if (Math.random() < 0.35) {
              this.particleSystem.spawnSparks(
                (a.mesh.position.x + b.mesh.position.x) * 0.5,
                a.mesh.position.y + 0.85,
                (a.mesh.position.z + b.mesh.position.z) * 0.5,
                0xffbe0b,
                4,
                12
              );
            }
          }
        }
      }
    }
  }

  private updateRacerCombatAndLimbs(racer: RacerEntity, dt: number): void {
    if (racer.attackCooldown > 0) {
      racer.attackCooldown = Math.max(0, racer.attackCooldown - dt);
    }
    if (racer.staggerTimer > 0) {
      racer.staggerTimer = Math.max(0, racer.staggerTimer - dt);
    }
    if (racer.lastHitByPlayerTimer > 0) {
      racer.lastHitByPlayerTimer = Math.max(0, racer.lastHitByPlayerTimer - dt);
    }
    racer.shoveTilt = THREE.MathUtils.lerp(racer.shoveTilt, 0, dt * 7.5);

    const wheelDelta = racer.speed * dt * 1.6;
    racer.frontWheelMesh.rotation.x -= wheelDelta;
    racer.rearWheelMesh.rotation.x -= wheelDelta;

    racer.leftArmPivot.rotation.set(0, 0, 0);
    racer.rightArmPivot.rotation.set(0, 0, 0);
    racer.leftLegPivot.rotation.set(0, 0, 0);
    racer.rightLegPivot.rotation.set(0, 0, 0);

    const arcMat = racer.swingArcMesh.material as THREE.MeshBasicMaterial;
    const totalDuration = racer.isPlayer ? 0.28 : 0.34;

    if (racer.attackTimer > 0) {
      racer.attackTimer = Math.max(0, racer.attackTimer - dt);
      const phase = Math.sin((1 - racer.attackTimer / totalDuration) * Math.PI);
      arcMat.opacity = phase * 0.82;

      if (racer.attackSide === 'left') {
        racer.leftArmPivot.rotation.z = phase * 1.52;
        racer.leftArmPivot.rotation.y = phase * 0.78;
      } else if (racer.attackSide === 'right') {
        racer.rightArmPivot.rotation.z = -phase * 1.52;
        racer.rightArmPivot.rotation.y = -phase * 0.78;
      } else if (racer.attackSide === 'kick-left') {
        racer.leftLegPivot.rotation.z = phase * 1.58;
        racer.leftLegPivot.rotation.x = -phase * 0.48;
      } else if (racer.attackSide === 'kick-right') {
        racer.rightLegPivot.rotation.z = -phase * 1.58;
        racer.rightLegPivot.rotation.x = -phase * 0.48;
      }

      const hitWindow = racer.isPlayer ? 0.22 : 0.12;
      if (!racer.hasDealtHitInSwing && racer.attackTimer < hitWindow) {
        const candidates: RacerEntity[] = racer.isPlayer
          ? [...this.rivals, ...(this.policeUnit ? [this.policeUnit] : [])]
          : [this.player];

        const isKick = racer.attackSide === 'kick-left' || racer.attackSide === 'kick-right';
        const isLeft = racer.attackSide === 'left' || racer.attackSide === 'kick-left';
        const range = racer.isPlayer
          ? (isKick ? 4.2 : WEAPONS[racer.weapon].range) + 1.0
          : WEAPONS[racer.weapon].range * 0.85;
        const maxDz = racer.isPlayer ? 4.8 : 2.8;

        for (const target of candidates) {
          if (target.wipedOut || target.invulnTimer > 0) continue;
          const dz = Math.abs(target.z - racer.z);
          const dx = target.x - racer.x;
          if (dz < maxDz && Math.abs(dx) < range) {
            const validSide = racer.isPlayer
              ? (isLeft && dx <= 1.8) || (!isLeft && dx >= -1.8)
              : (isLeft && dx < -0.15) || (!isLeft && dx > 0.15);
            if (validSide) {
              racer.hasDealtHitInSwing = true;
              const whiffChance = racer.isPolice ? 0.12 : 0.25;
              if (!racer.isPlayer && Math.random() < whiffChance) {
                break;
              }
              this.resolveMeleeHit(racer, target);
              break;
            }
          }
        }
      }
    } else {
      if (racer.attackSide !== null) {
        racer.attackSide = null;
        racer.rightArmPivot.add(racer.weaponMesh);
        racer.weaponMesh.rotation.y = 0;
      }
      arcMat.opacity = 0;
    }
  }

  private syncRacerTransform(racer: RacerEntity): void {
    const roadCenterX = this.roadEnv.getCurveX(racer.z);
    const roadY = this.roadEnv.getElevationY(racer.z);
    const roadYaw = this.roadEnv.getCurveYaw(racer.z);
    const roadPitch = this.roadEnv.getPitchAngle(racer.z);

    racer.mesh.position.set(roadCenterX + racer.x, roadY + racer.yOffset, -racer.z);

    if (racer.wipedOut) {
      racer.mesh.rotation.set(
        roadPitch + Math.sin(racer.wipeoutTimer * 10) * 0.65,
        -roadYaw + racer.wipeoutTimer * racer.wipeoutSpin,
        0.95
      );
      racer.mesh.position.y += Math.abs(Math.sin(racer.wipeoutTimer * 7)) * 2.2;
    } else {
      const combinedRoll = -racer.leanAngle - racer.shoveTilt;
      racer.mesh.rotation.set(
        roadPitch + racer.wheelieAngle + (racer.yOffset > 0.2 ? 0.22 : 0),
        -roadYaw - racer.leanAngle * 0.22 - racer.shoveTilt * 0.18,
        combinedRoll
      );
      if (racer.handlebarGroup) {
        racer.handlebarGroup.rotation.y = -racer.leanAngle * 0.32;
      }
    }
  }

  /**
   * Seamlessly wraps the circuit coordinates when the player crosses the Start/Finish gantry into a new lap.
   */
  private advanceCircuitLap(): void {
    const lapLen = this.trackSpec.lengthUnits;
    const p = this.player;

    if (p.lap < this.totalLaps) {
      p.lap++;
      p.z -= lapLen;

      for (const r of this.rivals) {
        r.z -= lapLen;
      }
      if (this.policeUnit) {
        this.policeUnit.z -= lapLen;
      }
      for (const car of this.traffic) {
        car.z -= lapLen;
      }
      this.particleSystem.shiftZ(lapLen);

      // Respawn circuit pickups for the new lap
      for (const item of this.pickups) {
        item.collected = false;
        const cx = this.roadEnv.getCurveX(item.z);
        const cy = this.roadEnv.getElevationY(item.z);
        item.mesh.position.set(cx + item.x, cy, -item.z);
      }

      this.sound.playPickup();
      const isFinalLap = p.lap === this.totalLaps;
      this.showCallout(
        isFinalLap ? `🔥 FINAL LAP ${p.lap}/${this.totalLaps}!` : `🏁 LAP ${p.lap}/${this.totalLaps}!`
      );
      this.addCombatFeed(
        `🏁 CROSSED START/FINISH GANTRY — ENTERING LAP ${p.lap} OF ${this.totalLaps}!`
      );
      if (this.dom.hudLap) {
        this.dom.hudLap.textContent = `LAP ${p.lap}/${this.totalLaps}`;
      }
    } else {
      this.finishRace(true);
    }
  }

  private updatePlayer(dt: number): void {
    if (this.goBannerTimer > 0) {
      this.goBannerTimer -= dt;
      if (this.goBannerTimer <= 0) {
        this.setCountdownUI('hidden');
      }
    }

    const p = this.player;
    const engineBonusMph = (this.upgrades.engineLevel - 1) * 4;
    const effectiveMaxMph = this.bikeSpec.maxSpeedMph + engineBonusMph;
    const maxSpeedUnits = effectiveMaxMph * 0.6;

    if (p.invulnTimer > 0) {
      p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    }

    if (p.wipedOut) {
      p.wipeoutTimer -= dt;
      const dz = p.speed * dt;
      p.z += dz;
      p.totalDistance += dz;
      this.checkLapCrossing(p, dt);
      p.speed = Math.max(0, p.speed - 45 * dt);
      p.yOffset = 0;
      if (p.wipeoutTimer <= 0) {
        p.wipedOut = false;
        p.invulnTimer = 2.0;
        p.hp = Math.max(45, p.hp);
        p.bikeHp = Math.max(35, p.bikeHp);
        p.x = THREE.MathUtils.clamp(p.x, -ROAD_HALF_WIDTH + 2, ROAD_HALF_WIDTH - 2);
      }
      this.syncRacerTransform(p);
      return;
    }

    const throttle = this.keys['KeyW'] || this.keys['ArrowUp'];
    const brake = this.keys['KeyS'] || this.keys['ArrowDown'];
    const steerLeft = this.keys['KeyA'] || this.keys['ArrowLeft'];
    const steerRight = this.keys['KeyD'] || this.keys['ArrowRight'];
    const nitroPressed =
      (this.keys['ShiftLeft'] || this.keys['ShiftRight']) && p.nitro > 2 && throttle;

    let isDrafting = false;
    for (const r of this.rivals) {
      const dz = r.z - p.z;
      if (dz > 3 && dz < 36 && Math.abs(r.x - p.x) < 2.3) {
        isDrafting = true;
        break;
      }
    }
    if (!isDrafting) {
      for (const c of this.traffic) {
        if (c.oncoming) continue;
        const dz = c.z - p.z;
        if (dz > 4 && dz < 38 && Math.abs(c.x - p.x) < c.width * 0.75) {
          isDrafting = true;
          break;
        }
      }
    }

    if (isDrafting && p.speed > 40) {
      p.slipstreamCharge = Math.min(1, p.slipstreamCharge + dt * 0.9);
      p.nitro = Math.min(100, p.nitro + 14 * dt);
    } else {
      p.slipstreamCharge = Math.max(0, p.slipstreamCharge - dt * 0.5);
    }

    const isOffRoad = Math.abs(p.x) > ROAD_HALF_WIDTH;

    let topCap = maxSpeedUnits * (1 + p.slipstreamCharge * 0.12);
    let accelRate = this.bikeSpec.accel * 0.68 * (1 + (this.upgrades.nitroLevel - 1) * 0.06);

    // Off-Track Friction & Penalty: Cap speed to ~52 MPH and reduce acceleration by 70%
    if (isOffRoad) {
      topCap = Math.min(topCap, OFF_TRACK_MAX_SPEED_UNITS);
      accelRate *= 0.30;
    }

    const flameMatL = p.flameMeshLeft.material as THREE.MeshBasicMaterial;
    const flameMatR = p.flameMeshRight.material as THREE.MeshBasicMaterial;

    const nitroDrain = Math.max(20, 42 - (this.upgrades.nitroLevel - 1) * 1.2);
    if (nitroPressed) {
      p.nitro = Math.max(0, p.nitro - nitroDrain * dt);
      if (!isOffRoad) {
        topCap *= 1.28;
        accelRate *= 1.75;
      }
      p.wheelieAngle = THREE.MathUtils.lerp(p.wheelieAngle, isOffRoad ? 0.04 : 0.14, dt * 8);
      flameMatL.opacity = 0.85;
      flameMatR.opacity = 0.85;
      const flicker = 1 + Math.random() * 0.4;
      p.flameMeshLeft.scale.set(1, flicker, 1);
      p.flameMeshRight.scale.set(1, flicker, 1);

      this.particleSystem.spawnNitroFlames(p.mesh.position, this.roadEnv.getCurveYaw(p.z), 2);
    } else {
      p.nitro = Math.min(100, p.nitro + 4.5 * dt);
      p.wheelieAngle = THREE.MathUtils.lerp(p.wheelieAngle, 0, dt * 8);
      flameMatL.opacity = throttle ? 0.25 : 0.0;
      flameMatR.opacity = throttle ? 0.25 : 0.0;
    }

    if (throttle) {
      if (p.speed < topCap) {
        p.speed = Math.min(topCap, p.speed + accelRate * dt);
      } else if (p.speed > topCap) {
        // Natural aerodynamic bleed back to topCap (e.g. after instant super boost)
        p.speed = Math.max(topCap, p.speed - (isOffRoad ? 42 : 16) * dt);
      }
      if (p.speed < 28 && !isOffRoad) {
        this.particleSystem.spawnTireSmoke(
          p.mesh.position.x,
          p.mesh.position.y,
          p.mesh.position.z,
          1
        );
      }
    } else if (brake) {
      p.speed = Math.max(0, p.speed - 65 * dt);
      if (p.speed > 35 && !isOffRoad) {
        this.particleSystem.spawnTireSmoke(
          p.mesh.position.x,
          p.mesh.position.y,
          p.mesh.position.z,
          1
        );
        this.particleSystem.spawnSkidMark(
          p.mesh.position.x,
          p.mesh.position.y,
          p.mesh.position.z,
          this.roadEnv.getCurveYaw(p.z)
        );
      }
    } else {
      p.speed = Math.max(0, p.speed - (isOffRoad ? 36 : 16) * dt);
    }

    // Heavy off-road deceleration drag if travelling above the off-track top cap
    if (isOffRoad) {
      if (p.speed > OFF_TRACK_MAX_SPEED_UNITS) {
        const extraDrag = OFF_TRACK_DRAG * dt;
        p.speed = Math.max(OFF_TRACK_MAX_SPEED_UNITS, p.speed - extraDrag);
      }

      // Billowy dirt/gravel plumes kicking up from rear tire
      if (p.speed > 10) {
        this.particleSystem.spawnDirtDust(
          p.mesh.position.x,
          p.mesh.position.y,
          p.mesh.position.z,
          this.trackSpec.shoulderColor,
          p.speed > 28 ? 2 : 1
        );
      }

      // Micro-rumble from rough gravel terrain
      if (p.speed > 14) {
        this.screenShake = Math.max(this.screenShake, 0.09);
      }
    }

    // Check Stunt Ramps
    for (const ramp of this.stuntRamps) {
      const dz = p.z - ramp.z;
      if (Math.abs(dz) < ramp.length * 0.55 && Math.abs(p.x - ramp.x) < ramp.width * 0.52) {
        if (p.yOffset <= 0.1 && p.speed > 35) {
          p.vy = 16.5 + (p.speed / maxSpeedUnits) * 9.5;
          this.sound.playPickup();
          this.showCallout('🚀 RAMP STUNT!');
          this.addCombatFeed(`🚀 AIRBORNE STUNT JUMP! +$${STUNT_JUMP_BONUS} BONUS`);
          this.cash += STUNT_JUMP_BONUS;
          this.raceCashEarned += STUNT_JUMP_BONUS;
          this.racePickupsStunts += STUNT_JUMP_BONUS;
        }
      }
    }

    // Airborne physics
    if (p.yOffset > 0 || p.vy > 0) {
      p.vy -= 42 * dt;
      p.yOffset += p.vy * dt;
      p.airTime += dt;
      if (p.yOffset <= 0) {
        p.yOffset = 0;
        p.vy = 0;
        if (p.airTime > 0.45) {
          this.sound.playHit(false);
          this.screenShake = 0.24;
          this.particleSystem.spawnSparks(
            p.mesh.position.x,
            p.mesh.position.y,
            p.mesh.position.z,
            0x00f0ff,
            16,
            16
          );
        }
        p.airTime = 0;
      }
    }

    // Steering & Cornering
    const steerInput = (steerRight ? 1 : 0) - (steerLeft ? 1 : 0);
    const speedFactor = Math.min(1, p.speed / 28);
    let handling = this.bikeSpec.handling * 1.08;
    if (isOffRoad) {
      handling *= 0.65; // Loose gravel traction / reduced steering responsiveness
    }

    const lateralMovement = steerInput * handling * speedFactor * dt;
    p.x += lateralMovement;
    p.x += p.vx * dt;
    p.vx = THREE.MathUtils.lerp(p.vx, 0, dt * 5.8);

    const curvature = this.roadEnv.getCurveYaw(p.z + 4) - this.roadEnv.getCurveYaw(p.z - 4);
    const curveForce = curvature * (p.speed / maxSpeedUnits) * 28;
    p.x -= curveForce * dt;

    const guardrailLimit = ROAD_HALF_WIDTH + SHOULDER_WIDTH - 0.2;

    // Guardrail scrape bounce if player hits the steel W-beam barrier
    if (Math.abs(p.x) >= guardrailLimit) {
      const railSign = Math.sign(p.x);
      p.x = railSign * guardrailLimit;
      p.vx = -railSign * 7.0;
      if (p.speed > 30) {
        this.particleSystem.spawnSparks(
          p.mesh.position.x + railSign * 0.4,
          p.mesh.position.y + 0.7,
          p.mesh.position.z,
          0xffbe0b,
          6,
          15
        );
        p.speed = Math.max(18, p.speed - 30 * dt);
        this.sound.playHit(true);
      }
    }

    const targetLean = steerInput * 0.46;
    p.leanAngle = THREE.MathUtils.lerp(p.leanAngle, targetLean, dt * 10);

    const stepZ = p.speed * dt;
    p.z += stepZ;
    p.totalDistance += stepZ;
    this.checkLapCrossing(p, dt);

    this.roadEnv.sunMesh.position.z = -p.z - 920;
    this.roadEnv.sunMesh.position.x = this.roadEnv.getCurveX(p.z + 400) * 0.35;

    if (this.dirLight) {
      const snappedZ = Math.round(p.z / 2) * 2;
      const cx = Math.round(this.roadEnv.getCurveX(snappedZ) / 2) * 2;
      const cy = Math.round(this.roadEnv.getElevationY(snappedZ) / 2) * 2;
      this.dirLight.position.set(cx + 40, cy + 90, -snappedZ + 50);
      this.dirLight.target.position.set(cx, cy, -snappedZ);
      this.dirLight.target.updateMatrixWorld();
    }

    const currentMph = Math.round(p.speed / 0.6);
    if (currentMph > this.peakSpeedMph) {
      this.peakSpeedMph = currentMph;
    }

    if (p.yOffset > 0.3) {
      this.dom.statusBadge.textContent = '🦅 AIRBORNE STUNT!';
      this.dom.statusBadge.classList.remove('off-track');
    } else if (isOffRoad) {
      this.dom.statusBadge.textContent = '⚠️ OFF TRACK — SPEED PENALTY';
      this.dom.statusBadge.classList.add('off-track');
    } else if (nitroPressed) {
      this.dom.statusBadge.textContent = '⚡ NITRO OVERDRIVE';
      this.dom.statusBadge.classList.remove('off-track');
    } else if (isDrafting) {
      this.dom.statusBadge.textContent = '💨 SLIPSTREAM DRAFTING';
      this.dom.statusBadge.classList.remove('off-track');
    } else if (this.cameraMode === 1) {
      this.dom.statusBadge.textContent = '🎥 FPV COCKPIT VIEW';
      this.dom.statusBadge.classList.remove('off-track');
    } else {
      this.dom.statusBadge.textContent = '🛣️ ON ASPHALT';
      this.dom.statusBadge.classList.remove('off-track');
    }

    this.sound.updateEngine(currentMph, effectiveMaxMph, nitroPressed, dt, isOffRoad);
    this.updateRacerCombatAndLimbs(p, dt);
    this.syncRacerTransform(p);

    if (p.z >= this.trackSpec.lengthUnits) {
      this.advanceCircuitLap();
    }
  }

  private updateAIAndPolice(dt: number): void {
    const allAI: RacerEntity[] = [
      ...this.rivals,
      ...(this.policeUnit ? [this.policeUnit] : []),
    ];

    const playerMaxUnits = (this.bikeSpec.maxSpeedMph + (this.upgrades.engineLevel - 1) * 4) * 0.6;
    const guardrailLimit = ROAD_HALF_WIDTH + SHOULDER_WIDTH - 0.2;

    for (const ai of allAI) {
      if (ai.invulnTimer > 0) {
        ai.invulnTimer = Math.max(0, ai.invulnTimer - dt);
      }

      if (ai.wipedOut) {
        ai.wipeoutTimer -= dt;
        const stepZ = ai.speed * dt;
        ai.z += stepZ;
        ai.totalDistance += stepZ;
        if (!ai.isPolice) {
          this.checkLapCrossing(ai, dt);
        }
        ai.speed = Math.max(0, ai.speed - 38 * dt);
        if (ai.wipeoutTimer <= 0) {
          ai.wipedOut = false;
          ai.invulnTimer = 1.0;
          ai.hp = ai.maxHp;
          ai.bikeHp = ai.maxBikeHp;
          ai.vx = 0;
          ai.x = (Math.random() - 0.5) * (ROAD_HALF_WIDTH * 1.35);
          ai.targetX = ai.x;
        }
        this.syncRacerTransform(ai);
        continue;
      }

      const dzToPlayer = this.player.z - ai.z; // Positive when AI is BEHIND player, Negative when AI is AHEAD of player
      let desiredSpeed = ai.aiBaseSpeed;
      let aiUsingNitro = false;

      if (ai.isPolice) {
        // Highway Patrol Interceptor engages once the pack reaches him or catches up from behind
        if (dzToPlayer > 35) {
          desiredSpeed = Math.max(playerMaxUnits * 1.16, this.player.speed * 1.14 + 12);
          aiUsingNitro = true;
        } else if (dzToPlayer > 4) {
          desiredSpeed = Math.max(ai.aiBaseSpeed, this.player.speed * 1.04 + 6);
        } else if (dzToPlayer < -45) {
          // Police waits ahead at moderate patrol speed until player catches up
          desiredSpeed = Math.min(ai.aiBaseSpeed * 0.78, Math.max(38, this.player.speed * 0.82));
        } else {
          // Ride right beside the player to swing the Volt Baton!
          desiredSpeed = Math.max(48, this.player.speed + dzToPlayer * 0.65);
        }
      } else {
        // AI Rival Nitro Usage & Dynamic Catch-up:
        // Rivals use nitro periodically; when player pulls ahead (>35m), cooldown drains faster to catch up!
        ai.nitroCooldown -= dt;
        if (dzToPlayer > 35) {
          ai.nitroCooldown -= dt * 1.5; // Accelerate nitro readiness up to 2.5x when player leads
        }

        if (ai.nitroCooldown <= 0 && ai.speed > 25) {
          ai.nitroBoostTimer = 1.4 + Math.random() * 0.6;
          ai.nitroCooldown = 5.5 + Math.random() * 4.0;
        }

        if (ai.nitroBoostTimer > 0) {
          ai.nitroBoostTimer -= dt;
          aiUsingNitro = true;
        }

        // Realistic & Fun Rival Pack Pacing:
        // 1. When AI is AHEAD of the player (dzToPlayer <= 0):
        //    Top rivals (Viper, Razor) ride at their tiered aiBaseSpeed (1.05x, 1.03x player speed).
        //    If they pull far ahead (>75m), they ease off slightly so player can catch up with nitro!
        if (dzToPlayer < -140) {
          desiredSpeed = ai.aiBaseSpeed * 0.88;
        } else if (dzToPlayer < -75) {
          desiredSpeed = ai.aiBaseSpeed * 0.94;
        } else if (dzToPlayer <= 0) {
          desiredSpeed = aiUsingNitro ? ai.aiBaseSpeed * 1.08 : ai.aiBaseSpeed;
        } else if (dzToPlayer > 120) {
          // 2. When AI falls far BEHIND the player (dzToPlayer > 120):
          //    Draft + nitro catch-up so rivals remain in the fight
          desiredSpeed = Math.min(playerMaxUnits * 1.14, ai.aiBaseSpeed * 1.25);
          aiUsingNitro = true;
        } else if (dzToPlayer > 35) {
          // 3. Player leading by >35m: rivals use nitro to chase, capped under player's top nitro speed
          const chaseSpeed = Math.min(playerMaxUnits * 1.04, ai.aiBaseSpeed * 1.10);
          desiredSpeed = aiUsingNitro ? Math.min(playerMaxUnits * 1.14, ai.aiBaseSpeed * 1.18) : chaseSpeed;
        } else {
          // 4. Close behind or neck-and-neck:
          desiredSpeed = aiUsingNitro ? Math.min(playerMaxUnits * 1.08, ai.aiBaseSpeed * 1.12) : ai.aiBaseSpeed * 1.02;
        }
      }

      // Realistic motorcycle acceleration curve scaled by upgrade levels
      const aiAccelBonus = (this.upgrades.nitroLevel - 1) * 0.05 + (this.upgrades.engineLevel - 1) * 0.03;
      const baseAiAccel = (36 + ai.aiAggression * 14) * (1 + aiAccelBonus);
      const aiAccel = baseAiAccel * (aiUsingNitro ? 1.45 : 1.0);

      if (ai.speed < desiredSpeed) {
        ai.speed = Math.min(desiredSpeed, ai.speed + aiAccel * dt);
      } else {
        ai.speed = THREE.MathUtils.lerp(ai.speed, desiredSpeed, dt * 2.8);
      }

      // Show twin nitro exhaust flames when AI bikers engage catch-up boost
      const flameMatL = ai.flameMeshLeft.material as THREE.MeshBasicMaterial;
      const flameMatR = ai.flameMeshRight.material as THREE.MeshBasicMaterial;
      flameMatL.opacity = aiUsingNitro ? 0.85 : 0.20;
      flameMatR.opacity = aiUsingNitro ? 0.85 : 0.20;
      if (aiUsingNitro) {
        const flicker = 1 + Math.random() * 0.35;
        ai.flameMeshLeft.scale.set(1, flicker, 1);
        ai.flameMeshRight.scale.set(1, flicker, 1);
        if (Math.abs(dzToPlayer) < 55) {
          this.particleSystem.spawnNitroFlames(ai.mesh.position, this.roadEnv.getCurveYaw(ai.z), 1);
        }
      }

      ai.aiLaneTimer -= dt;
      if (ai.aiLaneTimer <= 0 && ai.staggerTimer <= 0) {
        if (ai.isPolice) {
          ai.aiLaneTimer = 0.65 + Math.random() * 0.75;
          if (Math.abs(dzToPlayer) < 42) {
            const flankSide = ai.x < this.player.x ? -2.2 : 2.2;
            ai.targetX = THREE.MathUtils.clamp(
              this.player.x + flankSide,
              -ROAD_HALF_WIDTH + 1.5,
              ROAD_HALF_WIDTH - 1.5
            );
          } else {
            ai.targetX = (Math.random() - 0.5) * (ROAD_HALF_WIDTH * 1.4);
          }
        } else {
          ai.aiLaneTimer = 1.2 + Math.random() * 2.0;
          if (Math.abs(dzToPlayer) < 28 && Math.random() < ai.aiAggression * 0.65) {
            const flankSide = ai.x < this.player.x ? -2.4 : 2.4;
            ai.targetX = THREE.MathUtils.clamp(
              this.player.x + flankSide,
              -ROAD_HALF_WIDTH + 1.5,
              ROAD_HALF_WIDTH - 1.5
            );
          } else {
            ai.targetX = (Math.random() - 0.5) * (ROAD_HALF_WIDTH * 1.5);
          }
        }
      }

      // Only allow AI to self-steer when not staggered from a player weapon/kick shove!
      let steerDir = 0;
      if (ai.staggerTimer <= 0) {
        const diffX = ai.targetX - ai.x;
        steerDir = Math.abs(diffX) > 0.35 ? Math.sign(diffX) : 0;
        const steerSpeed = ai.isPolice ? 16.5 : 13.5;
        ai.x += steerDir * steerSpeed * dt;
      }

      // Apply physical lateral velocity from kicks, weapon hits & bike bumps
      ai.x += ai.vx * dt;
      ai.vx = THREE.MathUtils.lerp(ai.vx, 0, dt * (ai.staggerTimer > 0 ? 3.2 : 5.5));

      const targetLean = steerDir * 0.36;
      ai.leanAngle = THREE.MathUtils.lerp(ai.leanAngle, targetLean, dt * 8);

      const stepZ = ai.speed * dt;
      ai.z += stepZ;
      ai.totalDistance += stepZ;
      ai.lap = Math.min(
        this.totalLaps,
        Math.max(1, Math.floor(ai.totalDistance / this.trackSpec.lengthUnits) + 1)
      );
      if (!ai.isPolice) {
        this.checkLapCrossing(ai, dt);
      }

      // Check if AI biker is off-track on the dirt shoulder
      if (Math.abs(ai.x) > ROAD_HALF_WIDTH) {
        ai.speed = Math.max(28, ai.speed - 38 * dt);
        if (ai.staggerTimer <= 0) {
          ai.targetX = THREE.MathUtils.clamp(
            ai.targetX,
            -ROAD_HALF_WIDTH + 1.8,
            ROAD_HALF_WIDTH - 1.8
          );
        }
      }

      // Check if AI biker was shoved into the outer Steel Highway Guardrail!
      if (Math.abs(ai.x) >= guardrailLimit) {
        const railSign = Math.sign(ai.x);
        ai.x = railSign * guardrailLimit;
        if (ai.lastHitByPlayerTimer > 0 && (Math.abs(ai.vx) > 7.5 || ai.staggerTimer > 0)) {
          this.particleSystem.spawnSparks(
            ai.mesh.position.x + railSign * 0.5,
            ai.mesh.position.y + 0.8,
            ai.mesh.position.z,
            0xffbe0b,
            24,
            18
          );
          ai.hp -= 45;
          this.triggerWipeout(ai, this.player, 'SHOVED INTO GUARDRAIL:');
          continue;
        } else {
          ai.vx = -railSign * 6;
          ai.targetX = 0;
        }
      }

      // 1. Proactive Traffic Avoidance: AI smoothly steers around civilian traffic when riding unhindered
      if (ai.staggerTimer <= 0 && Math.abs(ai.vx) < 4.5) {
        for (const car of this.traffic) {
          const dz = car.z - ai.z;
          const isClosing = car.oncoming ? (dz > 0 && dz < 44) : (dz > 0 && dz < 32);
          if (isClosing && Math.abs(car.x - ai.x) < car.width * 0.5 + 1.25) {
            const evadeDir = ai.x >= car.x ? 1 : -1;
            ai.targetX = THREE.MathUtils.clamp(
              car.x + evadeDir * (car.width * 0.5 + 2.2),
              -ROAD_HALF_WIDTH + 1.2,
              ROAD_HALF_WIDTH - 1.2
            );
            break;
          }
        }
      }

      // 2. Physical Traffic Collision: Check if AI biker was shoved into Civilian Traffic (Car / Semi-Truck)!
      let crashedIntoTraffic = false;
      for (const car of this.traffic) {
        const dzCar = Math.abs(car.z - ai.z);
        const dxCar = Math.abs(car.x - ai.x);
        if (dzCar < car.length * 0.5 + 0.85 && dxCar < car.width * 0.48 + 0.5) {
          if (ai.lastHitByPlayerTimer > 0 || ai.staggerTimer > 0 || Math.abs(ai.vx) > 5.0) {
            this.triggerWipeout(
              ai,
              this.player,
              car.type === 'truck' ? 'SMASHED INTO SEMI-TRUCK:' : 'SHOVED INTO TRAFFIC:'
            );
            crashedIntoTraffic = true;
            break;
          } else {
            // Normal AI minor evasion bump when not staggered
            ai.x += (ai.x >= car.x ? 1 : -1) * 16 * dt;
          }
        }
      }
      if (crashedIntoTraffic) continue;

      // Active AI & Police Melee Combat when alongside the player
      const distToPlayer = Math.hypot(ai.z - this.player.z, ai.x - this.player.x);
      const attackRange = WEAPONS[ai.weapon].range * (ai.isPolice ? 1.05 : 0.95);
      if (
        !this.player.wipedOut &&
        ai.staggerTimer <= 0 &&
        distToPlayer < attackRange &&
        Math.abs(ai.z - this.player.z) < 2.8
      ) {
        const strikeRate = ai.isPolice ? 2.4 : ai.aiAggression * 0.85;
        if (ai.attackCooldown <= 0 && Math.random() < strikeRate * dt) {
          const isLeft = this.player.x < ai.x;
          const useKick = !ai.isPolice && Math.random() < 0.25;
          const side: AttackSide = useKick
            ? isLeft
              ? 'kick-left'
              : 'kick-right'
            : isLeft
            ? 'left'
            : 'right';
          this.triggerAttack(ai, side);
        }
      }

      // Animate Police Interceptor Strobe Beacons & PointLights
      if (ai.isPolice && ai.sirenLightRed && ai.sirenLightBlue) {
        const flash = Math.sin(performance.now() * 0.022) > 0;
        ai.sirenLightRed.intensity = flash ? 4.2 : 0.25;
        ai.sirenLightBlue.intensity = flash ? 0.25 : 4.2;
        if (ai.policeStrobeMeshes && ai.policeStrobeMeshes.length >= 4) {
          ai.policeStrobeMeshes[0].scale.setScalar(flash ? 1.28 : 0.82);
          ai.policeStrobeMeshes[1].scale.setScalar(flash ? 0.82 : 1.28);
          ai.policeStrobeMeshes[2].scale.setScalar(flash ? 1.25 : 0.85);
          ai.policeStrobeMeshes[3].scale.setScalar(flash ? 0.85 : 1.25);
        }
      }

      this.updateRacerCombatAndLimbs(ai, dt);
      this.syncRacerTransform(ai);
    }

    // Subtle edge siren glow & audio blip when Police Interceptor is close (NO center banner!)
    if (
      this.policeUnit &&
      !this.policeUnit.wipedOut &&
      Math.abs(this.policeUnit.z - this.player.z) < 62
    ) {
      this.dom.policeSirenOverlay.style.opacity = '0.55';
      if (!this.policePursuitAnnounced) {
        this.policePursuitAnnounced = true;
        this.addCombatFeed("🚨 OFFICER O'CONNOR INTERCEPTING — WATCH FOR VOLT BATON STRIKES!");
      }
      this.sirenTimer -= dt;
      if (this.sirenTimer <= 0) {
        this.sirenTimer = 1.1;
        this.sound.playSirenBlip();
      }
    } else {
      this.dom.policeSirenOverlay.style.opacity = '0';
      if (this.policeUnit && Math.abs(this.policeUnit.z - this.player.z) > 95) {
        this.policePursuitAnnounced = false;
      }
    }
  }

  private updateTrafficAndPickups(dt: number): void {
    const armorDefense = this.bikeSpec.armorMult * (1 + (this.upgrades.armorLevel - 1) * 0.2);

    for (let i = 0; i < this.traffic.length; i++) {
      const car = this.traffic[i];

      // 1. Move vehicle longitudinally
      car.z += car.speed * dt;
      for (const w of car.wheels) {
        w.rotation.x -= car.speed * dt * 0.9;
      }

      // 2. Anti-tailgating & speed matching (forward traffic matching lead car)
      if (!car.oncoming) {
        let leadCar: TrafficVehicle | null = null;
        let minAheadDist = Infinity;

        for (let j = 0; j < this.traffic.length; j++) {
          if (i === j) continue;
          const other = this.traffic[j];
          if (other.laneIndex === car.laneIndex && other.z > car.z) {
            const dz = other.z - car.z;
            if (dz < 38 && dz < minAheadDist) {
              minAheadDist = dz;
              leadCar = other;
            }
          }
        }

        if (leadCar) {
          car.isBraking = true;
          const targetSpeed = Math.min(car.baseSpeed, leadCar.speed * 0.96);
          car.speed = THREE.MathUtils.lerp(car.speed, targetSpeed, dt * 3.2);
        } else {
          car.isBraking = false;
          car.speed = THREE.MathUtils.lerp(car.speed, car.baseSpeed, dt * 1.5);
        }

        // Taillight brake glow visual feedback
        if (car.rearLightMat) {
          car.rearLightMat.emissiveIntensity = car.isBraking ? 4.2 : 1.4;
        }

        // 3. Smart lane changes for forward cars (Sedans & Sports)
        if (car.type !== 'truck' && !car.isBraking) {
          car.laneChangeTimer -= dt;
          if (car.laneChangeTimer <= 0) {
            car.laneChangeTimer = 7.0 + Math.random() * 8.0;

            let candLane = -1;
            if (car.laneIndex === 4) {
              candLane = 3;
            } else if (car.laneIndex === 3) {
              candLane = Math.random() < 0.2 ? LANE_CENTER_INDEX : 4;
            } else if (car.laneIndex === LANE_CENTER_INDEX) {
              candLane = 3; // return to cruising lane
            }

            if (candLane >= 2 && candLane <= 4 && candLane !== car.laneIndex) {
              const dzPlayer = Math.abs(car.z - this.player.z);
              let laneClear = dzPlayer > 45;

              if (laneClear) {
                for (let j = 0; j < this.traffic.length; j++) {
                  if (i === j) continue;
                  const other = this.traffic[j];
                  if (other.laneIndex === candLane && Math.abs(other.z - car.z) < 45) {
                    laneClear = false;
                    break;
                  }
                  if (Math.abs(other.laneIndex - candLane) === 1 && Math.abs(other.z - car.z) < 38) {
                    laneClear = false;
                    break;
                  }
                }
              }

              if (laneClear) {
                car.laneIndex = candLane;
                car.targetX = HIGHWAY_LANES[candLane];
                car.isChangingLanes = true;
              }
            }
          }
        }

        // Smooth lateral steering
        if (car.isChangingLanes) {
          car.x = THREE.MathUtils.lerp(car.x, car.targetX, dt * 1.8);
          if (Math.abs(car.x - car.targetX) < 0.08) {
            car.x = car.targetX;
            car.isChangingLanes = false;
          }
        } else {
          car.x = THREE.MathUtils.lerp(car.x, car.targetX, dt * 3.5);
        }
      }

      // 4. Intelligent recycling with Guaranteed Solvable Slot Solver
      const needsRecycle = car.oncoming
        ? car.z < this.player.z - 90
        : car.z < this.player.z - 90 || car.z > this.player.z + 650;

      if (needsRecycle) {
        const minZ = this.player.z + 320;
        const maxZ = this.player.z + 520;
        const slot = this.findValidTrafficSlot(car.type, car.oncoming, minZ, maxZ, car);

        car.z = slot.z;
        car.x = slot.x;
        car.targetX = slot.x;
        car.laneIndex = slot.laneIndex;
        car.speed = slot.speed;
        car.baseSpeed = slot.speed;
        car.isBraking = false;
        car.isChangingLanes = false;
      }

      // 5. Update 3D Mesh Transform to Track Geometry
      const cx = this.roadEnv.getCurveX(car.z);
      const cy = this.roadEnv.getElevationY(car.z);
      const yaw = this.roadEnv.getCurveYaw(car.z);
      const pitch = this.roadEnv.getPitchAngle(car.z);

      car.mesh.position.set(cx + car.x, cy, -car.z);
      car.mesh.rotation.set(pitch, -yaw, 0);

      // 6. Player Collision with Traffic
      if (!this.player.wipedOut && this.player.invulnTimer <= 0 && this.player.yOffset < 1.3) {
        const dz = Math.abs(car.z - this.player.z);
        const dx = Math.abs(car.x - this.player.x);
        if (dz < car.length * 0.5 + 0.95 && dx < car.width * 0.48 + 0.55) {
          this.player.bikeHp = Math.max(0, this.player.bikeHp - 22 / armorDefense);
          this.player.hp = Math.max(0, this.player.hp - 14 / armorDefense);

          // Recycle car far ahead so player doesn't instantly re-collide upon standing up
          const slot = this.findValidTrafficSlot(
            car.type,
            car.oncoming,
            this.player.z + 380,
            this.player.z + 560,
            car
          );
          car.z = slot.z;
          car.x = slot.x;
          car.targetX = slot.x;
          car.laneIndex = slot.laneIndex;
          car.speed = slot.speed;
          car.baseSpeed = slot.speed;
          car.isBraking = false;
          car.isChangingLanes = false;

          this.triggerWipeout(
            this.player,
            undefined,
            car.type === 'truck' ? 'SMASHED INTO SEMI-TRUCK:' : 'CRASHED INTO TRAFFIC:'
          );
        }
      }
    }

    for (const item of this.pickups) {
      if (item.collected) continue;
      const cx = this.roadEnv.getCurveX(item.z);
      const cy = this.roadEnv.getElevationY(item.z);
      item.mesh.position.set(cx + item.x, cy, -item.z);
      item.mesh.rotation.y += dt * 2.8;

      if (
        !this.player.wipedOut &&
        Math.abs(item.z - this.player.z) < 3.8 &&
        Math.abs(item.x - this.player.x) < 2.8
      ) {
        item.collected = true;
        item.mesh.position.set(0, -500, 0);
        this.sound.playPickup();
        this.particleSystem.spawnSparks(
          cx + item.x,
          cy + 1.0,
          -item.z,
          0x00ff88,
          14,
          15
        );

        if (item.type === 'nitro') {
          this.player.nitro = Math.min(100, this.player.nitro + 65);
          const playerMaxUnits = (this.bikeSpec.maxSpeedMph + (this.upgrades.engineLevel - 1) * 4) * 0.6;
          const instantSuperSpeed = playerMaxUnits * 1.28 * 1.10;
          this.player.speed = Math.max(this.player.speed, instantSuperSpeed);
          this.screenShake = 0.35;
          this.sound.playNitroBurst(true);
          this.particleSystem.spawnNitroFlames(
            this.player.mesh.position,
            this.roadEnv.getCurveYaw(this.player.z),
            8
          );
          this.showCallout('🚀 SUPER NITRO! +65% TANK');
          this.addCombatFeed('⚡ COLLECTED NITRO — INSTANT BOOST SURGE & +65% TANK!');
        } else if (item.type === 'repair') {
          this.player.hp = Math.min(100, this.player.hp + 35);
          this.player.bikeHp = Math.min(100, this.player.bikeHp + 45);
          this.showCallout('🔧 BIKE REPAIRED!');
          this.addCombatFeed('🔧 PICKED UP WRENCH REPAIR TOOL (+45% INTEGRITY)');
        } else if (item.type === 'cash') {
          this.cash += CASH_PICKUP_VALUE;
          this.raceCashEarned += CASH_PICKUP_VALUE;
          this.racePickupsStunts += CASH_PICKUP_VALUE;
          this.showCallout(`💵 +$${CASH_PICKUP_VALUE} CASH!`);
          this.addCombatFeed(`💵 GRABBED $${CASH_PICKUP_VALUE} HIGHWAY CASH STASH!`);
        } else if (item.type === 'weapon' && item.weaponType) {
          this.equipWeapon(this.player, item.weaponType);
          const wName = WEAPONS[item.weaponType].name;
          this.showCallout(`EQUIPPED ${wName}!`);
          this.addCombatFeed(`🔥 PICKED UP ${wName}!`);
        }
      }
    }
  }

  private updateParticles(dt: number): void {
    this.particleSystem.update(dt);
  }

  private updateCameras(dt: number): void {
    if (this.state === 'menu') {
      const t = performance.now() * 0.0005;
      const targetPos = this.player.mesh.position;
      const radius = 6.4;
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(
        targetPos.x + Math.sin(t) * radius,
        targetPos.y + 2.3 + Math.sin(t * 1.5) * 0.35,
        targetPos.z + Math.cos(t) * radius
      );
      this.camera.lookAt(targetPos.x, targetPos.y + 1.25, targetPos.z);
      return;
    }

    const p = this.player;
    const roadYaw = this.roadEnv.getCurveYaw(p.z);
    const roadPitch = this.roadEnv.getPitchAngle(p.z);
    const roadX = this.roadEnv.getCurveX(p.z);
    const roadY = this.roadEnv.getElevationY(p.z);

    p.riderBodyGroup.visible = this.cameraMode !== 1;

    let shakeX = 0;
    let shakeY = 0;
    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - dt * 2.8);
      const shakeAmt = this.screenShake * (this.cameraMode === 1 ? 0.22 : 0.45);
      shakeX = (Math.random() - 0.5) * shakeAmt;
      shakeY = (Math.random() - 0.5) * shakeAmt;
    }

    if (this.cameraMode === 1) {
      // MODE 1: TRUE FIRST-PERSON VIEW (FPV) COCKPIT CAMERA
      const bikeHeadingYaw = roadYaw + p.leanAngle * 0.22;
      const fwdX = Math.sin(bikeHeadingYaw);
      const fwdZ = -Math.cos(bikeHeadingYaw);

      const eyeLocalForward = 0.22;
      const eyeHeight = 1.72 + Math.cos(p.leanAngle) * 0.1;

      const camX = roadX + p.x + fwdX * eyeLocalForward - Math.sin(p.leanAngle) * 0.32 + shakeX;
      const camY = roadY + p.yOffset + eyeHeight + p.wheelieAngle * 0.35 + shakeY;
      const camZ = -p.z + fwdZ * eyeLocalForward;

      this.camera.position.set(camX, camY, camZ);

      this.camSmoothRoll = THREE.MathUtils.lerp(this.camSmoothRoll, -p.leanAngle * 0.52, dt * 12);
      this.camera.up.set(Math.sin(this.camSmoothRoll), Math.cos(this.camSmoothRoll), 0);

      const lookDist = 36;
      const lookPitchOffset = Math.tan(roadPitch + p.wheelieAngle * 0.8) * lookDist;
      const lookX = camX + fwdX * lookDist;
      const lookY = camY - 0.65 + lookPitchOffset;
      const lookZ = camZ + fwdZ * lookDist;

      this.camera.lookAt(lookX, lookY, lookZ);
    } else {
      // MODE 0 (CHASE CAM) & MODE 2 (WIDE ACTION CAM)
      const desiredDistZ = this.cameraMode === 0 ? 6.2 : 10.5;
      const desiredHeightY = this.cameraMode === 0 ? 2.65 : 4.4;
      const desiredLookY = this.cameraMode === 0 ? 1.55 : 1.85;

      this.camSmoothX = THREE.MathUtils.lerp(this.camSmoothX, p.x, dt * 14);
      this.camSmoothY = THREE.MathUtils.lerp(
        this.camSmoothY,
        roadY + p.yOffset + desiredHeightY,
        dt * 14
      );
      this.camSmoothDistZ = THREE.MathUtils.lerp(this.camSmoothDistZ, desiredDistZ, dt * 10);
      this.camSmoothLookY = THREE.MathUtils.lerp(
        this.camSmoothLookY,
        roadY + p.yOffset + desiredLookY,
        dt * 14
      );
      this.camSmoothRoll = THREE.MathUtils.lerp(this.camSmoothRoll, 0, dt * 10);

      this.camera.up.set(0, 1, 0);

      const targetX = roadX + this.camSmoothX;
      const targetZ = -p.z;

      this.camera.position.set(
        targetX - Math.sin(roadYaw) * this.camSmoothDistZ + shakeX,
        this.camSmoothY + shakeY,
        targetZ + Math.cos(roadYaw) * this.camSmoothDistZ
      );

      const lookAheadZ = targetZ - 16 * Math.cos(roadYaw);
      const lookAheadX = roadX + p.x + 16 * Math.sin(roadYaw);
      this.camera.lookAt(lookAheadX, this.camSmoothLookY, lookAheadZ);
    }

    const effectiveMaxMph = this.bikeSpec.maxSpeedMph + (this.upgrades.engineLevel - 1) * 4;
    const playerMph = this.player.speed / 0.6;
    const speedRatio = Math.min(1.2, playerMph / effectiveMaxMph);
    const isNitro = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) && this.player.nitro > 0;
    const baseFov = this.cameraMode === 1 ? 68 : 60;
    const targetFov = baseFov + speedRatio * 8 + (isNitro ? 4 : 0);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 6);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }

  /**
   * Projects 3D biker nameplates AFTER `updateCameras(dt)` and `camera.updateMatrixWorld(true)`
   * so projected screen coordinates match the current frame's 3D render 1:1 with zero flicker or lag,
   * and separates overlapping tags when bikers ride side-by-side.
   */
  private updateWorldLabels(): void {
    if (this.state !== 'racing' && this.state !== 'countdown') return;

    const allAI: RacerEntity[] = [
      ...this.rivals,
      ...(this.policeUnit ? [this.policeUnit] : []),
    ];

    interface VisibleTag {
      ai: RacerEntity;
      el: HTMLElement;
      sx: number;
      sy: number;
      dz: number;
    }

    const visibleTags: VisibleTag[] = [];
    const w = window.innerWidth;
    const h = window.innerHeight;

    for (const ai of allAI) {
      const el = this.labelElements.get(ai.id);
      if (!el) continue;

      const dz = ai.z - this.player.z;
      if (dz < -5 || dz > 78 || ai.wipedOut) {
        if (el.style.display !== 'none') el.style.display = 'none';
        continue;
      }

      this.staticProj.copy(ai.mesh.position);
      this.staticProj.y += ai.isPolice ? 3.15 : 2.92;
      this.staticProj.project(this.camera);

      if (this.staticProj.z > 1 || this.staticProj.z < -1) {
        if (el.style.display !== 'none') el.style.display = 'none';
        continue;
      }

      const sx = (this.staticProj.x * 0.5 + 0.5) * w;
      const sy = (-this.staticProj.y * 0.5 + 0.5) * h;

      if (sx < -80 || sx > w + 80 || sy < -40 || sy > h + 40) {
        if (el.style.display !== 'none') el.style.display = 'none';
        continue;
      }

      visibleTags.push({ ai, el, sx, sy, dz });
    }

    // Sort closest-first so closer bikers keep their exact anchor and farther overlapping tags stack cleanly above
    visibleTags.sort((a, b) => a.dz - b.dz);

    for (let i = 0; i < visibleTags.length; i++) {
      const cur = visibleTags[i];
      for (let j = 0; j < i; j++) {
        const prev = visibleTags[j];
        const dx = Math.abs(cur.sx - prev.sx);
        const dy = Math.abs(cur.sy - prev.sy);
        if (dx < 92 && dy < 32) {
          cur.sy = prev.sy - 32;
        }
      }

      // Snap to integer device pixels to prevent subpixel text shimmer
      const px = Math.round(cur.sx);
      const py = Math.round(cur.sy);

      if (cur.el.style.display !== 'block') cur.el.style.display = 'block';
      cur.el.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -100%)`;

      const fill = cur.el.querySelector('.rival-tag-fill') as HTMLElement | null;
      if (fill) {
        const hpStr = `${Math.round(cur.ai.hp)}%`;
        if (fill.style.width !== hpStr) fill.style.width = hpStr;
      }
    }
  }

  private updateHUD(): void {
    const p = this.player;
    const speedMph = Math.round(p.speed / 0.6);

    let rank = 1;
    for (const r of this.rivals) {
      if (r.z > p.z) rank++;
    }

    this.dom.hudPos.textContent = String(rank);
    if (this.dom.hudLap) {
      this.dom.hudLap.textContent = `LAP ${p.lap}/${this.totalLaps}`;
    }
    this.dom.hudCash.textContent = this.cash.toLocaleString();
    this.dom.hudKos.textContent = String(this.knockdowns);
    this.dom.hudTopSpeed.textContent = String(this.peakSpeedMph);

    const totalRaceUnits = this.trackSpec.lengthUnits * this.totalLaps;
    const currentRaceUnits = (p.lap - 1) * this.trackSpec.lengthUnits + p.z;
    const pct = Math.min(100, Math.max(0, (currentRaceUnits / totalRaceUnits) * 100));
    this.dom.hudProgressFill.style.width = `${pct}%`;

    const totalMiles = (this.trackSpec.lengthMiles * this.totalLaps) / 3;
    const milesLeft = Math.max(0, totalMiles * (1 - pct / 100));
    this.dom.hudDistance.textContent = `${milesLeft.toFixed(1)} MI LEFT`;

    this.dom.hudPlayerHp.style.width = `${p.hp}%`;
    this.dom.hudPlayerHpText.textContent = `${Math.round(p.hp)}%`;
    this.dom.hudBikeHp.style.width = `${p.bikeHp}%`;
    this.dom.hudBikeHpText.textContent = `${Math.round(p.bikeHp)}%`;

    const wSpec = WEAPONS[p.weapon];
    this.dom.hudWeaponIcon.textContent = wSpec.icon;
    this.dom.hudWeaponName.textContent = wSpec.name;

    this.dom.hudSpeed.textContent = String(speedMph);
    const gear =
      speedMph < 5
        ? 'N'
        : String(Math.min(6, Math.max(1, Math.ceil((speedMph / this.bikeSpec.maxSpeedMph) * 6))));
    this.dom.hudGear.textContent = gear;

    if (this.state === 'racing') {
      const rpmPct =
        speedMph < 5 ? 12 : 25 + (((speedMph / this.bikeSpec.maxSpeedMph) * 6) % 1) * 75;
      this.dom.hudRpm.style.width = `${Math.min(100, rpmPct)}%`;
    }

    this.dom.hudNitro.style.width = `${p.nitro}%`;
    this.dom.hudNitroText.textContent = `${Math.round(p.nitro)}%`;

    this.dom.speedLines.style.opacity =
      speedMph > 135 ? String(Math.min(0.85, (speedMph - 135) / 70)) : '0';

    const prox = this.findProximityCombatSide(p);
    if (prox.target && prox.dist < 24) {
      const nearest = prox.target;
      const side = nearest.x >= p.x ? 'RIGHT ▶' : '◀ LEFT';
      const distInt = Math.round(prox.dist);
      const hudKey = `${nearest.id}_${side}_${distInt}_${Math.round(nearest.hp)}`;
      if (hudKey !== this.lastRivalHudKey) {
        this.lastRivalHudKey = hudKey;
        this.dom.rivalName.textContent = nearest.isPolice ? `🚨 ${nearest.name}` : nearest.name;
        this.dom.rivalWeapon.textContent = WEAPONS[nearest.weapon].icon;
        this.dom.rivalHp.style.width = `${nearest.hp}%`;
        this.dom.rivalDist.textContent = `${distInt}m ON YOUR ${side} — [SPACE] KICK / [Z/X] STRIKE!`;
        if (this.dom.hudWeaponHint) {
          this.dom.hudWeaponHint.textContent = `AUTO-TARGETING ${side} (${nearest.name})`;
        }
      }
    } else if (this.lastRivalHudKey !== 'none') {
      this.lastRivalHudKey = 'none';
      this.dom.rivalName.textContent = 'NO RIVAL IN RANGE';
      this.dom.rivalWeapon.textContent = '--';
      this.dom.rivalHp.style.width = '0%';
      this.dom.rivalDist.textContent = 'Shove bikers into cars or guardrails for instant KOs!';
      if (this.dom.hudWeaponHint) {
        this.dom.hudWeaponHint.textContent = '[Z/X/F] Auto-Side Strike • [SPACE] Auto L/R Kick';
      }
    }

    this.renderRearRadar();
  }

  private renderRearRadar(): void {
    const ctx = this.radarCtx;
    const w = this.radarCanvas.width;
    const h = this.radarCanvas.height;

    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    const mapX = (lateralX: number) => w / 2 + (lateralX / ROAD_HALF_WIDTH) * (w * 0.42);
    const mapY = (dz: number) => h / 2 - (dz / 85) * (h * 0.44);

    for (const car of this.traffic) {
      const dz = car.z - this.player.z;
      if (Math.abs(dz) < 85) {
        // Red for oncoming traffic, amber for semi-trucks, slate-cyan for forward sedans/sports
        ctx.fillStyle = car.oncoming ? '#f43f5e' : car.type === 'truck' ? '#f59e0b' : '#38bdf8';
        const carW = car.type === 'truck' ? 7 : 5;
        const carH = car.type === 'truck' ? 7 : 5;
        ctx.fillRect(mapX(car.x) - carW / 2, mapY(dz) - carH / 2, carW, carH);
      }
    }

    for (const r of this.rivals) {
      const dz = r.z - this.player.z;
      if (Math.abs(dz) < 85) {
        ctx.fillStyle = '#' + r.primaryColor.toString(16).padStart(6, '0');
        ctx.beginPath();
        ctx.arc(mapX(r.x), mapY(dz), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (this.policeUnit) {
      const dz = this.policeUnit.z - this.player.z;
      if (Math.abs(dz) < 85) {
        ctx.fillStyle = Math.sin(performance.now() * 0.02) > 0 ? '#ff1744' : '#0088ff';
        ctx.beginPath();
        ctx.arc(mapX(this.policeUnit.x), mapY(dz), 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = '#00ff88';
    ctx.beginPath();
    ctx.arc(mapX(this.player.x), h / 2, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderRearViewMirror(): void {
    if (this.state !== 'racing' && this.state !== 'countdown') return;
    if (!this.mirrorCtx || !this.mirrorCanvas) return;

    const w = this.mirrorCanvas.width;
    const h = this.mirrorCanvas.height;

    if (this.rearMirrorMode === 'off') {
      if (this.dom.rearMirrorFrame) this.dom.rearMirrorFrame.style.opacity = '0.35';
      this.mirrorCtx.fillStyle = '#060810';
      this.mirrorCtx.fillRect(0, 0, w, h);
      this.mirrorCtx.fillStyle = '#556677';
      this.mirrorCtx.font = '10px "Orbitron", sans-serif';
      this.mirrorCtx.textAlign = 'center';
      this.mirrorCtx.fillText('TACTICAL CAM OFF', w / 2, h / 2 + 4);
      return;
    }

    if (this.dom.rearMirrorFrame) this.dom.rearMirrorFrame.style.opacity = '1.0';

    if (this.rearMirrorMode === 'eco' && this.frameCount % 2 !== 0) return;

    const ctx = this.mirrorCtx;
    ctx.clearRect(0, 0, w, h);

    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.45);
    skyGrad.addColorStop(0, '#040711');
    skyGrad.addColorStop(1, '#0e182a');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h * 0.45);

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.45);
    ctx.lineTo(w, h * 0.45);
    ctx.stroke();

    const groundGrad = ctx.createLinearGradient(0, h * 0.45, 0, h);
    groundGrad.addColorStop(0, '#101520');
    groundGrad.addColorStop(1, '#0a0d14');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, h * 0.45, w, h * 0.55);

    const roadHalfW = ROAD_HALF_WIDTH;
    const horizonY = h * 0.42;
    const cx = w / 2;

    ctx.fillStyle = '#161d2d';
    ctx.beginPath();
    ctx.moveTo(cx - 18, horizonY);
    ctx.lineTo(cx + 18, horizonY);
    ctx.lineTo(w * 0.95, h);
    ctx.lineTo(w * 0.05, h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 18, horizonY);
    ctx.lineTo(w * 0.05, h);
    ctx.moveTo(cx + 18, horizonY);
    ctx.lineTo(w * 0.95, h);
    ctx.stroke();

    const dashOffset = (this.player.z * 1.5) % 16;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -dashOffset;
    ctx.beginPath();
    ctx.moveTo(cx, horizonY);
    ctx.lineTo(cx, h);
    ctx.stroke();
    ctx.setLineDash([]);

    const MAX_MIRROR_DIST = 90;
    let threatAlert: { text: string; color: string } | null = null;
    let closestBehindDist = Infinity;

    interface MirrorEntity {
      x: number;
      distZ: number;
      type: 'police' | 'rival' | 'traffic';
      name?: string;
      color: string;
    }

    const entitiesBehind: MirrorEntity[] = [];

    if (this.policeUnit && !this.policeUnit.wipedOut) {
      const distZ = this.player.z - this.policeUnit.z;
      if (distZ > 0 && distZ < MAX_MIRROR_DIST) {
        entitiesBehind.push({
          x: this.policeUnit.x,
          distZ,
          type: 'police',
          color: '#ff0033',
        });
        if (distZ < closestBehindDist) closestBehindDist = distZ;
        threatAlert = { text: `🚨 POLICE PURSUIT [${Math.round(distZ)}m]`, color: '#ff0044' };
      }
    }

    for (const r of this.rivals) {
      if (r.wipedOut) continue;
      const distZ = this.player.z - r.z;
      if (distZ > 0 && distZ < MAX_MIRROR_DIST) {
        entitiesBehind.push({
          x: r.x,
          distZ,
          type: 'rival',
          name: r.name,
          color: '#' + (r.primaryColor || 0x00f0ff).toString(16).padStart(6, '0'),
        });
        if (distZ < closestBehindDist) {
          closestBehindDist = distZ;
          if (!threatAlert) {
            threatAlert = { text: `⚠️ ${r.name} CLOSING [${Math.round(distZ)}m]`, color: '#ffb703' };
          }
        }
      }
    }

    for (const t of this.traffic) {
      if (t.oncoming) continue;
      const distZ = this.player.z - t.z;
      if (distZ > 0 && distZ < MAX_MIRROR_DIST * 0.7) {
        entitiesBehind.push({
          x: t.x,
          distZ,
          type: 'traffic',
          color: t.type === 'truck' ? '#f59e0b' : t.type === 'sports' ? '#ef4444' : '#64748b',
        });
      }
    }

    entitiesBehind.sort((a, b) => b.distZ - a.distZ);

    for (const ent of entitiesBehind) {
      const normDist = THREE.MathUtils.clamp(1.0 - ent.distZ / MAX_MIRROR_DIST, 0.05, 1.0);
      const deltaX = -(ent.x - this.player.x);
      const entY = horizonY + (h - horizonY - 6) * Math.pow(normDist, 1.3);
      const spreadX = cx + (deltaX / (roadHalfW * 1.3)) * (w * 0.42) * normDist;

      if (ent.type === 'police') {
        const strobe = Math.floor(performance.now() / 80) % 2 === 0;
        const size = Math.max(6, 18 * normDist);

        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(spreadX - size, entY - size * 0.6, size * 2, size * 0.8);

        ctx.fillStyle = strobe ? '#ff0044' : '#0066ff';
        ctx.beginPath();
        ctx.arc(spreadX - size * 0.45, entY - size * 0.7, Math.max(2, size * 0.28), 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = strobe ? '#0066ff' : '#ff0044';
        ctx.beginPath();
        ctx.arc(spreadX + size * 0.45, entY - size * 0.7, Math.max(2, size * 0.28), 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fffbe0';
        ctx.beginPath();
        ctx.arc(spreadX - size * 0.6, entY, Math.max(1.5, size * 0.2), 0, Math.PI * 2);
        ctx.arc(spreadX + size * 0.6, entY, Math.max(1.5, size * 0.2), 0, Math.PI * 2);
        ctx.fill();
      } else if (ent.type === 'rival') {
        const size = Math.max(5, 15 * normDist);
        ctx.fillStyle = ent.color;
        ctx.beginPath();
        ctx.ellipse(spreadX, entY - size * 0.3, size * 0.5, size * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(spreadX - size * 0.25, entY - size * 0.1, Math.max(1.5, size * 0.18), 0, Math.PI * 2);
        ctx.arc(spreadX + size * 0.25, entY - size * 0.1, Math.max(1.5, size * 0.18), 0, Math.PI * 2);
        ctx.fill();
      } else {
        const size = Math.max(4, 14 * normDist);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(spreadX - size, entY - size * 0.4, size * 2, size * 0.6);
        ctx.fillStyle = '#ff1122';
        ctx.fillRect(spreadX - size * 0.9, entY - size * 0.2, size * 0.4, size * 0.25);
        ctx.fillRect(spreadX + size * 0.5, entY - size * 0.2, size * 0.4, size * 0.25);
      }
    }

    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, 12);
    ctx.lineTo(4, 4);
    ctx.lineTo(12, 4);
    ctx.moveTo(w - 12, 4);
    ctx.lineTo(w - 4, 4);
    ctx.lineTo(w - 4, 12);
    ctx.moveTo(4, h - 12);
    ctx.lineTo(4, h - 4);
    ctx.lineTo(12, h - 4);
    ctx.moveTo(w - 12, h - 4);
    ctx.lineTo(w - 4, h - 4);
    ctx.lineTo(w - 4, h - 12);
    ctx.stroke();

    ctx.font = '8px "Orbitron", monospace';
    ctx.textAlign = 'center';
    if (threatAlert) {
      ctx.fillStyle = threatAlert.color;
      ctx.fillText(threatAlert.text, cx, h - 5);
    } else {
      ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
      ctx.fillText('CLEAR BEHIND // TACTICAL SECURE', cx, h - 5);
    }
  }

  private updatePerformanceMonitor(now: number, dt: number): void {
    this.frameCount++;
    this.fpsFrames++;

    if (now - this.lastFpsUpdate >= 250) {
      const elapsed = (now - this.lastFpsUpdate) / 1000;
      const currentFps = Math.round(this.fpsFrames / elapsed);
      const frameMs = (dt * 1000).toFixed(1);

      this.fpsFrames = 0;
      this.lastFpsUpdate = now;

      if (this.dom.perfFps) {
        this.dom.perfFps.textContent = `${currentFps} FPS`;
        this.dom.perfFps.className =
          'perf-badge-fps ' +
          (currentFps >= 55 ? '' : currentFps >= 40 ? 'fps-yellow' : 'fps-red');
      }
      if (this.dom.perfMs) {
        this.dom.perfMs.textContent = `${frameMs} ms`;
      }

      if (this.fpsDetailed && this.dom.perfDetails && !this.dom.perfDetails.classList.contains('hidden')) {
        const renderInfo = this.renderer.info.render as any;
        const memInfo = this.renderer.info.memory as any;
        const calls = renderInfo?.drawCalls ?? renderInfo?.calls ?? 0;
        const tris = renderInfo?.triangles ?? 0;
        this.dom.perfCalls.textContent = String(calls);
        this.dom.perfTris.textContent = tris >= 1000 ? `${(tris / 1000).toFixed(1)}k` : String(tris);
        this.dom.perfGeos.textContent = String(memInfo?.geometries ?? 0);
        this.dom.perfTex.textContent = String(memInfo?.textures ?? 0);
      }
    }
  }

  private addCombatFeed(msg: string): void {
    const feed = this.dom.combatFeed;
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.textContent = msg;
    feed.prepend(item);

    while (feed.children.length > 4) {
      feed.removeChild(feed.lastChild!);
    }

    setTimeout(() => {
      if (item.parentElement) item.remove();
    }, 4500);
  }

  private showCallout(text: string): void {
    const el = this.dom.comboCallout;
    el.textContent = text;
    el.classList.remove('hidden');
    setTimeout(() => {
      if (el.textContent === text) el.classList.add('hidden');
    }, 1150);
  }

  private flashDamageOverlay(): void {
    const el = this.dom.damageFlash;
    el.style.opacity = '1';
    setTimeout(() => {
      el.style.opacity = '0';
    }, 180);
  }

  private finishRace(completedTrack: boolean, failReason?: string): void {
    this.state = 'finished';
    this.sound.stopEngine();
    this.clearWorldLabels();
    this.setCountdownUI('hidden');

    const p = this.player;
    const pRec = this.racerLapRecords.get(p.id);

    if (completedTrack) {
      if (pRec) {
        pRec.finished = true;
        if (!pRec.totalTime || pRec.totalTime === 0) {
          pRec.totalTime = this.raceElapsed;
        }
        if (pRec.lapTimes.length < this.totalLaps) {
          const split = Math.max(0.1, this.raceElapsed - pRec.lastLapCrossingTime);
          pRec.lapTimes.push(split);
          pRec.lapTimestamps.push(this.raceElapsed);
          if (split < pRec.bestLap) pRec.bestLap = split;
        }
      }
    } else {
      if (pRec) {
        pRec.isDNF = true;
        pRec.totalTime = this.raceElapsed;
      }
    }

    // Finalize all remaining rival AI times
    for (const r of this.rivals) {
      const rRec = this.racerLapRecords.get(r.id);
      if (!rRec) continue;
      if (!rRec.finished) {
        const distLeft = Math.max(
          0,
          this.totalLaps * this.trackSpec.lengthUnits - r.totalDistance
        );
        const estSpeed = Math.max(25, r.speed);
        const addTime = Math.max(0.15, distLeft / estSpeed);
        const finalTime = this.raceElapsed + addTime;
        const lastSplit = Math.max(0.1, finalTime - rRec.lastLapCrossingTime);

        while (rRec.lapTimes.length < this.totalLaps - 1) {
          const simSplit = isFinite(rRec.bestLap) ? rRec.bestLap : 55;
          rRec.lapTimes.push(simSplit);
          rRec.lapTimestamps.push(finalTime - lastSplit);
        }
        rRec.lapTimes.push(lastSplit);
        rRec.lapTimestamps.push(finalTime);
        rRec.totalTime = finalTime;
        rRec.finished = true;
        if (lastSplit < rRec.bestLap) rRec.bestLap = lastSplit;
      }
    }

    // Sort all records to determine official classification
    const allRecords = Array.from(this.racerLapRecords.values());
    allRecords.sort((a, b) => {
      if (a.isDNF && !b.isDNF) return 1;
      if (!a.isDNF && b.isDNF) return -1;
      if (a.isDNF && b.isDNF) {
        if (a.lapTimes.length !== b.lapTimes.length) return b.lapTimes.length - a.lapTimes.length;
        return b.prevDistance - a.prevDistance;
      }
      return a.totalTime - b.totalTime;
    });

    // Ensure fastest lap of the race is resolved across all recorded laps
    for (const rec of allRecords) {
      rec.lapTimes.forEach((split, lIdx) => {
        if (!this.fastestLapRecord || split < this.fastestLapRecord.time) {
          this.fastestLapRecord = {
            racerName: rec.name,
            time: split,
            lap: lIdx + 1,
            isPlayer: rec.isPlayer,
          };
        }
      });
    }

    // Ensure lap leaders exist for all completed laps
    for (let lap = 1; lap <= this.totalLaps; lap++) {
      if (!this.lapLeaders[lap - 1]) {
        let earliestTimestamp = Infinity;
        let leaderRec: RacerLapRecord | null = null;
        for (const rec of allRecords) {
          const ts = rec.lapTimestamps[lap - 1];
          if (ts !== undefined && ts < earliestTimestamp) {
            earliestTimestamp = ts;
            leaderRec = rec;
          }
        }
        if (leaderRec && earliestTimestamp < Infinity) {
          this.lapLeaders[lap - 1] = {
            lap,
            racerId: leaderRec.id,
            racerName: leaderRec.name,
            isPlayer: leaderRec.isPlayer,
            splitTime: leaderRec.lapTimes[lap - 1],
            totalTimeAtCross: earliestTimestamp,
          };
        }
      }
    }

    allRecords.forEach((rec, idx) => {
      rec.finishPosition = idx + 1;
      rec.isFastestLapHolder =
        this.fastestLapRecord !== null && this.fastestLapRecord.racerName === rec.name;
    });

    const rank = pRec && !pRec.isDNF ? pRec.finishPosition : 12;
    const suffix = rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th';
    const prize = completedTrack
      ? rank === 1
        ? this.trackSpec.prizePurse
        : rank === 2
        ? Math.round(this.trackSpec.prizePurse * 0.5)
        : rank === 3
        ? Math.round(this.trackSpec.prizePurse * 0.25)
        : rank <= 6
        ? Math.round(this.trackSpec.prizePurse * 0.08)
        : 0
      : 0;

    this.racePursePrize = prize;
    this.raceCashEarned += prize;
    this.cash += prize;

    this.dom.resultOverlay.classList.remove('hidden');
    document.getElementById('result-badge')!.textContent = completedTrack
      ? `${this.trackSpec.name} (${this.totalLaps} LAPS) COMPLETE`
      : 'BIKE TOTALED';

    const titleEl = document.getElementById('result-title')!;
    const subEl = document.getElementById('result-subtitle')!;

    if (completedTrack && rank <= 3) {
      titleEl.textContent =
        rank === 1 ? '🏆 1ST PLACE VICTORY!' : `🔥 ${rank}${suffix} PLACE PODIUM!`;
      subEl.textContent = `You conquered ${this.totalLaps} laps of ${this.trackSpec.name} and earned a $${prize.toLocaleString()} purse!`;
      confetti({ particleCount: 110, spread: 80, origin: { y: 0.6 } });
    } else if (completedTrack) {
      titleEl.textContent = `FINISHED ${rank}${suffix}`;
      subEl.textContent =
        rank <= 6
          ? 'Solid top-half finish! Reinvest your prize purse in the garage.'
          : 'Outside prize positions! Upgrade your bike in the Garage and shove rivals into traffic to take 1st!';
    } else {
      titleEl.textContent = failReason || 'WRECKED!';
      subEl.textContent = 'Your superbike took too much punishment on the highway.';
    }

    document.getElementById('res-pos')!.textContent = completedTrack ? `${rank}${suffix}` : 'DNF';
    if (this.dom.resRaceCash) {
      this.dom.resRaceCash.textContent = `+$${this.raceCashEarned.toLocaleString()}`;
    }
    document.getElementById('res-cash')!.textContent = `$${this.cash.toLocaleString()}`;
    document.getElementById('res-kos')!.textContent = String(this.knockdowns);
    document.getElementById('res-speed')!.textContent = `${this.peakSpeedMph} MPH`;
    if (this.dom.resBreakdown) {
      this.dom.resBreakdown.textContent = `Purse: $${this.racePursePrize.toLocaleString()} • Bounties: $${this.raceBounties.toLocaleString()} • Pickups/Stunts: $${this.racePickupsStunts.toLocaleString()}`;
    }

    // Render Lap Leaders Bar, Player Lap Breakdown, and Full Standings Table
    this.renderLapLeadersBar();
    if (pRec) {
      const winnerRec = allRecords[0] || pRec;
      this.renderPlayerLapBreakdown(pRec, winnerRec);
    }
    this.renderStandingsTable(allRecords);

    // Default to player scorecard view
    this.toggleResultView('player');
  }

  private loop(now: number): void {
    requestAnimationFrame((t) => this.loop(t));

    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    try {
      if (this.state === 'countdown') {
        this.updateCountdown(dt);
        this.updateParticles(dt);
        this.updateHUD();
      } else if (this.state === 'racing') {
        this.raceElapsed += dt;
        this.updatePlayer(dt);
        if (this.state === 'racing') {
          this.updateAIAndPolice(dt);
          this.resolveBikeCollisions(dt);
          this.updateTrafficAndPickups(dt);
          this.updateParticles(dt);
          this.updateHUD();
        }
      }

      // Update camera BEFORE projecting 3D floating world labels so labels never lag or flicker!
      this.updateCameras(dt);
      this.updateWorldLabels();

      if (this.useBloom && this.postProcessing) {
        this.postProcessing.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }

      this.renderRearViewMirror();
      this.updatePerformanceMonitor(now, dt);
    } catch (err) {
      console.warn('Frame render warning:', err);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ArgonRoadRashGame();
});
