//! Export: the WebView renders every frame on the GPU and sends the pixels here; FFmpeg encodes them
//! (on the graphics card when it can: NVIDIA NVENC, AMD AMF, Intel Quick Sync; otherwise x264) and muxes
//! the original audio. Frames arrive as raw RGBA through `export_frame`.

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};

use crate::media::{ensure_ffmpeg, hide_window};

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExportOpts {
    pub out: String,
    /// size of the frames that will be sent
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    /// size of the finished video; frames are scaled to it, cropped ("crop") or with bars ("fit")
    pub out_width: u32,
    pub out_height: u32,
    pub fit: String,
    /// "h264" | "hevc" | "prores" (transparent effects)
    pub codec: String,
    /// an FFmpeg encoder name, e.g. "h264_nvenc" or "libx264"
    pub encoder: String,
    /// "high" | "medium" | "small"
    pub quality: String,
    /// where the audio comes from (the original video), and which part of it
    pub audio: Option<String>,
    pub audio_copy: bool,
    pub start: f64,
    pub duration: f64,
}

/// The FFmpeg arguments for an export (input frames on stdin).
pub fn build_args(o: &ExportOpts, audio_codec: Option<&str>, part: &str) -> Vec<String> {
    let mut a: Vec<String> = Vec::new();
    let s = |v: &str| v.to_string();
    a.extend(["-hide_banner", "-y", "-loglevel", "error"].map(s));
    a.extend(["-f", "rawvideo", "-pix_fmt", "rgba"].map(s));
    a.extend([s("-s"), format!("{}x{}", o.width, o.height), s("-framerate"), format!("{}", o.fps), s("-i"), s("pipe:0")]);
    let with_audio = o.audio.is_some() && o.codec != "prores";
    if let Some(src) = &o.audio {
        if with_audio {
            a.extend([s("-ss"), format!("{:.3}", o.start.max(0.0)), s("-t"), format!("{:.3}", o.duration), s("-i"), src.clone()]);
        }
    }
    let (w, h) = (o.out_width, o.out_height);
    let pix = if o.codec == "prores" { "yuva444p10le" } else { "yuv420p" };
    let place = if o.fit == "fit" {
        format!("scale={w}:{h}:force_original_aspect_ratio=decrease:flags=lanczos,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black")
    } else {
        format!("scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos,crop={w}:{h}")
    };
    a.extend([s("-vf"), format!("{place},format={pix}")]);
    a.extend([s("-map"), s("0:v:0")]);
    if with_audio {
        a.extend([s("-map"), s("1:a:0?")]);
    }
    let qi = match o.quality.as_str() { "medium" => 1, "small" => 2, _ => 0 };
    let pick = |v: [i32; 3]| v[qi].to_string();
    match o.encoder.as_str() {
        "h264_nvenc" | "hevc_nvenc" => {
            a.extend([s("-c:v"), o.encoder.clone(), s("-preset"), s("p5"), s("-tune"), s("hq"), s("-rc"), s("vbr"), s("-cq"), pick([19, 23, 28]), s("-b:v"), s("0")]);
        }
        "h264_amf" | "hevc_amf" => {
            a.extend([s("-c:v"), o.encoder.clone(), s("-quality"), s("quality"), s("-rc"), s("cqp"), s("-qp_i"), pick([18, 22, 27]), s("-qp_p"), pick([20, 24, 29])]);
        }
        "h264_qsv" | "hevc_qsv" => {
            a.extend([s("-c:v"), o.encoder.clone(), s("-preset"), s("slower"), s("-global_quality"), pick([20, 24, 29])]);
        }
        "libx265" => {
            a.extend([s("-c:v"), s("libx265"), s("-preset"), s("medium"), s("-crf"), pick([20, 24, 29])]);
        }
        "prores_ks" => {
            a.extend([s("-c:v"), s("prores_ks"), s("-profile:v"), s("4444"), s("-vendor"), s("apl0")]);
        }
        _ => {
            a.extend([s("-c:v"), s("libx264"), s("-preset"), s("medium"), s("-crf"), pick([18, 22, 27])]);
        }
    }
    if o.codec == "hevc" {
        a.extend([s("-tag:v"), s("hvc1")]);
    }
    if with_audio {
        let copy_ok = o.audio_copy && matches!(audio_codec, Some("aac") | Some("mp3") | Some("alac"));
        if copy_ok {
            a.extend(["-c:a", "copy"].map(s));
        } else {
            a.extend(["-c:a", "aac", "-b:a", "256k"].map(s));
        }
        a.push(s("-shortest"));
    }
    a.extend(["-movflags", "+faststart"].map(s));
    a.push(part.to_string());
    a
}

