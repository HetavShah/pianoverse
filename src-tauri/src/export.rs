//! Export: the WebView renders every frame on the GPU and sends the pixels here; FFmpeg encodes them
//! (on the graphics card when it can: NVIDIA NVENC, AMD AMF, Intel Quick Sync; otherwise x264) and muxes
//! the audio: the original, or the soundtrack rendered with the Sound settings (handed over first through
//! `export_audio`). Frames arrive as raw RGBA through `export_frame`.

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{sync_channel, SyncSender, TrySendError};
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

/// The ways to ask each encoder for the export's quality, best first. Graphics cards differ in what they accept (an
/// older NVIDIA card refuses the newer tuning options with "Invalid argument"), so the start-up test tries them in
/// order and the export uses the first one this computer's card took (CHOSEN).
pub fn encoder_variants(encoder: &str, quality: &str) -> Vec<Vec<String>> {
    let s = |v: &str| v.to_string();
    let qi = match quality { "medium" => 1, "small" => 2, _ => 0 };
    let pick = |v: [i32; 3]| v[qi].to_string();
    // a plain bit rate, for encoders that take no quality target: 1080x1920 at 30 fps
    let rate = [s("-b:v"), s(["16M", "10M", "6M"][qi]), s("-maxrate"), s(["24M", "15M", "9M"][qi]), s("-bufsize"), s(["32M", "20M", "12M"][qi])];
    let c = |extra: Vec<String>| { let mut v = vec![s("-c:v"), s(encoder)]; v.extend(extra); v };
    match encoder {
        "h264_nvenc" | "hevc_nvenc" => vec![
            c(vec![s("-preset"), s("p5"), s("-tune"), s("hq"), s("-rc"), s("vbr"), s("-cq"), pick([19, 23, 28]), s("-b:v"), s("0")]),
            c(vec![s("-preset"), s("p4"), s("-rc"), s("vbr"), s("-cq"), pick([19, 23, 28]), s("-b:v"), s("0"), s("-bf"), s("0")]),
            c(rate.to_vec()),
        ],
        "h264_amf" | "hevc_amf" => vec![
            c(vec![s("-quality"), s("quality"), s("-rc"), s("cqp"), s("-qp_i"), pick([18, 22, 27]), s("-qp_p"), pick([20, 24, 29])]),
            c(rate.to_vec()),
        ],
        "h264_qsv" | "hevc_qsv" => vec![
            c(vec![s("-preset"), s("slower"), s("-global_quality"), pick([20, 24, 29])]),
            c(vec![s("-preset"), s("medium"), s("-global_quality"), pick([20, 24, 29])]),
            c(rate.to_vec()),
        ],
        "libx265" => vec![c(vec![s("-preset"), s("medium"), s("-crf"), pick([20, 24, 29])])],
        "prores_ks" => vec![c(vec![s("-profile:v"), s("4444"), s("-vendor"), s("apl0")])],
        _ => vec![vec![s("-c:v"), s("libx264"), s("-preset"), s("medium"), s("-crf"), pick([18, 22, 27])]],
    }
}

/// which of encoder_variants each encoder took in the start-up test (none tested yet: the first)
static CHOSEN: std::sync::OnceLock<Mutex<std::collections::HashMap<String, usize>>> = std::sync::OnceLock::new();
fn chosen() -> &'static Mutex<std::collections::HashMap<String, usize>> { CHOSEN.get_or_init(|| Mutex::new(Default::default())) }

/// The encoder and its quality settings for an export: the way this computer's card took in the test.
pub fn encoder_args(encoder: &str, quality: &str) -> Vec<String> {
    let mut v = encoder_variants(encoder, quality);
    let i = chosen().lock().ok().and_then(|m| m.get(encoder).copied()).unwrap_or(0).min(v.len() - 1);
    v.swap_remove(i)
}

/// FFmpeg's reason in a failure, without its generic last lines ("Task finished…", "Nothing was written…")
fn reason(text: &str) -> String {
    let generic = ["Task finished", "Terminating thread", "Nothing was written", "Conversion failed", "Error while", "Could not open encoder before EOF", "Error sending frames"];
    let lines: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty() && !generic.iter().any(|g| l.contains(g))).collect();
    let keep = if lines.is_empty() { text.lines().map(str::trim).filter(|l| !l.is_empty()).collect() } else { lines };
    keep.iter().rev().take(3).rev().cloned().collect::<Vec<_>>().join(" ")
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
    // the bars around a fitted frame: see-through in the effects file, black in a normal video
    let bars = if o.codec == "prores" { "black@0" } else { "black" };
    let place = if o.fit == "fit" {
        format!("scale={w}:{h}:force_original_aspect_ratio=decrease:flags=lanczos,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color={bars}")
    } else {
        format!("scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos,crop={w}:{h}")
    };
    a.extend([s("-vf"), format!("{place},format={pix}")]);
    a.extend([s("-map"), s("0:v:0")]);
    if with_audio {
        a.extend([s("-map"), s("1:a:0?")]);
    }
    a.extend(encoder_args(&o.encoder, &o.quality));
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
    /// frames for the writer thread, which feeds FFmpeg (None once all are sent)
    frames_tx: Option<SyncSender<Vec<u8>>>,
    /// set by the writer thread when FFmpeg stops taking frames
    write_error: Arc<Mutex<Option<String>>>,
    writer: Option<std::thread::JoinHandle<()>>,
    part: PathBuf,
    out: PathBuf,
    log: Arc<Mutex<Vec<String>>>,
    frames: u64,
    /// the rendered soundtrack, removed once the export is done
    temp_audio: Option<PathBuf>,
}

