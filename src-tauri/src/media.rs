//! Video import helpers: a one-time FFmpeg download, conversion of videos the WebView can't decode
//! (phone HEVC/H.265) into an H.264 editing copy, and file access for videos the user picked.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Manager};

/// Pinned FFmpeg build (gyan.dev "essentials": libx264, NVENC, all common decoders).
const FFMPEG_URL: &str = "https://github.com/GyanD/codexffmpeg/releases/download/7.1.1/ffmpeg-7.1.1-essentials_build.zip";
const FFMPEG_SHA256: &str = "04861d3339c5ebe38b56c19a15cf2c0cc97f5de4fa8910e4d47e5e6404e4a2d4";
const FFMPEG_DIR: &str = "ffmpeg-7.1.1";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    phase: &'static str, // "download" | "convert"
    done: f64,
    total: f64,
    detail: String,
}

pub(crate) fn emit(app: &AppHandle, phase: &'static str, done: f64, total: f64, detail: impl Into<String>) {
    let _ = app.emit("media-progress", Progress { phase, done, total, detail: detail.into() });
}

pub(crate) fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_local_data_dir().map_err(|e| format!("No app data folder: {e}"))
}

fn ffmpeg_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("tools").join(FFMPEG_DIR).join("ffmpeg.exe"))
}

#[cfg(windows)]
pub(crate) fn hide_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
#[cfg(not(windows))]
pub(crate) fn hide_window(_cmd: &mut Command) {}

/// Let the WebView read a file the user picked (asset protocol scope).
#[tauri::command]
pub fn allow_media(app: AppHandle, path: String) -> Result<(), String> {
    app.asset_protocol_scope().allow_file(&path).map_err(|e| e.to_string())
}

/// Raw bytes of a small file the user picked (MIDI files).
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    let meta = std::fs::metadata(&path).map_err(|e| format!("Could not open {path}: {e}"))?;
    if meta.len() > 1024 * 1024 * 1024 {
        return Err(format!("{path} is too large to open (over 1 GB)"));
    }
    std::fs::read(&path).map(tauri::ipc::Response::new).map_err(|e| format!("Could not read {path}: {e}"))
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Could not read {path}: {e}"))
}

#[tauri::command]
pub fn converter_ready(app: AppHandle) -> Result<bool, String> {
    Ok(ffmpeg_path(&app)?.exists())
}

pub(crate) async fn ensure_ffmpeg(app: &AppHandle) -> Result<PathBuf, String> {
    let exe = ffmpeg_path(app)?;
    if exe.exists() {
        return Ok(exe);
    }
    let _ = rustls::crypto::ring::default_provider().install_default();
    let client = reqwest::Client::builder().build().map_err(|e| e.to_string())?;
    let mut resp = client.get(FFMPEG_URL).send().await.map_err(|e| format!("Could not download the video converter: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Could not download the video converter (HTTP {})", resp.status()));
    }
    let total = resp.content_length().unwrap_or(0) as f64;
    let mut buf: Vec<u8> = Vec::with_capacity(total as usize);
    let mut last = 0.0;
    while let Some(chunk) = resp.chunk().await.map_err(|e| format!("Download interrupted: {e}"))? {
        buf.extend_from_slice(&chunk);
        let done = buf.len() as f64;
        if done - last > 512.0 * 1024.0 {
            last = done;
            emit(app, "download", done, total, "Downloading the video converter (one time)");
        }
    }
    let hash = hex(&Sha256::digest(&buf));
    if hash != FFMPEG_SHA256 {
        return Err("The downloaded converter did not match its checksum; not using it.".into());
    }
    emit(app, "download", total, total, "Unpacking the video converter");
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(buf)).map_err(|e| e.to_string())?;
    let mut found = false;
    for i in 0..zip.len() {
        let mut f = zip.by_index(i).map_err(|e| e.to_string())?;
        if f.name().ends_with("/bin/ffmpeg.exe") {
            std::fs::create_dir_all(exe.parent().unwrap()).map_err(|e| e.to_string())?;
            let tmp = exe.with_extension("part");
            let mut out = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
            let mut data = Vec::new();
            f.read_to_end(&mut data).map_err(|e| e.to_string())?;
            out.write_all(&data).map_err(|e| e.to_string())?;
            drop(out);
            std::fs::rename(&tmp, &exe).map_err(|e| e.to_string())?;
            found = true;
            break;
        }
    }
    if !found {
        return Err("The converter package did not contain ffmpeg.exe.".into());
    }
    Ok(exe)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn parse_hms(s: &str) -> Option<f64> {
    let mut it = s.trim().split(':');
    let h: f64 = it.next()?.parse().ok()?;
    let m: f64 = it.next()?.parse().ok()?;
    let sec: f64 = it.next()?.trim_end_matches(',').parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + sec)
}

