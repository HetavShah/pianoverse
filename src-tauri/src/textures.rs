//! The user's own note textures: each imported texture is copied into <app data>/textures/<id>/
//! (color + whichever of normal / roughness / metalness sit next to it), so it keeps working
//! if the original download is moved, and every project and preset can use it.

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

fn root(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("textures");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

fn dir(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("bad texture id".into());
    }
    Ok(root(app)?.join(id))
}

const COLOR_TAGS: [&str; 8] = ["color", "colour", "albedo", "basecolor", "base_color", "diffuse", "diff", "col"];
const MAPS: [(&str, &[&str]); 3] = [
    ("normal", &["NormalGL", "normal_gl", "nor_gl", "Normal", "normal", "nor"]),
    ("rough", &["Roughness", "roughness", "rough"]),
    ("metal", &["Metalness", "metalness", "metallic", "metal"]),
];
const EXTS: [&str; 6] = ["png", "jpg", "jpeg", "webp", "bmp", "svg"];
const VIDEO_EXTS: [&str; 4] = ["mp4", "webm", "mov", "m4v"];

/// "Foil002_1K-PNG_Color.png" -> ("…/Foil002_1K-PNG", "Foil002 1K-PNG") when it follows the usual naming
fn stem_of(path: &Path) -> Option<(PathBuf, String)> {
    let name = path.file_stem()?.to_str()?;
    let lower = name.to_lowercase();
    for tag in COLOR_TAGS {
        for sep in ['_', '-'] {
            let suffix = format!("{sep}{tag}");
            if lower.ends_with(&suffix) {
                let stem = &name[..name.len() - suffix.len()];
                return Some((path.with_file_name(stem), stem.replace('_', " ")));
            }
        }
    }
    None
}

fn find_map(stem: &Path, names: &[&str]) -> Option<PathBuf> {
    let base = stem.file_name()?.to_str()?.to_string();
    for n in names {
        for sep in ['_', '-'] {
            for e in EXTS {
                let p = stem.with_file_name(format!("{base}{sep}{n}.{e}"));
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    None
}

fn ext(p: &Path) -> String {
    p.extension().and_then(|e| e.to_str()).unwrap_or("png").to_lowercase()
}

#[derive(serde::Serialize)]
pub struct UserTexture {
    id: String,
    name: String,
    /// map name -> file path ("color" always, "normal" / "rough" / "metal" when found)
    files: std::collections::BTreeMap<String, String>,
}

fn read_one(d: &Path, id: &str) -> Option<UserTexture> {
    let name = std::fs::read_to_string(d.join("name.txt")).unwrap_or_else(|_| id.to_string());
    let mut files = std::collections::BTreeMap::new();
    for e in std::fs::read_dir(d).ok()?.flatten() {
        let p = e.path();
        let Some(stem) = p.file_stem().and_then(|s| s.to_str()) else { continue };
        if ["color", "video", "normal", "rough", "metal"].contains(&stem) {
            files.insert(stem.to_string(), p.to_string_lossy().to_string());
        }
    }
    (files.contains_key("color") || files.contains_key("video")).then(|| UserTexture { id: id.to_string(), name: name.trim().to_string(), files })
}

/// Copy an image (and its normal / roughness / metalness maps if they sit next to it) into the library.
#[tauri::command]
pub fn import_texture(app: AppHandle, path: String) -> Result<UserTexture, String> {
    let src = PathBuf::from(&path);
    if !src.is_file() {
        return Err(format!("Could not find {path}"));
    }
    let size = std::fs::metadata(&src).map_err(|e| e.to_string())?.len();
    let is_video = VIDEO_EXTS.contains(&ext(&src).as_str());
    if size > 64 * 1024 * 1024 {
        return Err(if is_video { "That video is too large to use as a texture (over 64 MB). A short loop of a few seconds works best." } else { "That image is too large to use as a texture (over 64 MB)." }.into());
    }
    let (stem, name) = stem_of(&src).unwrap_or_else(|| {
        let n = src.file_stem().and_then(|s| s.to_str()).unwrap_or("Texture").to_string();
        (src.with_file_name(&n), n.replace('_', " "))
    });
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let id = format!("t{stamp}");
    let d = dir(&app, &id)?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    let copy = |from: &Path, to: &str| std::fs::copy(from, d.join(format!("{to}.{}", ext(from)))).map_err(|e| e.to_string());
    if is_video {
        copy(&src, "video")?;
    } else {
        copy(&src, "color")?;
    }
    if !is_video && stem_of(&src).is_some() {
        for (to, names) in MAPS {
            if let Some(p) = find_map(&stem, names) {
                copy(&p, to)?;
            }
        }
    }
    std::fs::write(d.join("name.txt"), &name).map_err(|e| e.to_string())?;
    read_one(&d, &id).ok_or_else(|| "Could not import the texture".into())
}

/// Put one file of a texture carried in a project file into the library, under the texture's own id.
/// Headers: id, name (url-encoded), file ("color.png", "video.mp4", …); body: the file's bytes.
#[tauri::command]
pub fn restore_texture_file(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let h = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let id = h("id").ok_or("no id")?;
    let file = h("file").ok_or("no file")?;
    let name = h("name").map(|n| crate::export::urlencoding_decode(&n)).unwrap_or_else(|| id.clone());
    // only plain names: a texture id and a map file name, nothing that could reach outside the library
    let plain = |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.') && !s.contains("..");
    if !plain(&id) || !plain(&file) {
        return Err("bad texture name".into());
    }
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("expected raw bytes".into()) };
    let d = dir(&app, &id)?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    std::fs::write(d.join(&file), bytes).map_err(|e| e.to_string())?;
    if !d.join("name.txt").exists() {
        std::fs::write(d.join("name.txt"), &name).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_textures(app: AppHandle) -> Result<Vec<UserTexture>, String> {
    let mut out = Vec::new();
    for e in std::fs::read_dir(root(&app)?).map_err(|e| e.to_string())?.flatten() {
        let id = e.file_name().to_string_lossy().to_string();
        if let Some(t) = read_one(&e.path(), &id) {
            out.push(t);
        }
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(out)
}

#[tauri::command]
pub fn delete_texture(app: AppHandle, id: String) -> Result<(), String> {
    let d = dir(&app, &id)?;
    if d.exists() {
        std::fs::remove_dir_all(&d).map_err(|e| e.to_string())?;
    }
    Ok(())
}
