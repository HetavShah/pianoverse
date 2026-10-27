// Hide the console window in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod export;
mod media;
mod projects;
mod textures;

use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Files Pianoverse was opened with (double-clicking a .pianoverse file, or "Open with"), handed to the window
/// once it is ready.
#[derive(Default)]
struct LaunchFiles(Mutex<Vec<String>>);

/// the files among the command-line arguments
fn files_in(args: &[String]) -> Vec<String> {
    args.iter().skip(1).filter(|a| !a.starts_with('-') && std::path::Path::new(a).is_file()).cloned().collect()
}

/// The files the app was started with (given once: a reload of the window doesn't open them again).
#[tauri::command]
fn launch_files(state: tauri::State<'_, LaunchFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

/// Write a project file to the path the user picked in the save dialog.
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Could not save {path}: {e}"))
}

fn main() {
    tauri::Builder::default()
        // a second launch (double-clicking another project while the app is open) hands its files to the open
        // window instead of starting another copy
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let files = files_in(&argv);
            if !files.is_empty() {
                let _ = app.emit("open-files", files);
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .manage(LaunchFiles(Mutex::new(files_in(&std::env::args().collect::<Vec<_>>()))))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(export::ExportState::default())
        .invoke_handler(tauri::generate_handler![
            write_text_file,
            launch_files,
            textures::restore_texture_file,
            media::read_text_file,
            media::read_file_bytes,
            media::allow_media,
            media::converter_ready,
            media::convert_video,
            export::export_encoders,
            export::export_start,
            export::export_frame,
            export::export_finish,
            export::export_cancel,
            export::export_default_dir,
            export::file_exists_any,
            export::write_file_bytes,
            export::show_in_folder,
            textures::import_texture,
            textures::list_textures,
            textures::delete_texture,
            projects::list_projects,
            projects::save_project,
            projects::load_project,
            projects::delete_project,
            projects::file_exists,
            projects::load_presets,
            projects::save_presets
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pianoverse");
}