/// Run one ffmpeg encode, reporting progress. Returns the tail of ffmpeg's log on failure.
fn run_ffmpeg(app: &AppHandle, exe: &Path, input: &Path, out: &Path, video_args: &[&str], label: &str) -> Result<(), String> {
    let mut cmd = Command::new(exe);
    cmd.args(["-hide_banner", "-nostdin", "-y", "-i"]).arg(input);
    cmd.args(video_args);
    cmd.args(["-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-progress", "pipe:1", "-nostats"]);
    cmd.arg(out);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    hide_window(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("Could not start the converter: {e}"))?;

    // stderr: find the input duration, keep the last lines for error messages
    let stderr = child.stderr.take().unwrap();
    let (dtx, drx) = std::sync::mpsc::channel::<f64>();
    let log = std::thread::spawn(move || {
        let mut tail: Vec<String> = Vec::new();
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if let Some(i) = line.find("Duration: ") {
                let rest = &line[i + 10..];
                let end = rest.find(',').unwrap_or(rest.len());
                if let Some(d) = parse_hms(&rest[..end]) {
                    let _ = dtx.send(d);
                }
            }
            tail.push(line);
            if tail.len() > 12 {
                tail.remove(0);
            }
        }
        tail.join("\n")
    });

    let mut duration = 0.0;
    for line in BufReader::new(child.stdout.take().unwrap()).lines().map_while(Result::ok) {
        if duration == 0.0 {
            if let Ok(d) = drx.try_recv() {
                duration = d;
            }
        }
        if let Some(v) = line.strip_prefix("out_time_us=").or_else(|| line.strip_prefix("out_time_ms=")) {
            if let Ok(us) = v.trim().parse::<f64>() {
                emit(app, "convert", us / 1e6, duration, label);
            }
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    let tail = log.join().unwrap_or_default();
    if status.success() {
        Ok(())
    } else {
        Err(tail)
    }
}

/// The sound of a video as a WAV file (48 kHz stereo, cached), so the app reads a few MB of audio instead of the
/// whole video file. Only with FFmpeg already downloaded (it is, once any video was converted or exported);
/// otherwise "no-converter" and the app reads the video itself.
#[tauri::command]
pub async fn extract_audio(app: AppHandle, path: String) -> Result<String, String> {
    let exe = ffmpeg_path(&app)?;
    if !exe.exists() {
        return Err("no-converter".into());
    }
    let input = PathBuf::from(&path);
    let meta = std::fs::metadata(&input).map_err(|e| format!("Could not open {path}: {e}"))?;
    let stem = input.file_stem().and_then(|s| s.to_str()).unwrap_or("video").to_string();
    let modified = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
    let dir = data_dir(&app)?.join("sound-cache");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let out = dir.join(format!("{stem}-{}-{modified}.wav", meta.len()));
    if !out.exists() {
        let part = out.with_extension("part.wav");
        let part2 = part.clone();
        let status = tauri::async_runtime::spawn_blocking(move || {
            let mut cmd = Command::new(&exe);
            cmd.args(["-hide_banner", "-loglevel", "error", "-y", "-i"]).arg(&input)
                .args(["-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", "-f", "wav"]).arg(&part2);
            cmd.stdout(Stdio::null()).stderr(Stdio::null());
            hide_window(&mut cmd);
            cmd.status()
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
        if !status.success() {
            let _ = std::fs::remove_file(&part);
            return Err("This video's sound couldn't be read. Does it have an audio track?".into());
        }
        std::fs::rename(&part, &out).map_err(|e| e.to_string())?;
    }
    app.asset_protocol_scope().allow_file(&out).map_err(|e| e.to_string())?;
    Ok(out.to_string_lossy().into_owned())
}

/// Convert a video into an H.264 editing copy (cached). Returns the copy's path.
#[tauri::command]
pub async fn convert_video(app: AppHandle, path: String) -> Result<String, String> {
    let input = PathBuf::from(&path);
    let meta = std::fs::metadata(&input).map_err(|e| format!("Could not open {path}: {e}"))?;
    let stem = input.file_stem().and_then(|s| s.to_str()).unwrap_or("video").to_string();
    let modified = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
    let dir = data_dir(&app)?.join("editing-copies");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let out = dir.join(format!("{stem}-{}-{modified}.mp4", meta.len()));
    if out.exists() {
        app.asset_protocol_scope().allow_file(&out).map_err(|e| e.to_string())?;
        return Ok(out.to_string_lossy().into_owned());
    }

    let exe = ensure_ffmpeg(&app).await?;
    let part = out.with_extension("part.mp4");
    let app2 = app.clone();
    let part2 = part.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        // graphics-card encoder first (NVIDIA), then the CPU encoder
        let gpu = run_ffmpeg(&app2, &exe, &input, &part2, &["-c:v", "h264_nvenc", "-preset", "p5", "-cq", "19", "-b:v", "0"], "Converting on the graphics card");
        match gpu {
            Ok(()) => Ok(()),
            Err(_) => run_ffmpeg(&app2, &exe, &input, &part2, &["-c:v", "libx264", "-preset", "veryfast", "-crf", "18"], "Converting"),
        }
    })
    .await
    .map_err(|e| e.to_string())?;
    if let Err(tail) = result {
        let _ = std::fs::remove_file(&part);
        return Err(format!("The video could not be converted.\n{tail}"));
    }
    std::fs::rename(&part, &out).map_err(|e| e.to_string())?;
    app.asset_protocol_scope().allow_file(&out).map_err(|e| e.to_string())?;
    Ok(out.to_string_lossy().into_owned())
}
