<!-- generated-by: gsd-doc-writer -->
# Configuration

This document describes all configurable settings in Digital Factory (Bratsy_DP) — the runtime settings file, UI state persisted in the browser, the Tauri build configuration, and the release process.

---

## Environment Variables

Digital Factory does not use environment variables at runtime. All user-facing settings are stored in `settings.json` (see [Runtime Settings](#runtime-settings) below). No `.env` file is required.

---

## Runtime Settings

**File:** `settings.json`, located next to the application executable.

The file is created automatically on the first save from the Settings panel (gear icon). If the file is absent on startup, all fields default to empty strings — the application starts normally in mock mode.

The file format is JSON. All fields are optional; missing fields are filled with their `serde` defaults (empty string).

**Location probe order:** The backend (`lib.rs: settings_path()`) resolves the path to the directory containing the running `.exe` and appends `settings.json`. On a standard `currentUser` install this is `%LOCALAPPDATA%\Programs\Digital Factory\`.

### Fields

| Field | Required | Default | Description |
|---|---|---|---|
| `plant_sim_shortcut` | **Required** (for simulation) | `""` | Absolute path to the `.lnk` shortcut file used to launch Plant Simulation 16. Validated before every simulation run; if absent or pointing to a missing file, the app opens the Settings panel automatically. |
| `plant_sim_path` | Optional | `""` | Legacy field. Last-used `.spp` model file path. Not read by the current UI — the model file is selected via a native file dialog each run. |
| `work_dir` | Optional | `""` | Legacy field. Working directory for downloaded Vault files (`vault/` subfolder). Required when downloading BOM attachments; the app returns an error if the directory is not set when a download is attempted. |
| `scripts_dir` | Optional | `""` | Legacy field. Scripts folder. Not used by the current UI. |
| `vault_url` | Optional | `""` | Vault PDM server base URL, e.g. `http://192.168.1.10:8080`. An empty string or the literal value `mock` enables mock mode — the BOM panel is populated with test data instead of contacting a real server. |
| `vault_token` | Optional | `""` | Bearer token sent in the `Authorization` header for all Vault API requests. Not used in mock mode. |
| `vault_part_number` | Optional | `""` | Default part number pre-filled in the BOM query prompt. If empty, the prompt asks the user to type a part number manually. |

**Minimal working `settings.json` for simulation (no Vault):**

```json
{
  "plant_sim_shortcut": "C:\\Users\\User\\AppData\\Roaming\\Digital Factory\\DP_Plant_Simulation.exe.lnk"
}
```

**Full `settings.json` with Vault PDM:**

```json
{
  "plant_sim_shortcut": "C:\\Users\\User\\AppData\\Roaming\\Digital Factory\\DP_Plant_Simulation.exe.lnk",
  "work_dir": "D:\\Projects\\Factory\\data",
  "vault_url": "http://192.168.1.10:8080",
  "vault_token": "eyJhbGciOi...",
  "vault_part_number": "МЧД-001"
}
```

### Mock Mode

When `vault_url` is empty or set to `mock`, `vault_get_bom` returns a hard-coded BOM tree of seven items rooted at part number `МЧД-001` (or whatever part number is passed). File downloads in mock mode write a placeholder `[mock vault file]` byte sequence instead of contacting the server.

---

## UI Settings (localStorage)

One key is persisted in the WebView's `localStorage`. It is specific to the WebView profile and does not appear in `settings.json`.

| Key | Default | Description |
|---|---|---|
| `lastSimMethod` | `.UserObjects.printed` | The SimTalk method name last used in the simulation run prompt. Pre-populated in the dialog on the next run. |

---

## Plant Simulation Shortcut

The backend manages a `.lnk` shortcut that points to the Plant Simulation executable. The shortcut is the mechanism by which the app passes model path and SimTalk method arguments to Plant Simulation (via `WScript.Shell` argument injection before each run).

**Shortcut filename:** `DP_Plant_Simulation.exe.lnk`

**Default target path (standard Siemens install):**
```
C:\Program Files\Siemens\Tecnomatix Plant Simulation 16\PlantSimulation16.exe
```

**Writable directory probe order** (`lib.rs: writable_dir()`):

1. Directory containing the application `.exe`
2. `%APPDATA%\Digital Factory\`
3. `%LOCALAPPDATA%\Digital Factory\`

The first directory where a write probe succeeds is used for both the `.lnk` file and `results.txt`.

**Shortcut validation:** Before each simulation run, `find_plantsim_shortcut` checks `settings.plant_sim_shortcut` for a non-empty string pointing to an existing file. If validation fails, the frontend shows a confirmation dialog offering to open the Settings panel.

---

## Simulation Results File

After Plant Simulation finishes, the SimTalk macro must write a `results.txt` file into the same writable directory as the shortcut (`writable_dir()`).

**Format:** UTF-8, one `key=value` pair per line.

```
load=82.4
throughput=124
cycle_time=3.6
oee=78.1
wip=11
lead_time=14.2
bottleneck=Станция_5
```

| Key | Unit / type | Description |
|---|---|---|
| `load` | `f32` — percent | Average equipment load |
| `throughput` | `f32` — units | Units produced per shift/period |
| `cycle_time` | `f32` — minutes | Takt / cycle time |
| `oee` | `f32` — percent | Overall Equipment Effectiveness |
| `wip` | `f32` — units | Average work-in-progress inventory |
| `lead_time` | `f32` — minutes | Average lead time per unit |
| `bottleneck` | `string` | Name of the bottleneck station |

Missing or unparseable values default to `0.0` (or empty string for `bottleneck`). The file is read only when Plant Simulation exits with a success code.

---

## Build Configuration

**File:** `bratsy-tauri/src-tauri/tauri.conf.json`

```json
{
  "productName": "Digital Factory",
  "version": "0.2.6",
  "identifier": "com.bratsy.digitalfactory",
  "build": {
    "frontendDist": "../src"
  },
  "bundle": {
    "targets": ["nsis"],
    "windows": {
      "webviewInstallMode": { "type": "downloadBootstrapper" },
      "nsis": {
        "installMode": "currentUser"
      }
    }
  }
}
```

| Field | Value | Notes |
|---|---|---|
| `productName` | `Digital Factory` | Display name used by NSIS installer |
| `version` | `0.2.6` | **Bump manually** before running `make-release.ps1` |
| `identifier` | `com.bratsy.digitalfactory` | Unique app identifier |
| `installMode` | `currentUser` | Installs to `%LOCALAPPDATA%\Programs\` — no admin rights needed |
| `webviewInstallMode` | `downloadBootstrapper` | Downloads the WebView2 bootstrapper (~2 MB) at install time if WebView2 is absent |
| `frontendDist` | `../src` | Frontend source directory relative to `src-tauri/` |

---

## Release Process

The release script is `make-release.ps1` at the repository root.

```powershell
powershell -ExecutionPolicy Bypass -File make-release.ps1
```

### Steps

1. **Clean build cache** — Removes `bratsy-tauri/src-tauri/target/release/build/bratsy-tauri-*`, `.fingerprint/bratsy-tauri-*`, and the previous `bratsy-tauri.exe`. This forces the frontend HTML/JS to be re-embedded into the binary.
2. **Build** — Runs `.\node_modules\.bin\tauri.cmd build` from `bratsy-tauri/`. Exits with code 1 on failure.
3. **Find installer** — Reads `version` from `tauri.conf.json` and filters `bundle/nsis/` with the glob `*${version}*-setup.exe`. Old installers that do not match the current version are deleted.
4. **Assemble release folder** — Creates `release/Digital Factory v{version}/` containing `setup.exe` and a `README.txt` with installation instructions.
5. **Pack into ZIP** — Creates `release/Digital_Factory_v{version}.zip`.
6. **Source archive** — Runs `git archive HEAD --format=zip` to create `release/Digital_Factory_v{version}_source.zip` (excludes `target/` and `node_modules/`).

**Critical:** Always filter by version when picking the installer. Old installers accumulate in `bundle/nsis/` across builds. The version filter (`*${version}*-setup.exe`) prevents `make-release.ps1` from packaging a stale installer.

### Before Running

1. Bump `version` in `bratsy-tauri/src-tauri/tauri.conf.json`.
2. Commit the version bump.
3. Run `make-release.ps1`.

### Output

```
release/
  Digital Factory v{version}/
    setup.exe
    README.txt
  Digital_Factory_v{version}.zip
  Digital_Factory_v{version}_source.zip
```

---

## Per-Environment Overrides

There is no per-environment configuration mechanism (no `.env.development`, `.env.production`, or `NODE_ENV` branching). The single `settings.json` file serves all environments. The distinction between development and production behaviour is:

- **Mock mode** (development / no Vault server): leave `vault_url` empty.
- **Production mode** (real Vault server): set `vault_url`, `vault_token`, and `vault_part_number` in `settings.json`.

The Tauri build type (`debug` vs `release`) is controlled by the presence or absence of the `--release` flag passed to `cargo tauri build`. `make-release.ps1` always produces a release build.
