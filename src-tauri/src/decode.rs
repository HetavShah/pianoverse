//! The video's frames for an export, decoded straight through by FFmpeg: much faster than making the window's
//! video player jump to every frame (on a laptop a jump took about 150 ms; reading the next decoded frame takes a
//! few). FFmpeg decodes a few frames ahead on a thread of its own while the window draws the current one.
//!
//! decode_open starts at a time and a frame rate (one frame per 1/fps s, at the size the window plays the video);
//! decode_next hands over the next frame as raw RGBA; decode_close stops it.

use std::io::{BufRead, BufReader, Read};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{sync_channel, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};

use crate::media::{ensure_ffmpeg, hide_window};

struct Decoder {
    child: Child,
    frames: Arc<Mutex<Receiver<Vec<u8>>>>,
    log: Arc<Mutex<Vec<String>>>,
}

#[derive(Default)]
pub struct DecodeState(Mutex<Option<Decoder>>);

fn stop(d: Option<Decoder>) {
    if let Some(mut d) = d {
        let _ = d.child.kill();
        // waited for elsewhere: nothing may wait on FFmpeg here
        std::thread::spawn(move || { let _ = d.child.wait(); });
    }
}

/// Start decoding `path` from `start` seconds, `fps` frames a second, each `width` x `height` RGBA.
#[tauri::command]
pub async fn decode_open(app: AppHandle, state: State<'_, DecodeState>, path: String, start: f64, fps: f64, width: u32, height: u32) -> Result<(), String> {
    let exe = ensure_ffmpeg(&app).await?;
    stop(state.0.lock().map_err(|e| e.to_string())?.take());
    if width == 0 || height == 0 || !(fps > 0.0) {
        return Err("bad frame size or rate".into());
    }
    let mut cmd = Command::new(&exe);
    cmd.args(["-hide_banner", "-loglevel", "error", "-nostdin"])
        .args(["-ss", &format!("{:.4}", start.max(0.0)), "-i", &path])
        .args(["-an", "-sn", "-vf", &format!("fps={fps},scale={width}:{height}:flags=bicubic"), "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"]);
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    hide_window(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("Could not start the video reader: {e}"))?;
    let mut out = child.stdout.take().ok_or("no output")?;
    let err = child.stderr.take().ok_or("no error output")?;
    let log = Arc::new(Mutex::new(Vec::<String>::new()));
    let log2 = log.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(err).lines().map_while(Result::ok) {
            if let Ok(mut l) = log2.lock() { l.push(line); if l.len() > 8 { l.remove(0); } }
        }
    });
    // a few frames decoded ahead, no more (each is width x height x 4 bytes)
    let (tx, rx) = sync_channel::<Vec<u8>>(4);
    let size = width as usize * height as usize * 4;
    std::thread::spawn(move || loop {
        let mut frame = vec![0u8; size];
        if out.read_exact(&mut frame).is_err() { return; }   // the end of the video, or stopped
        if tx.send(frame).is_err() { return; }
    });
    *state.0.lock().map_err(|e| e.to_string())? = Some(Decoder { child, frames: Arc::new(Mutex::new(rx)), log });
    Ok(())
}

/// The next frame (raw RGBA). Fails with "end" after the last one.
#[tauri::command]
pub async fn decode_next(state: State<'_, DecodeState>) -> Result<tauri::ipc::Response, String> {
    let (frames, log) = {
        let g = state.0.lock().map_err(|e| e.to_string())?;
        let d = g.as_ref().ok_or("The video reader isn't running")?;
        (d.frames.clone(), d.log.clone())
    };
    let got = tauri::async_runtime::spawn_blocking(move || {
        let rx = frames.lock().map_err(|e| e.to_string())?;
        match rx.recv_timeout(std::time::Duration::from_secs(30)) {
            Ok(f) => Ok(f),
            Err(RecvTimeoutError::Disconnected) => {
                let why = log.lock().map(|l| l.join(" ")).unwrap_or_default();
                Err(if why.trim().is_empty() { "end".to_string() } else { format!("end: {why}") })
            }
            Err(RecvTimeoutError::Timeout) => Err("The video reader took no step for 30 seconds".into()),
        }
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(got))
}

#[tauri::command]
pub fn decode_close(state: State<'_, DecodeState>) -> Result<(), String> {
    stop(state.0.lock().map_err(|e| e.to_string())?.take());
    Ok(())
}

#[cfg(test)]
mod tests {
    /// FFmpeg turns a video into frames of exactly the asked size, in order (the same command decode_open runs).
    /// Needs ffmpeg on PATH: cargo test decode -- --ignored
    #[test]
    #[ignore]
    fn decode_gives_whole_frames() {
        use std::io::Read;
        let dir = std::env::temp_dir().join("pv-decode-test");
        let _ = std::fs::create_dir_all(&dir);
        let src = dir.join("in.mp4");
        assert!(std::process::Command::new("ffmpeg").args(["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30:d=4", "-c:v", "libx264", "-g", "60"]).arg(&src).status().unwrap().success());
        let mut child = std::process::Command::new("ffmpeg")
            .args(["-hide_banner", "-loglevel", "error", "-nostdin", "-ss", "1.0000", "-i"]).arg(&src)
            .args(["-an", "-sn", "-vf", "fps=30,scale=1080:1920:flags=bicubic", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"])
            .stdout(std::process::Stdio::piped()).spawn().unwrap();
        let mut out = child.stdout.take().unwrap();
        let t = std::time::Instant::now();
        let mut n = 0;
        let mut f = vec![0u8; 1080 * 1920 * 4];
        while out.read_exact(&mut f).is_ok() { n += 1; }
        child.wait().unwrap();
        eprintln!("{n} frames in {:.2} s", t.elapsed().as_secs_f64());
        assert_eq!(n, 90, "3 s of a 30 fps video from 1 s");
    }
}
