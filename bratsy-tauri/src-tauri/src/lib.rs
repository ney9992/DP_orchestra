use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::Emitter;

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Settings {
    #[serde(default)] pub plant_sim_path: String,
    #[serde(default)] pub work_dir: String,
    #[serde(default)] pub scripts_dir: String,
    #[serde(default)] pub plant_sim_shortcut: String,
    #[serde(default)] pub vault_url: String,          // "http://host:port" или "" для mock
    #[serde(default)] pub vault_token: String,        // Bearer-токен
    #[serde(default)] pub vault_part_number: String,  // обозначение по умолчанию
}

// ProcessMap хранит PID запущенных процессов: stage_id -> pid
// Используем PID (u32) вместо Child, потому что Child не реализует Send
// в контексте Arc<Mutex<...>> для шаринга между потоками
pub struct ProcessMap(pub Arc<Mutex<HashMap<String, u32>>>);

#[derive(Serialize, Clone)]
pub struct StageStatusPayload {
    pub stage: String,
    pub status: String, // "running" | "done" | "error"
}

#[derive(Serialize, Clone)]
pub struct StageLogPayload {
    pub stage: String,
    pub line: String,
}

#[derive(Serialize, Clone)]
pub struct StageResultsPayload {
    pub stage: String,
    pub load: f32,
    pub throughput: f32,
    pub cycle_time: f32,
    pub oee: f32,           // OEE %
    pub wip: f32,           // среднее незавершённое производство, ед.
    pub lead_time: f32,     // среднее время выпуска изделия, мин
    pub bottleneck: String, // название станции-узкого места
}

// ── Vault PDM types ──────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VaultProperty {
    #[serde(rename = "SysName")]  pub sys_name: String,
    #[serde(rename = "DispName")] pub disp_name: String,
    #[serde(rename = "Val")]      pub val: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VaultFile {
    #[serde(rename = "FileName")]    pub file_name: String,
    #[serde(rename = "Id")]          pub id: i64,
    #[serde(rename = "MasterId")]    pub master_id: i64,
    #[serde(rename = "VerNum")]      pub ver_num: i32,
    #[serde(rename = "LastModDate")] pub last_mod_date: String,
    #[serde(rename = "LinkType")]    pub link_type: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VaultItem {
    #[serde(rename = "ParentId")]     pub parent_id: Option<i64>,
    #[serde(rename = "Id")]           pub id: i64,
    #[serde(rename = "MasterId")]     pub master_id: i64,
    #[serde(rename = "Title")]        pub title: String,
    #[serde(rename = "Detail")]       pub detail: Option<String>,
    #[serde(rename = "PartNumber")]   pub part_number: String,
    #[serde(rename = "RevNum")]       pub rev_num: Option<String>,
    #[serde(rename = "VerNum")]       pub ver_num: Option<i32>,
    #[serde(rename = "CatName")]      pub cat_name: Option<String>,
    #[serde(rename = "Quant")]        pub quant: Option<f64>,
    #[serde(rename = "PositionNum")]  pub position_num: Option<i32>,
    #[serde(rename = "Units")]        pub units: Option<String>,
    #[serde(rename = "LfCycStateId")] pub lf_cyc_state_id: Option<i32>,
    #[serde(rename = "Properties")]   pub properties: Vec<VaultProperty>,
    #[serde(rename = "Files")]        pub files: Vec<VaultFile>,
}

#[derive(Serialize, Clone)]
pub struct VaultBomPayload {
    pub part_number: String,
    pub items: Vec<VaultItem>,
}

fn settings_path() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("settings.json")))
        .unwrap_or_else(|| PathBuf::from("settings.json"))
}

