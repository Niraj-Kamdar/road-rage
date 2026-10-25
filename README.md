# 💀 ROADSCYTHE // The Live-Traffic Underground

[![Live Demo](https://img.shields.io/badge/Play_Live-roadscythe.netlify.app-00ffcc?style=for-the-badge&logo=netlify&logoColor=black)](https://roadscythe.netlify.app/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-red.svg?style=for-the-badge)](LICENSE)
[![Three.js](https://img.shields.io/badge/Three.js-r170-black?style=for-the-badge&logo=three.dot.js)](https://threejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=for-the-badge&logo=vite)](https://vitejs.dev/)

> **"Closed tracks are for amateurs. The real war happens in rush hour."**

**ROADSCYTHE** is a 3D motorcycle combat racing game built from scratch with Three.js, TypeScript, and WebGL/WebGPU. Inspired by 90s vehicular combat classics like *Road Rash*, it pits you against 12 ruthless outlaw bikers on live public arterial freeways packed with civilian commuter traffic, stunt ramps, and aggressive State Highway Patrol interceptors.

---

## 🎮 Play Instantly in Your Browser

No downloads, no installations, no plugins required:

👉 **[https://roadscythe.netlify.app/](https://roadscythe.netlify.app/)**

Runs on any modern browser with WebGL2 / WebGPU support on macOS, Windows, Linux, Android, and iOS.

---

## ⚡ Key Features

### 🏁 Starting Grid & RPM Launch Boost
- **3D Starting Gantry**: Fully animated start tower with countdown signals (`READY` 🔴 → `STEADY` 🟡 → `GO!` 🟢).
- **RPM Launch Boost**: Hold throttle before the green light to rev your tachometer to 9.5k+ RPM for an instant wheelie launch off the starting line.

### ⚔️ Proximity-Aware Melee Combat
- **Smart Directional Strikes (`Z` / `X` / `F`)**: Auto-detects whether an opponent is pulling up on your left or right flank and delivers a brutal strike with your equipped weapon.
- **Directional Shove-Kicks (`SPACE`)**: Hip-check and kick rival superbikes sideways into oncoming commercial trucks, civilian traffic, or concrete barriers.
- **Weapon Snatching & Drops**: Knock down aggressive rivals or dismount Highway Patrol officers to pick up their dropped weapons right off the asphalt.

### 🛣️ 3 High-Speed Arterial Circuits
1. **🌴 Pacific Coast Circuit** *(Tier 1 &bull; 3.5 mi)*: Coastal sunset sweepers, beachside palm groves, ocean vistas, stunt ramps, and lethal guardrails.
2. **🏜️ Sierra Canyon Loop** *(Tier 2 &bull; 4.5 mi)*: Rugged red-rock mountain pass, sharp chicanes, blind crests, and heavy oncoming logging trucks.
3. **🌃 Neon Metro Ringway** *(Tier 3 &bull; 5.5 mi)*: Nocturnal cyberpunk multi-lane freeway choked with rush-hour gridlock, commercial box-trucks, and highway patrol pursuit cruisers.

### 🏍️ Superbike Garage & Chop Shop Tuning
Choose and customize three distinct high-performance superbikes:
- **🔴 Argon Interceptor 750**: Balanced fighter frame with reliable cornering and high endurance.
- **🟢 Kawasaki Viper ZX-10R**: Lightweight aerodynamic speed demon capable of 212+ MPH and razor-sharp line changes.
- **🟣 Diablo Brawler 1200**: Heavy armored enforcer with a +42% melee impact bonus for devastating takedowns.

#### 🔧 Tiered Upgrade System
Upgrade 4 core bike components through **Tier 1 (Levels 1–5)** and unlock the **Tier 2 High-Performance Overhaul (Levels 6–10)**:
- **🚀 Bore & Stroke Tuning**: Increases top speed and high-RPM power band.
- **⚡ NOS Overdrive Injectors**: Boosts surge acceleration, nitro burn rate, and top-end torque.
- **🛡️ Tubular Crash Cages**: Shields bike integrity against civilian vehicle and truck collisions.
- **⚔️ Heavy Steel Weaponry**: Amplifies melee impact impulse, stun duration, and takedown damage.

### 🗡️ Street Weapons Arsenal
| Weapon | Damage | Range | Description |
| :--- | :---: | :---: | :--- |
| **👊 Titanium Knuckles** | 15 | 3.2m | Standard street brawling gloves with rapid recovery. |
| **🔧 Steel Crowbar** | 29 | 3.9m | Heavy leverage weapon capable of knocking riders off their bikes. |
| **⛓️ Heavy Iron Chain** | 35 | 4.4m | Extended reach weapon for whipping opponents from safe drafting distance. |
| **⚡ Police Volt Baton** | 42 | 4.1m | High-voltage tactical stun weapon dropped by Highway Patrol officers. |
| **🗡️ Plasma Katana** | 50 | 4.6m | Rare outlaw weapon delivering lethal one-shot strikes. |

### 🪞 Tactical Rear-View Mirror & Proximity Radar
- **Live 3D Rear-View Mirror**: Dedicated secondary rendering pipeline displaying tailing opponents, civilian traffic, and sirens behind you in real time.
- **Proximity Radar**: Overhead tactical display tracking opponent distance, police interceptors, and oncoming roadblocks.
- **FPV Helmet Cockpit View**: Toggle instantly between third-person chase cams and an authentic first-person visor view complete with handlebars and functional digital dash.

### 📻 Outlaw Radio & Tactical Police Scanner
- Live contextual radio comms featuring rival biker taunts, crash reactions, and Highway Patrol dispatch chatter (*"All units, suspect is splitting lanes at 150 MPH, authorized to ram!"*).

### 🔊 Procedural Web Audio Engine
- Built entirely with the native **Web Audio API**—zero external audio files required for core sound effects.
- Dynamic pitch-shifted motorcycle engines with realistic rev cycles, tire squeals, slipstream wind noise, collision crunches, siren doppler effects, and crowd reactions.

---

## 🕹️ Controls

| Action | Keyboard | Alternative / Notes |
| :--- | :--- | :--- |
| **Accelerate / Gas** | <kbd>W</kbd> | <kbd>↑</kbd> (Hold during countdown to rev engine) |
| **Brake / Reverse** | <kbd>S</kbd> | <kbd>↓</kbd> |
| **Steer Left / Right** | <kbd>A</kbd> / <kbd>D</kbd> | <kbd>←</kbd> / <kbd>→</kbd> |
| **Smart Proximity Strike** | <kbd>Z</kbd> / <kbd>X</kbd> / <kbd>F</kbd> | Auto-detects closest rival on left or right |
| **Smart Proximity Kick** | <kbd>SPACE</kbd> | Shoves adjacent bikes into traffic / guardrails |
| **Nitro Boost** | <kbd>Shift</kbd> | Rocket boost for passing and ramp jumps |
| **Camera View Toggle** | <kbd>C</kbd> / <kbd>V</kbd> | Cycles between Chase Cam and FPV Helmet Cockpit |
| **Highway Recovery / Reset** | <kbd>R</kbd> | Re-aligns bike onto centerline if stuck or off-road |
| **Tactical Comms Toggle** | <kbd>U</kbd> | Mute/unmute police scanner and biker chatter |
| **Audio Mute** | <kbd>M</kbd> | Toggles procedural sound engine |
| **Performance HUD** | <kbd>P</kbd> | Real-time FPS, frame latency, draw calls, and triangle counters |
| **Graphics Engine Mode** | <kbd>G</kbd> | Switch between WebGL2 and WebGPU backends |
| **Post-Process Bloom** | <kbd>B</kbd> | Toggle neon glow / crisp 4x MSAA mode |

---

## 🛠️ Tech Stack & Architecture

- **Rendering Engine**: [Three.js](https://threejs.org/) (r170) utilizing WebGL2 with experimental WebGPU support.
- **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict Mode).
- **Build System**: [Vite](https://vitejs.dev/) 6.
- **Audio**: Custom procedural synthesis engine built on the browser **Web Audio API**.
- **Effects**: Custom GPU particle systems, procedural speed lines, screen-space damage flashes, and [Canvas Confetti](https://www.npmjs.com/package/canvas-confetti).

### Project Structure

```
argon-game/
├── index.html          # Main HTML entrypoint with HUD, Outlaw Intro Crawl, and Chop Shop UI
├── package.json        # Dependencies and build scripts
├── tsconfig.json       # Strict TypeScript configuration
├── vite.config.ts      # Vite configuration
├── src/
│   ├── main.ts         # Core game loop, input handling, physics, AI riders, and state management
│   ├── track.ts        # Procedural 3D track curve generation, road geometry, and traffic spawning
│   ├── models.ts       # Procedural 3D bike, rider, traffic, and scenery mesh construction
│   ├── audio.ts        # Web Audio API procedural synthesizer (engines, impacts, sirens, FX)
│   ├── particles.ts    # Spark sprays, smoke trails, exhaust nitro flames, and collision particles
│   ├── textures.ts     # Procedural canvas textures (asphalt, road lines, carbon fiber, decals)
│   ├── config.ts       # Tuning parameters, bike stats, upgrade curves, and game constants
│   ├── types.ts        # TypeScript interfaces for bikes, riders, weapons, and track segments
│   └── style.css       # Retro-arcade HUD styling, showroom UI, and responsive layout
└── LICENSE             # GNU Affero General Public License v3.0 (AGPL-3.0)
```

---

## 🚀 Local Development

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or later) or [Bun](https://bun.sh/)
- npm, pnpm, or bun

### 1. Clone the repository
```bash
git clone https://github.com/your-username/argon-game.git
cd argon-game
```

### 2. Install dependencies
```bash
npm install
# or
bun install
```

### 3. Start local development server
```bash
npm run dev
# or
bun run dev
```

Open your browser to `http://localhost:5173/` (or the URL displayed in your terminal).

### 4. Build for production
```bash
npm run build
```

The optimized static production bundle will be generated in the `dist/` folder, ready for deployment to any static web host (Netlify, Vercel, Cloudflare Pages, GitHub Pages).

---

## 📜 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

See the [LICENSE](LICENSE) file for the full license text. Under this license:
- You are free to run, study, modify, and distribute this software.
- If you run a modified version on a server or make it available over a network, you must provide users with access to the corresponding source code under the terms of the AGPL-3.0.