/// The rendered soundtrack's file (one at a time; the next export replaces it).
const SOUND_FILE: &str = "export-sound.wav";

fn sound_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(SOUND_FILE))
}

/// The export's soundtrack as a WAV file (the request body), rendered in the window with the Sound settings.
/// Returns its path for `export_start`.
#[tauri::command]
pub fn export_audio(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw WAV bytes".into());
    };
    let path = sound_path(&app)?;
    std::fs::write(&path, bytes).map_err(|e| format!("Could not save the soundtrack: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

fn remove_temp(p: &Option<PathBuf>) {
    if let Some(p) = p {
        let _ = std::fs::remove_file(p);
    }
}

#[derive(Default)]
pub struct ExportState(Mutex<Option<Job>>);

fn tail(log: &Arc<Mutex<Vec<String>>>) -> String {
    log.lock().map(|l| l.join("\n")).unwrap_or_default()
}

/// The audio codec of a file ("aac", "opus", …), read from FFmpeg's description of it (given up on after 10 s).
fn audio_codec(exe: &PathBuf, path: &str) -> Option<String> {
    let mut cmd = Command::new(exe);
    cmd.args(["-hide_banner", "-i", path]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
    hide_window(&mut cmd);
    let mut child = cmd.spawn().ok()?;
    let stderr = child.stderr.take();
    let reader = std::thread::spawn(move || {
        let mut text = String::new();
        if let Some(mut e) = stderr { let _ = std::io::Read::read_to_string(&mut e, &mut text); }
        text
    });
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if start.elapsed() > std::time::Duration::from_secs(10) => { let _ = child.kill(); let _ = child.wait(); break; }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(20)),
            Err(_) => return None,
        }
    }
    let text = reader.join().ok()?;
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
    /// why each graphics-card encoder that failed did (FFmpeg's last words), e.g. an NVIDIA driver too old
    pub failed: std::collections::BTreeMap<String, String>,
}

/// Try each encoder the way an export uses it: a portrait 1080x1920 picture, the export's quality settings, a
/// second of frames, one encoder at a time, and given up on after a few seconds (a graphics-card encoder can be
/// listed and even start, yet hang). Graphics cards are listed even when they lack an encoder, hence the test.
#[tauri::command]
pub async fn export_encoders(app: AppHandle) -> Result<Encoders, String> {
    let exe = ensure_ffmpeg(&app).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let failed = Mutex::new(std::collections::BTreeMap::<String, String>::new());
        // one test encode with these settings: Ok, or FFmpeg's reason
        let attempt = |args: &[String]| -> Result<(), String> {
            let mut cmd = Command::new(&exe);
            cmd.args(["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30:d=1", "-frames:v", "30", "-pix_fmt", "yuv420p"])
                .args(args)
                .args(["-f", "null", "-"]);
            cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
            hide_window(&mut cmd);
            let mut child = cmd.spawn().map_err(|e| e.to_string())?;
            // FFmpeg's reason, read as it comes (so it can't block on a full pipe)
            let stderr = child.stderr.take();
            let reader = std::thread::spawn(move || {
                let mut text = String::new();
                if let Some(mut e) = stderr { let _ = std::io::Read::read_to_string(&mut e, &mut text); }
                text
            });
            let start = std::time::Instant::now();
            loop {
                match child.try_wait() {
                    Ok(Some(st)) => {
                        let text = reader.join().unwrap_or_default();
                        return if st.success() { Ok(()) } else { Err(reason(&text)) };
                    }
                    Ok(None) if start.elapsed() > std::time::Duration::from_secs(12) => {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err("It didn't finish a test encode within 12 seconds.".into());
                    }
                    Ok(None) => std::thread::sleep(std::time::Duration::from_millis(50)),
                    Err(e) => return Err(e.to_string()),
                }
            }
        };
        // each way of asking the encoder in turn: the first one that works is the one exports use
        let works = |enc: &str| -> bool {
            let mut first_err: Option<String> = None;
            for (i, args) in encoder_variants(enc, "high").iter().enumerate() {
                match attempt(args) {
                    Ok(()) => {
                        if let Ok(mut m) = chosen().lock() { m.insert(enc.to_string(), i); }
                        return true;
                    }
                    Err(e) => { first_err.get_or_insert(e); }
                }
            }
            if !enc.starts_with("lib") && enc != "prores_ks" {
                let why = first_err.filter(|e| !e.is_empty()).unwrap_or_else(|| "It failed a test encode.".into());
                if let Ok(mut f) = failed.lock() { f.insert(enc.to_string(), why); }
            }
            false
        };
        let pick = |list: &[&str]| -> Vec<String> { list.iter().filter(|e| works(e)).map(|e| e.to_string()).collect() };
        let h264 = pick(&["h264_nvenc", "h264_amf", "h264_qsv", "libx264"]);
        let hevc = pick(&["hevc_nvenc", "hevc_amf", "hevc_qsv", "libx265"]);
        let prores = works("prores_ks");
        let failed = failed.into_inner().unwrap_or_default();
        Encoders { h264, hevc, prores, failed }
    })
    .await
    .map_err(|e| e.to_string())
}