#[tauri::command]
fn get_settings() -> Settings {
    let path = settings_path();
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[tauri::command]
fn save_settings(settings: Settings) -> Result<(), String> {
    let path = settings_path();
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
async fn run_stage(
    stage: String,
    state: tauri::State<'_, ProcessMap>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // T-02-01: allowlist — pdm и plantsim используют отдельные команды
    let allowed = ["autocad", "excel", "report"];
    if !allowed.contains(&stage.as_str()) {
        return Err("invalid stage".into());
    }

    // T-02-02 (CR-02 fix): check + reserve в одном критическом разделе — предотвращает TOCTOU
    {
        let mut map = state.0.lock().unwrap();
        if map.contains_key(&stage) {
            return Err("already running".into());
        }
        map.insert(stage.clone(), 0); // sentinel — слот зарезервирован до spawn
    }

    let _ = app_handle.emit("stage-status", StageStatusPayload {
        stage: stage.clone(),
        status: "running".to_string(),
    });

    // Mock для не-plantsim этапов
    let script = format!(
        "for ($i=1; $i -le 5; $i++) {{ Write-Output '[{stage}] step $i/5'; Start-Sleep -Milliseconds 400 }}; Write-Output 'done'",
        stage = stage
    );
    let (cmd_program, cmd_args_owned): (String, Vec<String>) = (
        "powershell".into(),
        vec!["-ExecutionPolicy".into(), "Bypass".into(), "-Command".into(), script],
    );

    // CR-01 fix: stderr(Stdio::null()) — предотвращает deadlock при заполнении pipe-буфера stderr
    let mut child = Command::new(&cmd_program)
        .args(&cmd_args_owned)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| {
            // Spawn провалился — убираем зарезервированный sentinel
            let mut map = state.0.lock().unwrap();
            map.remove(&stage);
            e.to_string()
        })?;

    let pid = child.id();
    {
        let mut map = state.0.lock().unwrap();
        map.insert(stage.clone(), pid); // upgrade sentinel → реальный PID
    }

    let stage_clone = stage.clone();
    let app_clone = app_handle.clone();
    let state_arc = state.0.clone();

    // Читаем stdout построчно в отдельном потоке (BufReader::lines блокирующий)
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(l) => {
                        let _ = app_clone.emit("stage-log", StageLogPayload {
                            stage: stage_clone.clone(),
                            line: l,
                        });
                    }
                    Err(_) => break,
                }
            }
        }

        let status_ok = match child.wait() {
            Ok(s) => s.success(),
            Err(_) => {
                let _ = child.kill();
                false
            }
        };

        {
            let mut map = state_arc.lock().unwrap();
            map.remove(&stage_clone);
        }

        let final_status = if status_ok { "done" } else { "error" };
        let _ = app_clone.emit("stage-status", StageStatusPayload {
            stage: stage_clone,
            status: final_status.to_string(),
        });
    });

    Ok(())
}

/// Открывает нативный диалог выбора файла (Windows OpenFileDialog через PowerShell).
/// filter — строка вида "Plant Simulation (*.spp)|*.spp|All Files (*.*)|*.*"
/// Возвращает выбранный путь или None если пользователь нажал Отмена.
#[tauri::command]
fn pick_file(title: String, filter: String, default_path: String) -> Option<String> {
    let initial_dir = if default_path.is_empty() {
        String::new()
    } else {
        std::path::Path::new(&default_path)
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default()
    };

    let script = format!(
        r#"
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.OpenFileDialog
$d.Title = '{title}'
$d.Filter = '{filter}'
{dir_line}
$d.Multiselect = $false
if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{ Write-Output $d.FileName }}
"#,
        title  = title.replace('\'', "''"),
        filter = filter.replace('\'', "''"),
        dir_line = if initial_dir.is_empty() {
            String::new()
        } else {
            format!("$d.InitialDirectory = '{}'", initial_dir.replace('\'', "''"))
        },
    );

    let output = Command::new("powershell")
        .args(["-ExecutionPolicy", "Bypass", "-NonInteractive", "-Command", &script])
        .output()
        .ok()?;

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() { None } else { Some(path) }
}

