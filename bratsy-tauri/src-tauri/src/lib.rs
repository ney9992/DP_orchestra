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
    // T-02-01: allowlist — stage ID должен быть из фиксированного набора
    let allowed = ["autocad", "pdm", "excel", "plantsim", "report"];
    if !allowed.contains(&stage.as_str()) {
        return Err("invalid stage".into());
    }

    // D-13: валидация путей для plantsim ДО резервирования sentinel (Pitfall #2 prevention)
    if stage == "plantsim" {
        let settings = get_settings(); // sync fn — безопасно в async контексте (Pitfall #1)
        if !std::path::Path::new(&settings.plant_sim_exe).exists() {
            return Err("config: PlantSimulation.exe не найден. Проверьте путь в настройках.".into());
        }
        if !std::path::Path::new(&settings.plant_sim_path).exists() {
            return Err("config: файл .spp не найден. Проверьте путь в настройках.".into());
        }
        if !std::path::Path::new(&settings.plant_sim_macro).exists() {
            return Err("config: файл .spm макроса не найден. Проверьте путь в настройках.".into());
        }
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

    // Phase 3: для plantsim — реальный запуск; для остальных — mock
    let (cmd_program, cmd_args_owned): (String, Vec<String>) = if stage == "plantsim" {
        let s = get_settings(); // sync fn — OK в async (Pitfall #1: читаем ДО spawn_blocking)
        let plant_sim_exe   = s.plant_sim_exe.clone();
        let plant_sim_macro = s.plant_sim_macro.clone();
        let plant_sim_path  = s.plant_sim_path.clone();
        (plant_sim_exe, vec!["/S".into(), plant_sim_macro, plant_sim_path])
    } else {
        let script = format!(
            "for ($i=1; $i -le 5; $i++) {{ Write-Output '[{stage}] step $i/5'; Start-Sleep -Milliseconds 400 }}; Write-Output 'done'",
            stage = stage
        );
        ("powershell".into(), vec!["-ExecutionPolicy".into(), "Bypass".into(), "-Command".into(), script])
    };

    // Также читаем work_dir ДО spawn_blocking (Pitfall #1)
    let work_dir_for_results = if stage == "plantsim" {
        get_settings().work_dir.clone()
    } else {
        String::new()
    };
    let stage_is_plantsim = stage == "plantsim";

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

        // D-08: читаем results.txt только для plantsim, после child.wait()
        if stage_is_plantsim {
            let results_path = std::path::Path::new(&work_dir_for_results).join("results.txt");
            match std::fs::read_to_string(&results_path) {
                Ok(content) => {
                    let mut load       = 0f32;
                    let mut throughput = 0f32;
                    let mut cycle_time = 0f32;
                    for line in content.lines() {
                        if let Some((k, v)) = line.split_once('=') {
                            match k.trim() {
                                "load"       => load       = v.trim().parse().unwrap_or(0.0),
                                "throughput" => throughput = v.trim().parse().unwrap_or(0.0),
                                "cycle_time" => cycle_time = v.trim().parse().unwrap_or(0.0),
                                _ => {}
                            }
                        }
                    }
                    // D-09: emit stage-results с числовыми результатами
                    let _ = app_clone.emit("stage-results", StageResultsPayload {
                        stage: "plantsim".into(),
                        load,
                        throughput,
                        cycle_time,
                    });
                }
                Err(_) => {
                    // D-08: файл отсутствует — warning в лог, не ошибка
                    let _ = app_clone.emit("stage-log", StageLogPayload {
                        stage: stage_clone.clone(),
                        line: "[warning] results.txt не найден — результаты недоступны".into(),
                    });
                }
            }
        }

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