struct Job {
    child: Child,
    stdin: Option<ChildStdin>,
    part: PathBuf,
    out: PathBuf,
    log: Arc<Mutex<Vec<String>>>,
    frames: u64,
}

#[derive(Default)]
pub struct ExportState(Mutex<Option<Job>>);

fn tail(log: &Arc<Mutex<Vec<String>>>) -> String {
    log.lock().map(|l| l.join("\n")).unwrap_or_default()
}

/// The audio codec of a file ("aac", "opus", …), read from FFmpeg's description of it.
fn audio_codec(exe: &PathBuf, path: &str) -> Option<String> {
    let mut cmd = Command::new(exe);
    cmd.args(["-hide_banner", "-i", path]).stdout(Stdio::null()).stderr(Stdio::piped());
    hide_window(&mut cmd);
    let out = cmd.output().ok()?;
    let text = String::from_utf8_lossy(&out.stderr);
    let line = text.lines().find(|l| l.contains("Audio: "))?;
    let rest = &line[line.find("Audio: ")? + 7..];
    Some(rest.split(|c: char| c == ' ' || c == ',' || c == '(').next()?.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Encoders {
    /// encoders that actually worked in a test encode, best first
    pub h264: Vec<String>,
    pub hevc: Vec<String>,
    pub prores: bool,
}

/// Try each hardware encoder with a tiny test encode (they are listed even when the graphics card lacks them).
#[tauri::command]
pub async fn export_encoders(app: AppHandle) -> Result<Encoders, String> {
    let exe = ensure_ffmpeg(&app).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let works = |enc: &str| -> bool {
            let mut cmd = Command::new(&exe);
            cmd.args(["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=320x240:d=0.2", "-frames:v", "3", "-c:v", enc, "-f", "null", "-"]);
            cmd.stdout(Stdio::null()).stderr(Stdio::null());
            hide_window(&mut cmd);
            cmd.status().map(|s| s.success()).unwrap_or(false)
        };
        let works = &works;
        let try_all = |list: &[&str]| -> Vec<String> {
            std::thread::scope(|sc| {
                let hs: Vec<_> = list.iter().map(|e| sc.spawn(move || works(e))).collect();
                list.iter().zip(hs).filter_map(|(e, h)| if h.join().unwrap_or(false) { Some(e.to_string()) } else { None }).collect()
            })
        };
        let h264 = try_all(&["h264_nvenc", "h264_amf", "h264_qsv", "libx264"]);
        let hevc = try_all(&["hevc_nvenc", "hevc_amf", "hevc_qsv", "libx265"]);
        let prores = works("prores_ks");
        Encoders { h264, hevc, prores }
    })
    .await
    .map_err(|e| e.to_string())
}

/// Start an export: FFmpeg waits for frames on its input.
#[tauri::command]
pub async fn export_start(app: AppHandle, state: State<'_, ExportState>, opts: ExportOpts) -> Result<(), String> {
    let exe = ensure_ffmpeg(&app).await?;
    if let Some(mut old) = state.0.lock().map_err(|e| e.to_string())?.take() {
        let _ = old.child.kill();
        let _ = std::fs::remove_file(&old.part);
    }
    let out = PathBuf::from(&opts.out);
    if let Some(dir) = out.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Could not create the folder {}: {e}", dir.display()))?;
    }
    let ext = out.extension().and_then(|e| e.to_str()).unwrap_or("mp4").to_string();
    let part = out.with_extension(format!("part.{ext}"));
    let codec = opts.audio.as_ref().and_then(|p| audio_codec(&exe, p));
    let args = build_args(&opts, codec.as_deref(), &part.to_string_lossy());
    let mut cmd = Command::new(&exe);
    cmd.args(&args).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::piped());
    hide_window(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("Could not start the encoder: {e}"))?;
    let log = Arc::new(Mutex::new(Vec::<String>::new()));
    let stderr = child.stderr.take().unwrap();
    let log2 = log.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if let Ok(mut l) = log2.lock() {
                l.push(line);
                if l.len() > 20 {
                    l.remove(0);
                }
            }
        }
    });
    let stdin = child.stdin.take();
    *state.0.lock().map_err(|e| e.to_string())? = Some(Job { child, stdin, part, out, log, frames: 0 });
    Ok(())
}