/// Открывает нативный диалог выбора папки (Windows FolderBrowserDialog через PowerShell).
#[tauri::command]
fn pick_folder(title: String, default_path: String) -> Option<String> {
    let script = format!(
        r#"
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = '{title}'
$d.UseDescriptionForTitle = $true
{dir_line}
if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{ Write-Output $d.SelectedPath }}
"#,
        title    = title.replace('\'', "''"),
        dir_line = if default_path.is_empty() {
            String::new()
        } else {
            format!("$d.SelectedPath = '{}'", default_path.replace('\'', "''"))
        },
    );

    let output = Command::new("powershell")
        .args(["-ExecutionPolicy", "Bypass", "-NonInteractive", "-Command", &script])
        .output()
        .ok()?;

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() { None } else { Some(path) }
}

/// Возвращает путь к .lnk-ярлыку Plant Simulation.
/// Порядок: 1) из настроек, 2) автопоиск по нескольким директориям.
#[tauri::command]
fn find_plantsim_shortcut() -> Result<String, String> {
    // 1. Проверить сохранённый путь в настройках
    let saved = get_settings().plant_sim_shortcut;
    if !saved.is_empty() && std::path::Path::new(&saved).exists() {
        return Ok(saved);
    }

    // 2. Автопоиск — сканируем несколько вероятных директорий
    let mut scan_dirs: Vec<PathBuf> = Vec::new();

    if let Ok(cwd) = std::env::current_dir() {
        scan_dirs.push(cwd.clone());
        // родительская папка (полезно если cwd = bratsy-tauri/src-tauri)
        if let Some(parent) = cwd.parent() {
            scan_dirs.push(parent.to_path_buf());
            if let Some(gp) = parent.parent() {
                scan_dirs.push(gp.to_path_buf());
            }
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        // CR-03: поднимаемся максимум на 4 уровня, останавливаемся у корня диска
        let mut dir = exe.parent().map(|p| p.to_path_buf());
        for _ in 0..4 {
            match dir {
                None => break,
                Some(ref d) => {
                    scan_dirs.push(d.clone());
                    // Корень диска: parent() == None или совпадает с текущим
                    let parent = d.parent().map(|p| p.to_path_buf());
                    if parent.as_deref() == Some(d.as_path()) {
                        break;
                    }
                    dir = parent;
                }
            }
        }
    }

    // CR-02: возвращаем только .lnk с «Plant» или «Simulation» в имени
    for dir in &scan_dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("lnk") {
                    let name = path.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_lowercase();
                    if name.contains("plant") || name.contains("simulation") || name.contains("цз") {
                        return Ok(path.to_string_lossy().into_owned());
                    }
                }
            }
        }
    }

    Err("config: Ярлык Plant Simulation не найден. Укажите путь к ярлыку в настройках приложения.".into())
}

