//! Recent projects: each project lives in <app data>/projects/<id>/ as project.json plus a small
//! meta.json (name, dates, thumbnail) so the Projects screen can list them without reading everything.

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn root(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("projects");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

fn dir(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("bad project id".into());
    }
    Ok(root(app)?.join(id))
}

/// meta.json of every project (newest first is sorted by the caller).
#[tauri::command]
pub fn list_projects(app: AppHandle) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    for e in std::fs::read_dir(root(&app)?).map_err(|e| e.to_string())?.flatten() {
        let m = e.path().join("meta.json");
        if let Ok(s) = std::fs::read_to_string(&m) {
            out.push(s);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn save_project(app: AppHandle, id: String, project: String, meta: String) -> Result<(), String> {
    let d = dir(&app, &id)?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    // write-then-rename so a crash never leaves a half-written project
    let tmp = d.join("project.json.part");
    std::fs::write(&tmp, project).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, d.join("project.json")).map_err(|e| e.to_string())?;
    std::fs::write(d.join("meta.json"), meta).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_project(app: AppHandle, id: String) -> Result<String, String> {
    std::fs::read_to_string(dir(&app, &id)?.join("project.json")).map_err(|e| format!("Could not open the project: {e}"))
}

#[tauri::command]
pub fn delete_project(app: AppHandle, id: String) -> Result<(), String> {
    let d = dir(&app, &id)?;
    if d.exists() {
        std::fs::remove_dir_all(&d).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Does a file still exist (to tell whether a project's video was moved)?
#[tauri::command]
pub fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).is_file()
}