/// Start an export: FFmpeg waits for frames on its input.
#[tauri::command]
pub async fn export_start(app: AppHandle, state: State<'_, ExportState>, opts: ExportOpts) -> Result<(), String> {
    let exe = ensure_ffmpeg(&app).await?;
    let old = state.0.lock().map_err(|e| e.to_string())?.take();
    if let Some(mut old) = old {
        drop(old.frames_tx.take());
        let _ = old.child.kill();
        std::thread::spawn(move || {
            let _ = old.child.wait();
            if let Some(w) = old.writer.take() { let _ = w.join(); }
            let _ = std::fs::remove_file(&old.part);
        });
    }
    let out = PathBuf::from(&opts.out);
    if let Some(dir) = out.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Could not create the folder {}: {e}", dir.display()))?;
    }
    let ext = out.extension().and_then(|e| e.to_str()).unwrap_or("mp4").to_string();
    // a file of its own for each attempt: a stuck encoder from an earlier try may still hold the last one open
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let part = out.with_extension(format!("part{}.{ext}", stamp % 1_000_000));
    // off the async workers: it runs FFmpeg once
    let codec = {
        let (exe, audio) = (exe.clone(), opts.audio.clone());
        tauri::async_runtime::spawn_blocking(move || audio.as_ref().and_then(|p| audio_codec(&exe, p))).await.map_err(|e| e.to_string())?
    };
    let args = build_args(&opts, codec.as_deref(), &part.to_string_lossy());
    let mut cmd = Command::new(&exe);
    cmd.args(&args).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::piped());
    // (the export's own FFmpeg reads frames from stdin)
    hide_window(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("Could not start the encoder: {e}"))?;
    let temp_audio = opts.audio.as_ref().map(PathBuf::from).filter(|p| p.file_name().is_some_and(|n| n == SOUND_FILE));
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
    // a thread of its own writes the frames into FFmpeg, so a slow (or stuck) encoder never holds up the window
    let mut stdin: ChildStdin = child.stdin.take().ok_or("The encoder has no input")?;
    let (tx, rx) = sync_channel::<Vec<u8>>(2);
    let write_error = Arc::new(Mutex::new(None::<String>));
    let werr = write_error.clone();
    let writer = std::thread::spawn(move || {
        for frame in rx {
            if let Err(e) = stdin.write_all(&frame) {
                if let Ok(mut w) = werr.lock() { *w = Some(e.to_string()); }
                return;
            }
        }
        // all frames sent: closing FFmpeg's input lets it finish
    });
    *state.0.lock().map_err(|e| e.to_string())? = Some(Job { child, frames_tx: Some(tx), write_error, writer: Some(writer), part, out, log, frames: 0, temp_audio });
    Ok(())
}

/// How long the encoder may go without taking a frame before the export counts it as stuck.
const STALL: std::time::Duration = std::time::Duration::from_secs(20);

