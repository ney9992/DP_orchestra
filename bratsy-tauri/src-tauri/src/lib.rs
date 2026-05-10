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
    pub plant_sim_path: String,
    pub work_dir: String,
    pub scripts_dir: String,
    pub plant_sim_shortcut: String, // путь к .lnk-ярлыку Plant Simulation
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
    // T-02-01: allowlist — plantsim использует отдельную команду run_plantsim
    let allowed = ["autocad", "pdm", "excel", "report"];
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
        if let Some(dir) = exe.parent() {
            scan_dirs.push(dir.to_path_buf());
            // debug target/debug → поднимаемся до workspace root
            for _ in 0..4 {
                if let Some(p) = scan_dirs.last().cloned().and_then(|d| d.parent().map(|x| x.to_path_buf())) {
                    scan_dirs.push(p);
                }
            }
        }
    }

    for dir in &scan_dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("lnk") {
                    return Ok(path.to_string_lossy().into_owned());
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

    // Модифицируем ярлык через WScript.Shell: прописываем путь к модели и метод
    let modify_cmd = format!(
        r#"$s=(New-Object -ComObject WScript.Shell).CreateShortcut("{}");$s.Arguments='-f "{}" /E {}';$s.Save()"#,
        lnk_path, spp_path, method
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

        let results_path = std::path::Path::new(&work_dir).join("results.txt");
        match std::fs::read_to_string(&results_path) {
            Ok(content) => {
                let mut load = 0f32;
                let mut throughput = 0f32;
                let mut cycle_time = 0f32;
                for line in content.lines() {
                    if let Some((k, v)) = line.split_once('=') {
                        match k.trim() {
                            "load"        => load        = v.trim().parse().unwrap_or(0.0),
                            "throughput"  => throughput  = v.trim().parse().unwrap_or(0.0),
                            "cycle_time"  => cycle_time  = v.trim().parse().unwrap_or(0.0),
                            _ => {}
                        }
                    }
                }
                let _ = app_clone.emit("stage-results", StageResultsPayload {
                    stage: "plantsim".into(),
                    load,
                    throughput,
                    cycle_time,
                });
            }
            Err(_) => {
                let _ = app_clone.emit("stage-log", StageLogPayload {
                    stage: "plantsim".to_string(),
                    line: "[warning] results.txt не найден — результаты недоступны".to_string(),
                });
            }
        }

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
        // taskkill /F /PID — принудительное завершение на Windows (T-02-03: PID из собственного State)
        let _ = Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output();

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
