// Hide the console window in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod media;
mod projects;
mod textures;

/// Write a project file to the path the user picked in the save dialog.
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Could not save {path}: {e}"))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            write_text_file,
            media::read_text_file,
            media::read_file_bytes,
            media::allow_media,
            media::converter_ready,
            media::convert_video,
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
