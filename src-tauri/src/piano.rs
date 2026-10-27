//! The grand piano's samples (Audio → Sound → Sound from → Grand piano): downloaded once, the first time it's
//! picked, checked against its checksum, and kept in the app's data folder. The pack lives in the repository
//! (assets/piano), made by tools/piano-pack/make.py from Salamander Grand Piano V3 (Alexander Holm, CC-BY 3.0).

use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::AppHandle;

use crate::media::{data_dir, emit};

const PACK_NAME: &str = "salamander-v1.pvpiano";
const PACK_URL: &str = "https://raw.githubusercontent.com/HetavShah/pianoverse/main/assets/piano/salamander-v1.pvpiano";
const PACK_SHA256: &str = "14a70f2da35211445838883b76aa266b6a70a572f0354fc0f8ac6b42be61bd43";
const PACK_BYTES: u64 = 15985158;

fn pack_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("sounds").join(PACK_NAME))
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Where the piano's pack is, downloading it first if needed (progress on "media-progress", phase "download").
#[tauri::command]
pub async fn piano_pack(app: AppHandle) -> Result<String, String> {
    let path = pack_path(&app)?;
    if std::fs::metadata(&path).map(|m| m.len() == PACK_BYTES).unwrap_or(false) {
        return Ok(path.to_string_lossy().into_owned());
    }
    let _ = rustls::crypto::ring::default_provider().install_default();
    let client = reqwest::Client::builder().build().map_err(|e| e.to_string())?;
    let mut resp = client.get(PACK_URL).send().await.map_err(|e| format!("Could not download the piano: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Could not download the piano (HTTP {})", resp.status()));
    }
    let total = resp.content_length().unwrap_or(PACK_BYTES) as f64;
    let mut buf: Vec<u8> = Vec::with_capacity(total as usize);
    let mut last = 0.0;
    while let Some(chunk) = resp.chunk().await.map_err(|e| format!("Download interrupted: {e}"))? {
        buf.extend_from_slice(&chunk);
        let done = buf.len() as f64;
        if done - last > 256.0 * 1024.0 {
            last = done;
            emit(&app, "download", done, total, "Downloading the grand piano (one time)");
        }
    }
    if hex(&Sha256::digest(&buf)) != PACK_SHA256 {
        return Err("The downloaded piano did not match its checksum; not using it.".into());
    }
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("part");
    std::fs::write(&tmp, &buf).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    emit(&app, "download", total, total, "Piano ready");
    Ok(path.to_string_lossy().into_owned())
}