/// One frame of raw RGBA pixels (the request body).
#[tauri::command]
pub fn export_frame(state: State<'_, ExportState>, request: tauri::ipc::Request<'_>) -> Result<u64, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw frame bytes".into());
    };
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let job = guard.as_mut().ok_or("No export is running")?;
    let stdin = job.stdin.as_mut().ok_or("The export has finished")?;
    if let Err(e) = stdin.write_all(bytes) {
        let msg = tail(&job.log);
        return Err(if msg.is_empty() { format!("The encoder stopped: {e}") } else { format!("The encoder stopped:\n{msg}") });
    }
    job.frames += 1;
    Ok(job.frames)
}

/// All frames sent: let FFmpeg finish, then move the file into place. Returns its path.
#[tauri::command]
pub async fn export_finish(state: State<'_, ExportState>) -> Result<String, String> {
    let job = state.0.lock().map_err(|e| e.to_string())?.take();
    let Some(mut job) = job else { return Err("No export is running".into()) };
    drop(job.stdin.take());
    let status = tauri::async_runtime::spawn_blocking(move || {
        let st = job.child.wait();
        (st, job)
    })
    .await
    .map_err(|e| e.to_string())?;
    let (st, job) = status;
    let ok = st.map(|s| s.success()).unwrap_or(false);
    if !ok {
        let _ = std::fs::remove_file(&job.part);
        return Err(format!("The video could not be encoded.\n{}", tail(&job.log)));
    }
    let _ = std::fs::remove_file(&job.out);
    std::fs::rename(&job.part, &job.out).map_err(|e| format!("Could not save {}: {e}", job.out.display()))?;
    Ok(job.out.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn export_cancel(state: State<'_, ExportState>) -> Result<(), String> {
    if let Some(mut job) = state.0.lock().map_err(|e| e.to_string())?.take() {
        drop(job.stdin.take());
        let _ = job.child.kill();
        let _ = job.child.wait();
        let _ = std::fs::remove_file(&job.part);
    }
    Ok(())
}

/// Videos\Pianoverse (created if needed).
#[tauri::command]
pub fn export_default_dir(app: AppHandle) -> Result<String, String> {
    let base = app.path().video_dir().or_else(|_| app.path().document_dir()).map_err(|e| e.to_string())?;
    let d = base.join("Pianoverse");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn file_exists_any(path: String) -> bool {
    PathBuf::from(path).exists()
}

/// Save bytes (a PNG frame) to a path given in the `path` header.
#[tauri::command]
pub fn write_file_bytes(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let path = request.headers().get("path").and_then(|v| v.to_str().ok()).ok_or("no path")?;
    let path = urlencoding_decode(path);
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("expected raw bytes".into()) };
    std::fs::write(&path, bytes).map_err(|e| format!("Could not save {path}: {e}"))
}

fn urlencoding_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Show the exported file in Explorer.
#[tauri::command]
pub fn show_in_folder(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let mut cmd = Command::new("explorer");
        cmd.arg(format!("/select,{path}"));
        cmd.spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        let _ = path;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn print_args() {
        let o = ExportOpts {
            out: "/tmp/out.mp4".into(), width: 1080, height: 1920, fps: 30.0, out_width: 1080, out_height: 1920, fit: "crop".into(),
            codec: std::env::var("CODEC").unwrap_or("h264".into()), encoder: std::env::var("ENC").unwrap_or("libx264".into()), quality: "high".into(),
            audio: std::env::var("AUDIO").ok(), audio_copy: true, start: 0.0, duration: 10.0,
        };
        let w = std::env::var("W").ok().and_then(|v| v.parse().ok()).unwrap_or(1080);
        let h = std::env::var("H").ok().and_then(|v| v.parse().ok()).unwrap_or(1920);
        let o = ExportOpts { out_width: w, out_height: h, fit: std::env::var("FIT").unwrap_or("crop".into()), ..o };
        let a = build_args(&o, std::env::var("ACODEC").ok().as_deref(), &std::env::var("PART").unwrap_or("/tmp/out.part.mp4".into()));
        println!("ARGS\t{}", a.join("\t"));
    }
}