/// Модифицирует .lnk-ярлык (путь к модели и метод), запускает Plant Simulation через него,
/// ждёт завершения, читает results.txt и эмитирует stage-results.
#[tauri::command]
async fn run_plantsim(
    lnk_path: String,
    spp_path: String,
    method: String,
    state: tauri::State<'_, ProcessMap>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // CR-01: валидация method — разрешены только безопасные символы SimTalk-имени
    if !method.chars().all(|c| c.is_alphanumeric() || "._ -".contains(c)) || method.trim().is_empty() {
        return Err("config: недопустимые символы в имени метода. Используйте только буквы, цифры, точки и пробелы.".into());
    }

    if !std::path::Path::new(&spp_path).exists() {
        return Err(format!("config: файл модели не найден: {}", spp_path));
    }

    {
        let mut map = state.0.lock().unwrap();
        if map.contains_key("plantsim") {
            return Err("already running".into());
        }
        map.insert("plantsim".to_string(), 0);
    }

    let _ = app_handle.emit("stage-status", StageStatusPayload {
        stage: "plantsim".to_string(),
        status: "running".to_string(),
    });

    // CR-01: экранируем кавычки в путях перед вставкой в PS-строку
    let lnk_escaped = lnk_path.replace('"', "`\"");
    let spp_escaped = spp_path.replace('"', "`\"");

    // Модифицируем ярлык через WScript.Shell: прописываем путь к модели и метод
    let modify_cmd = format!(
        r#"$s=(New-Object -ComObject WScript.Shell).CreateShortcut("{}");$s.Arguments='-f "{}" /E {}';$s.Save()"#,
        lnk_escaped, spp_escaped, method
    );
    if let Err(e) = Command::new("powershell")
        .args(["-ExecutionPolicy", "Bypass", "-NonInteractive", "-Command", &modify_cmd])
        .output()
    {
        let mut map = state.0.lock().unwrap();
        map.remove("plantsim");
        return Err(format!("Ошибка модификации ярлыка: {}", e));
    }

    for line in [
        format!("Запуск Plant Simulation: {}", spp_path),
        format!("Метод: {}", method),
        "Ожидание завершения симуляции...".to_string(),
    ] {
        let _ = app_handle.emit("stage-log", StageLogPayload {
            stage: "plantsim".to_string(),
            line,
        });
    }

    // Запускаем через ярлык и ждём закрытия Plant Simulation
    let wait_cmd = format!(
        "Start-Process -FilePath '{}' -Wait",
        lnk_path.replace('\'', "''")
    );
    let mut child = Command::new("powershell")
        .args(["-ExecutionPolicy", "Bypass", "-NonInteractive", "-Command", &wait_cmd])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| {
            let mut map = state.0.lock().unwrap();
            map.remove("plantsim");
            e.to_string()
        })?;

    {
        let mut map = state.0.lock().unwrap();
        map.insert("plantsim".to_string(), child.id());
    }

    let work_dir = get_settings().work_dir.clone();
    let app_clone = app_handle.clone();
    let state_arc = state.0.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let status_ok = match child.wait() {
            Ok(s) => s.success(),
            Err(_) => false,
        };

        // WR-03: читаем results.txt только при успешном завершении
        let results_path = std::path::Path::new(&work_dir).join("results.txt");
        if status_ok { match std::fs::read_to_string(&results_path) {
            Ok(content) => {
                let mut load       = 0f32;
                let mut throughput = 0f32;
                let mut cycle_time = 0f32;
                let mut oee        = 0f32;
                let mut wip        = 0f32;
                let mut lead_time  = 0f32;
                let mut bottleneck = String::new();
                for line in content.lines() {
                    if let Some((k, v)) = line.split_once('=') {
                        match k.trim() {
                            "load"        => load        = v.trim().parse().unwrap_or(0.0),
                            "throughput"  => throughput  = v.trim().parse().unwrap_or(0.0),
                            "cycle_time"  => cycle_time  = v.trim().parse().unwrap_or(0.0),
                            "oee"         => oee         = v.trim().parse().unwrap_or(0.0),
                            "wip"         => wip         = v.trim().parse().unwrap_or(0.0),
                            "lead_time"   => lead_time   = v.trim().parse().unwrap_or(0.0),
                            "bottleneck"  => bottleneck  = v.trim().to_string(),
                            _ => {}
                        }
                    }
                }
                let _ = app_clone.emit("stage-results", StageResultsPayload {
                    stage: "plantsim".into(),
                    load, throughput, cycle_time, oee, wip, lead_time, bottleneck,
                });
            }
            Err(_) => {
                let _ = app_clone.emit("stage-log", StageLogPayload {
                    stage: "plantsim".to_string(),
                    line: "[warning] results.txt не найден — результаты недоступны".to_string(),
                });
            }
        } }

        { state_arc.lock().unwrap().remove("plantsim"); }

        let _ = app_clone.emit("stage-status", StageStatusPayload {
            stage: "plantsim".to_string(),
            status: if status_ok { "done" } else { "error" }.to_string(),
        });
    });

    Ok(())
}