/// One frame of raw RGBA pixels (the request body). Handed to the writer thread; fails with "stalled" when the
/// encoder hasn't taken a frame for STALL (a graphics-card encoder that hangs), or with FFmpeg's message if it stopped.
#[tauri::command]
pub async fn export_frame(state: State<'_, ExportState>, request: tauri::ipc::Request<'_>) -> Result<u64, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw frame bytes".into());
    };
    let frame = bytes.to_vec();
    let (tx, werr, log) = {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        let job = guard.as_ref().ok_or("No export is running")?;
        (job.frames_tx.clone().ok_or("The export has finished")?, job.write_error.clone(), job.log.clone())
    };
    let sent = tauri::async_runtime::spawn_blocking(move || {
        let stopped = |werr: &Arc<Mutex<Option<String>>>| -> Option<String> {
            let e = werr.lock().ok()?.clone()?;
            let msg = tail(&log);
            Some(if msg.is_empty() { format!("The encoder stopped: {e}") } else { format!("The encoder stopped:\n{msg}") })
        };
        let start = std::time::Instant::now();
        let mut f = frame;
        loop {
            match tx.try_send(f) {
                Ok(()) => return Ok(()),
                Err(TrySendError::Full(back)) => {
                    if let Some(e) = stopped(&werr) { return Err(e); }
                    if start.elapsed() > STALL { return Err("stalled".to_string()); }
                    f = back;
                    std::thread::sleep(std::time::Duration::from_millis(5));
                }
                Err(TrySendError::Disconnected(_)) => return Err(stopped(&werr).unwrap_or_else(|| "The encoder stopped".into())),
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?;
    sent?;
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let job = guard.as_mut().ok_or("No export is running")?;
    job.frames += 1;
    Ok(job.frames)
}

/// All frames sent: let FFmpeg finish, then move the file into place. Returns its path.
#[tauri::command]
pub async fn export_finish(state: State<'_, ExportState>) -> Result<String, String> {
    let job = state.0.lock().map_err(|e| e.to_string())?.take();
    let Some(mut job) = job else { return Err("No export is running".into()) };
    drop(job.frames_tx.take());
    let status = tauri::async_runtime::spawn_blocking(move || {
        if let Some(w) = job.writer.take() { let _ = w.join(); }
        let st = job.child.wait();
        (st, job)
    })
    .await
    .map_err(|e| e.to_string())?;
    let (st, job) = status;
    remove_temp(&job.temp_audio);
    let ok = st.map(|s| s.success()).unwrap_or(false);
    if !ok {
        let _ = std::fs::remove_file(&job.part);
        return Err(format!("The video could not be encoded.\n{}", tail(&job.log)));
    }
    let _ = std::fs::remove_file(&job.out);
    std::fs::rename(&job.part, &job.out).map_err(|e| format!("Could not save {}: {e}", job.out.display()))?;
    Ok(job.out.to_string_lossy().into_owned())
}

/// Stop the export. Returns at once: FFmpeg is killed, and waited for on a thread of its own (an encoder stuck in a
/// graphics driver can take a long time to die, and nothing may wait on it). keep_sound: the rendered soundtrack
/// stays for another try (the export starting again on another encoder).
#[tauri::command]
pub async fn export_cancel(state: State<'_, ExportState>, keep_sound: Option<bool>) -> Result<(), String> {
    let job = state.0.lock().map_err(|e| e.to_string())?.take();
    if let Some(mut job) = job {
        drop(job.frames_tx.take());
        let _ = job.child.kill();
        if !keep_sound.unwrap_or(false) {
            remove_temp(&job.temp_audio);
        }
        std::thread::spawn(move || {
            // killing FFmpeg also frees a writer thread stuck in a write
            let _ = job.child.wait();
            if let Some(w) = job.writer.take() { let _ = w.join(); }
            let _ = std::fs::remove_file(&job.part);
        });
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

pub fn urlencoding_decode(s: &str) -> String {
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
    fn reason_keeps_the_encoders_own_words() {
        // what an NVIDIA laptop printed: the useful line came first, the generic ones last
        let text = "[h264_nvenc @ 000002ce17bf6f00] InitializeEncoder failed: invalid param (8): Invalid Level.\n\
            [vost#0:0/h264_nvenc @ 000002ce17bf6f00] Task finished with error code: -22 (Invalid argument)\n\
            [vost#0:0/h264_nvenc @ 000002ce17bf6f00] Terminating thread with return code -22 (Invalid argument)\n\
            [out#0/null @ 000002ce17bf7980] Nothing was written into output file, because at least one of its streams received no packets.";
        assert_eq!(reason(text), "[h264_nvenc @ 000002ce17bf6f00] InitializeEncoder failed: invalid param (8): Invalid Level.");
        // only generic lines: they're kept rather than nothing
        assert!(reason("[x] Task finished with error code: -22 (Invalid argument)").contains("Task finished"));
    }

    #[test]
    fn every_hardware_encoder_has_a_plain_fallback() {
        for e in ["h264_nvenc", "hevc_nvenc", "h264_amf", "h264_qsv", "hevc_qsv"] {
            let v = encoder_variants(e, "high");
            assert!(v.len() >= 2, "{e}");
            assert!(v.last().unwrap().contains(&"-b:v".to_string()), "{e}: the last way is a plain bit rate");
        }
        assert_eq!(encoder_args("libx264", "high")[1], "libx264");
    }
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
