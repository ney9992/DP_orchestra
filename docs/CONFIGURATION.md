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
| `plant_sim_shortcut` | **Required** (for simulation) | `""` | Absolute path to the `.lnk` shortcut file used to launch Plant Simulation. Validated before every simulation run; if absent or pointing to a missing file, the app returns an error prompting the user to open Settings. |
| `spp_path` | **Required** (for simulation) | `""` | Absolute path to the `.spp` Plant Simulation model file. Stored in `settings.json` and used in `run_plantsim` automatically — no file dialog shown at run time. If empty, the pipeline aborts with "Путь к .spp модели не задан". |
| `sim_method` | **Required** (for simulation) | `""` | SimTalk method name to execute, e.g. `.UserObjects.printed`. Stored in `settings.json`. Also cached in `localStorage` as `lastSimMethod` after each successful run; this cached value is used as a fallback pre-fill when `sim_method` in settings is empty. Only alphanumeric characters, dots, underscores, hyphens, and spaces are accepted — the backend validates this before launch. |
| `vault_url` | Optional | `""` | Vault PDM server base URL, e.g. `http://192.168.1.10:8080`. An empty string or the literal value `mock` enables mock mode — the BOM panel is populated with test data instead of contacting a real server. |
| `vault_token` | Optional | `""` | Authentication token sent as `token {vault_token}` in the `Authorization` header for Vault BOM API requests. Not used in mock mode. |
| `vault_part_number` | Optional | `""` | Default part number used in the BOM query. Pre-fills the `partNumber` query parameter sent to the Vault API. If empty, an empty string is passed — the Vault server may return an error or a default BOM depending on its configuration. |

> **Note:** The fields `plant_sim_path`, `work_dir`, and `scripts_dir` are still present in the `Settings` struct with `#[serde(default)]` for backward compatibility with existing `settings.json` files, but they are no longer exposed in the Settings UI and are not used by any active command.

**Minimal working `settings.json` for simulation (no Vault):**

```json
{
  "plant_sim_shortcut": "C:\\Users\\User\\AppData\\Roaming\\Digital Factory\\DP_Plant_Simulation.exe.lnk",
  "spp_path": "D:\\Projects\\Factory\\model.spp",
  "sim_method": ".UserObjects.printed"
}
```

**Full `settings.json` with Vault PDM:**

```json
{
  "plant_sim_shortcut": "C:\\Users\\User\\AppData\\Roaming\\Digital Factory\\DP_Plant_Simulation.exe.lnk",
  "spp_path": "D:\\Projects\\Factory\\model.spp",
  "sim_method": ".UserObjects.printed",
  "vault_url": "http://192.168.1.10:8080",
  "vault_token": "eyJhbGciOi...",
  "vault_part_number": "МЧД-001"
}
```

### Mock Mode

When `vault_url` is empty or set to `mock`, `vault_get_bom` returns a hard-coded BOM tree of seven items rooted at part number `МЧД-001` (or whatever part number is passed). In mock mode the response is also written to `bom.json` in `writable_dir()` in the same `{"value": [...], "Count": N}` format as the real API. File downloads in mock mode write a placeholder `[mock vault file]` byte sequence instead of contacting the server.

---

## Vault API

**Endpoint:** `GET {vault_url}/api/v1/bom`

**Query parameters:**

| Parameter | Value | Description |
|---|---|---|
| `partNumber` | `vault_part_number` setting | Root part number to fetch |
| `useHierarchy` | `true` | Returns items as a nested hierarchy with `Childrens` arrays |
| `includeImages` | `true` | Includes image attachments in the response |

**Authorization header:** `token {vault_token}` (not `Bearer`).

**Response format:**

```json
{
  "value": [
    {
      "Id": 1001,
      "ParentId": null,
      "PartNumber": "МЧД-001",
      "Title": "...",
      "Childrens": [ { ... } ]
    }
  ],
  "Count": 7
}
```

The backend (`flatten_vault_value`) reads the `value` array and recurses into each item's `Childrens` array to produce a flat list of `VaultItem` structs.

**BOM file output:** After every successful `vault_get_bom` call (both mock and real), the raw JSON response is written to `writable_dir()/bom.json`. This file is the source used by the `bom_to_xml` command.

---

## UI Settings (localStorage)

The following keys are persisted in the WebView's `localStorage`. They are specific to the WebView profile and do not appear in `settings.json`.

| Key | Default | Description |
|---|---|---|
| `mode_{stage}` | `test` | Per-stage mode toggle. Valid values: `test` \| `real`. One key per pipeline stage (`mode_pdm`, `mode_excel`, `mode_autocad`, `mode_plantsim`). |
| `lastSimMethod` | (empty) | The SimTalk method name from the most recent successful simulation run. Used as a fallback pre-fill when `sim_method` in `settings.json` is empty. |
| `panelLeftPct` | (CSS default) | Left panel width as a percentage (range 20–80). Set by the resize handle drag interaction; restored on next load. Stored as a decimal string, e.g. `"35.4"`. |

---

## Plant Simulation Shortcut

The backend manages a `.lnk` shortcut that points to the Plant Simulation executable. The shortcut is the mechanism by which the app passes model path and SimTalk method arguments to Plant Simulation (via `WScript.Shell` argument injection before each run).

**Shortcut filename:** configured via the `plant_sim_shortcut` setting (arbitrary `.lnk` path chosen by the user).

**Writable directory probe order** (`lib.rs: writable_dir()`):

1. Directory containing the application `.exe`
2. `%APPDATA%\Digital Factory\`
3. `%LOCALAPPDATA%\Digital Factory\`

The first directory where a write probe succeeds is used for `bom.json`, `bom.xml`, and `results.txt`.

**Shortcut validation:** Before each simulation run, `find_plantsim_shortcut` checks `settings.plant_sim_shortcut` for a non-empty string pointing to an existing file. If validation fails, the frontend receives an error message prompting the user to open Settings.

---

## Simulation Results File

After Plant Simulation finishes, the SimTalk macro must write a `results.txt` file into `writable_dir()`.

**Format:** UTF-8, any number of `key=value` pairs, one per line. All pairs are parsed dynamically — there is no fixed schema. Empty lines and lines without `=` are ignored.

```
load=82.4
throughput=124
cycle_time=3.6
oee=78.1
wip=11
lead_time=14.2
bottleneck=Станция_5
```

Each parsed `key=value` pair is emitted as a `ResultEntry` and rendered as a dynamic card in the Report tab. The set of keys is not fixed — add or remove fields in the SimTalk macro and the UI adapts automatically. The file is read only when Plant Simulation exits with a success code.

**BOM XML output:** The `bom_to_xml` command reads `writable_dir()/bom.json` and writes the converted XML to `writable_dir()/bom.xml`.

---

## Build Configuration

**File:** `bratsy-tauri/src-tauri/tauri.conf.json`

```json
{
  "productName": "Digital Factory",
  "version": "0.3.0",
  "identifier": "com.bratsy.digitalfactory",
  "build": {
    "frontendDist": "../src"
  },
  "app": {
    "windows": [
      {
        "title": "Digital factory control panel",
        "width": 1400,
        "height": 860,
        "resizable": true,
        "maximized": true,
        "center": true
      }
    ]
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
| `version` | `0.3.0` | **Bump manually** before running `make-release.ps1` |
| `identifier` | `com.bratsy.digitalfactory` | Unique app identifier |
| `width` / `height` | `1400` / `860` | Base window dimensions; actual start size is determined by `maximized` |
| `maximized` | `true` | Window launches maximized; `width`/`height` are the restore dimensions |
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