#[tauri::command]
async fn stop_stage(
    stage: String,
    state: tauri::State<'_, ProcessMap>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let pid = {
        let mut map = state.0.lock().unwrap();
        map.remove(&stage)
    };

    if let Some(pid) = pid {
        // WR-01: не вызывать taskkill с sentinel PID=0 (реальный PID всегда > 0)
        if pid > 0 {
            let _ = Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .output();
        }

        let _ = app_handle.emit("stage-status", StageStatusPayload {
            stage: stage.clone(),
            status: "error".to_string(), // остановка = error-состояние (красный пилл)
        });

        let _ = app_handle.emit("stage-log", StageLogPayload {
            stage,
            line: "[остановлено пользователем]".to_string(),
        });
    }

    Ok(())
}

// ── Vault PDM helpers ────────────────────────────────────────────

fn mk_file(id: i64, name: String) -> VaultFile {
    VaultFile {
        file_name: name, id, master_id: id, ver_num: 1,
        last_mod_date: "2025-03-15T09:00:00.000+03:00".into(),
        link_type: "FileAttachment".into(),
    }
}

fn mk_item(
    parent_id: Option<i64>, id: i64, title: &str, part_number: String,
    cat_name: &str, quant: Option<f64>, position_num: Option<i32>, units: &str,
    rev_num: &str, ver_num: i32, mass: f64, files: Vec<VaultFile>,
) -> VaultItem {
    VaultItem {
        parent_id, id, master_id: id,
        title: title.into(), detail: None,
        part_number,
        rev_num: Some(rev_num.into()), ver_num: Some(ver_num),
        cat_name: Some(cat_name.into()),
        quant, position_num,
        units: Some(units.into()),
        lf_cyc_state_id: Some(5),
        properties: vec![VaultProperty {
            sys_name: "mass".into(),
            disp_name: "Масса, кг".into(),
            val: serde_json::json!(mass),
        }],
        files,
    }
}

fn vault_mock_bom(part_number: &str) -> Vec<VaultItem> {
    let pn = if part_number.trim().is_empty() { "МЧД-001" } else { part_number };
    vec![
        mk_item(None, 1001, &format!("Дом жилой модульный {}", pn), pn.into(),
            "Сборка", None, None, "шт", "A", 3, 12500.0,
            vec![mk_file(2001, format!("{}_сборка.pdf", pn))]),

        mk_item(Some(1001), 1002, "Модуль 1 (жилая зона)", format!("{}-01", pn),
            "Сборка", Some(1.0), Some(1), "шт", "A", 2, 4200.0,
            vec![mk_file(2002, format!("{}-01.pdf", pn))]),

        mk_item(Some(1002), 1003, "Панель стеновая несущая", format!("{}-01-001", pn),
            "Деталь", Some(4.0), Some(1), "шт", "A", 1, 380.0,
            vec![mk_file(2003, format!("{}-01-001.pdf", pn)),
                 mk_file(2004, format!("{}-01-001.dxf", pn))]),

        mk_item(Some(1002), 1004, "Профиль металлический 80×40", format!("{}-01-002", pn),
            "Деталь", Some(12.0), Some(2), "м.п.", "A", 1, 4.2,
            vec![mk_file(2005, format!("{}-01-002.pdf", pn))]),

        mk_item(Some(1001), 1005, "Модуль 2 (санузел)", format!("{}-02", pn),
            "Сборка", Some(1.0), Some(2), "шт", "A", 1, 1800.0,
            vec![mk_file(2006, format!("{}-02.pdf", pn))]),

        mk_item(Some(1005), 1006, "Перекрытие межмодульное", format!("{}-02-001", pn),
            "Деталь", Some(2.0), Some(1), "шт", "B", 2, 650.0,
            vec![mk_file(2007, format!("{}-02-001.pdf", pn)),
                 mk_file(2008, format!("{}-02-001.dxf", pn))]),

        mk_item(Some(1005), 1007, "Крепёж (комплект)", format!("{}-02-002", pn),
            "Покупное", Some(1.0), Some(2), "компл.", "A", 1, 8.5,
            vec![mk_file(2009, format!("{}-02-002.pdf", pn))]),
    ]
}

/// Запрашивает BOM из Vault API (или возвращает mock если vault_url пустой).
/// Эмитирует stage-status, stage-log, vault-bom.
#[tauri::command]
async fn vault_get_bom(
    part_number: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<VaultItem>, String> {
    let settings = get_settings();

    let _ = app_handle.emit("stage-status", StageStatusPayload {
        stage: "pdm".into(), status: "running".into(),
    });
    let _ = app_handle.emit("stage-log", StageLogPayload {
        stage: "pdm".into(), line: format!("Запрос BOM: {}", part_number),
    });

    let items = if settings.vault_url.is_empty() || settings.vault_url.trim() == "mock" {
        let _ = app_handle.emit("stage-log", StageLogPayload {
            stage: "pdm".into(),
            line: "[mock] Vault URL не задан — загружаю тестовые данные".into(),
        });
        vault_mock_bom(&part_number)
    } else {
        let base = settings.vault_url.trim_end_matches('/');
        let _ = app_handle.emit("stage-log", StageLogPayload {
            stage: "pdm".into(), line: format!("GET {}/api/v1/bom", base),
        });

        let client = reqwest::Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| e.to_string())?;

        let resp = client
            .get(format!("{}/api/v1/bom", base))
            .query(&[("partNumber", &part_number)])
            .header("Authorization", format!("Bearer {}", settings.vault_token))
            .send()
            .await
            .map_err(|e| format!("Ошибка подключения к Vault: {}", e))?;

        if !resp.status().is_success() {
            let code = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            let _ = app_handle.emit("stage-status", StageStatusPayload {
                stage: "pdm".into(), status: "error".into(),
            });
            return Err(format!("Vault API {}: {}", code, body.chars().take(200).collect::<String>()));
        }

        resp.json::<Vec<VaultItem>>()
            .await
            .map_err(|e| format!("Ошибка парсинга BOM: {}", e))?
    };

    let _ = app_handle.emit("stage-log", StageLogPayload {
        stage: "pdm".into(), line: format!("Получено {} элементов", items.len()),
    });
    let _ = app_handle.emit("vault-bom", VaultBomPayload {
        part_number: part_number.clone(),
        items: items.clone(),
    });
    let _ = app_handle.emit("stage-status", StageStatusPayload {
        stage: "pdm".into(), status: "done".into(),
    });

    Ok(items)
}

/// Скачивает файл из Vault и сохраняет в work_dir/vault/.
#[tauri::command]
async fn vault_download_file(
    file_id: i64,
    file_name: String,
) -> Result<String, String> {
    let settings = get_settings();

    if settings.work_dir.is_empty() {
        return Err("Рабочий каталог не задан — укажите в настройках".into());
    }

    let save_dir = std::path::Path::new(&settings.work_dir).join("vault");
    std::fs::create_dir_all(&save_dir)
        .map_err(|e| format!("Не удалось создать папку vault/: {}", e))?;

    let save_path = save_dir.join(&file_name);

    if settings.vault_url.is_empty() || settings.vault_url.trim() == "mock" {
        std::fs::write(&save_path, b"[mock vault file]").map_err(|e| e.to_string())?;
        return Ok(save_path.to_string_lossy().into_owned());
    }

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(format!("{}/api/v1/file", settings.vault_url.trim_end_matches('/')))
        .query(&[("id", file_id.to_string())])
        .header("Authorization", format!("Bearer {}", settings.vault_token))
        .send()
        .await
        .map_err(|e| format!("Ошибка подключения: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Vault API {} при скачивании файла", resp.status().as_u16()));
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(&save_path, &bytes).map_err(|e| e.to_string())?;

    Ok(save_path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ProcessMap(Arc::new(Mutex::new(HashMap::new()))))
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            run_stage,
            stop_stage,
            find_plantsim_shortcut,
            run_plantsim,
            pick_file,
            pick_folder,
            vault_get_bom,
            vault_download_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
