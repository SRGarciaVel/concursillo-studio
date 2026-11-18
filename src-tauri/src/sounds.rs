//! Gestor de sonidos: el streamer sustituye los efectos por sus `.mp3`/`.wav`.
//!
//! Subida por Tauri (sin JSON de por medio):
//!   `invoke("save_custom_sound", bytesDelArchivo, { headers: { "x-sound-name", "x-extension" } })`
//! El cuerpo de la petición IPC es binario puro (`InvokeBody::Raw`): un mp3 de
//! 2 MB viaja como 2 MB, no como un array JSON de 2 millones de números.
//! Nombre y extensión van en cabeceras.
//!
//! Tras guardar se incrementa `GameState.sounds_version` y se emite el estado:
//! el stage recarga los sonidos con `?v=N` (sin caché) sin tener que recargar OBS.

use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request};
use ts_rs::TS;

use crate::server::{AppState, Sound};

/// Tope de tamaño por archivo (los efectos son cortos).
pub const MAX_SOUND_BYTES: usize = 10 * 1024 * 1024;
pub const EXTENSIONS: [&str; 2] = ["mp3", "wav"];

/// `data/sounds` del usuario (lo que sirve Axum en `/sounds`).
pub struct SoundsDir(pub PathBuf);
/// Copia original que trae la app (`resources/data/sounds`), para "Restaurar".
pub struct DefaultSoundsDir(pub Option<PathBuf>);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub struct SoundFileInfo {
    /// `play_tension`, `play_correct`, ...
    pub name: String,
    /// Archivo que se está usando (`play_win.mp3`), o `None` si no hay ninguno.
    pub file: Option<String>,
    pub size_bytes: u32,
    /// `true` si no es el sonido original de la app.
    pub custom: bool,
    /// Hay un original al que volver.
    pub has_default: bool,
}

fn normalize_extension(ext: &str) -> Result<&'static str, String> {
    let ext = ext.trim().trim_start_matches('.').to_lowercase();
    EXTENSIONS
        .into_iter()
        .find(|e| *e == ext)
        .ok_or_else(|| format!("Formato «{ext}» no admitido: usa .mp3 o .wav"))
}

/// Comprueba la firma del archivo: que de verdad sea MP3/WAV y no otra cosa renombrada.
fn check_magic(bytes: &[u8], ext: &str) -> Result<(), String> {
    let ok = match ext {
        "wav" => bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WAVE",
        // MP3: cabecera ID3 (etiquetas) o directamente un frame (sync 0xFFE).
        "mp3" => bytes.starts_with(b"ID3") || (bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] & 0xE0 == 0xE0),
        _ => false,
    };
    if ok {
        Ok(())
    } else {
        Err(format!("El archivo no parece un .{ext} válido"))
    }
}

impl SoundsDir {
    fn path(&self, sound: Sound, ext: &str) -> PathBuf {
        self.0.join(format!("{}.{ext}", sound.file_stem()))
    }

    /// Archivo activo para un sonido: el `.mp3` gana al `.wav` (igual que el stage).
    fn active(&self, sound: Sound) -> Option<(PathBuf, &'static str)> {
        EXTENSIONS.into_iter().map(|e| (self.path(sound, e), e)).find(|(p, _)| p.is_file())
    }

    /// Guarda un sonido sustituyendo al anterior (de cualquier extensión).
    pub fn save(&self, name: &str, bytes: &[u8], ext: &str) -> Result<Sound, String> {
        let sound = Sound::from_stem(name).ok_or_else(|| format!("Sonido desconocido «{name}»"))?;
        let ext = normalize_extension(ext)?;
        if bytes.is_empty() {
            return Err("El archivo está vacío".into());
        }
        if bytes.len() > MAX_SOUND_BYTES {
            return Err(format!("El archivo pesa {:.1} MB; el máximo es 10 MB", bytes.len() as f64 / 1_048_576.0));
        }
        check_magic(bytes, ext)?;
        fs::create_dir_all(&self.0).map_err(|e| format!("No se pudo crear la carpeta: {e}"))?;
        // Escritura atómica: primero a un temporal, luego renombrar encima.
        let target = self.path(sound, ext);
        let tmp = target.with_extension(format!("{ext}.tmp"));
        fs::write(&tmp, bytes).map_err(|e| format!("No se pudo escribir el sonido: {e}"))?;
        fs::rename(&tmp, &target).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            format!("No se pudo guardar {}: {e}", target.display())
        })?;
        // Quitar la otra extensión: si no, un .mp3 viejo taparía al .wav nuevo.
        for other in EXTENSIONS.into_iter().filter(|e| *e != ext) {
            let _ = fs::remove_file(self.path(sound, other));
        }
        Ok(sound)
    }

    /// Vuelve al sonido original de la app.
    pub fn reset(&self, name: &str, defaults: Option<&Path>) -> Result<Sound, String> {
        let sound = Sound::from_stem(name).ok_or_else(|| format!("Sonido desconocido «{name}»"))?;
        let defaults = defaults.ok_or("No se encuentran los sonidos originales de la app")?;
        let (src, ext) = EXTENSIONS
            .into_iter()
            .map(|e| (defaults.join(format!("{}.{e}", sound.file_stem())), e))
            .find(|(p, _)| p.is_file())
            .ok_or_else(|| format!("La app no trae un original para «{name}»"))?;
        let bytes = fs::read(&src).map_err(|e| e.to_string())?;
        self.save(name, &bytes, ext)
    }

    pub fn list(&self, defaults: Option<&Path>) -> Vec<SoundFileInfo> {
        Sound::ALL
            .into_iter()
            .map(|sound| {
                let default = defaults.and_then(|d| {
                    EXTENSIONS
                        .into_iter()
                        .map(|e| d.join(format!("{}.{e}", sound.file_stem())))
                        .find(|p| p.is_file())
                });
                let active = self.active(sound);
                let bytes = active.as_ref().and_then(|(p, _)| fs::read(p).ok());
                let custom = match (&bytes, &default) {
                    (Some(b), Some(d)) => fs::read(d).map_or(true, |db| &db != b),
                    (Some(_), None) => true,
                    (None, _) => false,
                };
                SoundFileInfo {
                    name: sound.file_stem().to_string(),
                    file: active.map(|(_, e)| format!("{}.{e}", sound.file_stem())),
                    size_bytes: bytes.map_or(0, |b| b.len() as u32),
                    custom,
                    has_default: default.is_some(),
                }
            })
            .collect()
    }
}

/// Avisa al stage de que recargue los sonidos.
async fn bump_version(app: &AppState) {
    let mut game = app.game.write().await;
    game.sounds_version = game.sounds_version.wrapping_add(1);
    app.broadcast(&mut game, None);
}

fn header<'a>(request: &'a Request<'_>, name: &str) -> Result<&'a str, String> {
    request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| format!("Falta la cabecera {name}"))
}

/// Cuerpo: bytes del archivo. Cabeceras: `x-sound-name`, `x-extension`.
#[tauri::command]
pub async fn save_custom_sound(
    request: Request<'_>,
    dir: tauri::State<'_, SoundsDir>,
    app: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Se esperaba el archivo como datos binarios".into());
    };
    let name = header(&request, "x-sound-name")?;
    let ext = header(&request, "x-extension")?;
    dir.save(name, bytes, ext)?;
    bump_version(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn reset_sound(
    name: String,
    dir: tauri::State<'_, SoundsDir>,
    defaults: tauri::State<'_, DefaultSoundsDir>,
    app: tauri::State<'_, AppState>,
) -> Result<(), String> {
    dir.reset(&name, defaults.0.as_deref())?;
    bump_version(&app).await;
    Ok(())
}

#[tauri::command]
pub fn list_sounds(dir: tauri::State<'_, SoundsDir>, defaults: tauri::State<'_, DefaultSoundsDir>) -> Vec<SoundFileInfo> {
    dir.list(defaults.0.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    const WAV: &[u8] = b"RIFF\x24\0\0\0WAVEfmt \x10\0\0\0\x01\0\x01\0";
    const MP3_ID3: &[u8] = b"ID3\x04\0\0\0\0\0\0\xff\xfb";
    const MP3_FRAME: &[u8] = &[0xFF, 0xFB, 0x90, 0x64, 0, 0];

    fn dirs(tag: &str) -> (PathBuf, SoundsDir, PathBuf) {
        let base = std::env::temp_dir().join(format!("concursillo-sounds-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let defaults = base.join("defaults");
        fs::create_dir_all(&defaults).unwrap();
        for s in Sound::ALL {
            fs::write(defaults.join(format!("{}.wav", s.file_stem())), WAV).unwrap();
        }
        (base.clone(), SoundsDir(base.join("user")), defaults)
    }

    #[test]
    fn names_match_the_sound_enum_json() {
        for s in Sound::ALL {
            assert_eq!(serde_json::to_value(s).unwrap(), s.file_stem());
            assert_eq!(Sound::from_stem(s.file_stem()), Some(s));
        }
        assert_eq!(Sound::from_stem("../play_win"), None);
    }

    #[test]
    fn validates_name_extension_size_and_signature() {
        let (base, dir, _) = dirs("validate");
        assert!(dir.save("play_boom", WAV, "wav").unwrap_err().contains("desconocido"));
        assert!(dir.save("../../etc", WAV, "wav").is_err());
        assert!(dir.save("play_win", WAV, "ogg").unwrap_err().contains("no admitido"));
        assert!(dir.save("play_win", &[], "wav").unwrap_err().contains("vacío"));
        assert!(dir.save("play_win", b"<html>no soy audio</html>", "mp3").unwrap_err().contains("no parece"));
        assert!(dir.save("play_win", MP3_ID3, "wav").is_err(), "mp3 renombrado a .wav");
        let big = [WAV, &vec![0u8; MAX_SOUND_BYTES][..]].concat();
        assert!(dir.save("play_win", &big, "wav").unwrap_err().contains("10 MB"));
        assert!(dir.save("play_win", MP3_ID3, ".MP3").is_ok(), "extensión con punto y mayúsculas");
        assert!(dir.save("play_wrong", MP3_FRAME, "mp3").is_ok(), "mp3 sin ID3");
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn upload_replaces_other_extension_and_reset_restores() {
        let (base, dir, defaults) = dirs("replace");
        // Estado inicial: el original .wav.
        dir.reset("play_win", Some(&defaults)).unwrap();
        let info = |d: &SoundsDir| d.list(Some(&defaults)).into_iter().find(|i| i.name == "play_win").unwrap();
        assert_eq!((info(&dir).file.as_deref(), info(&dir).custom), (Some("play_win.wav"), false));

        // Sube un mp3: pasa a ser el activo y el .wav desaparece.
        dir.save("play_win", MP3_ID3, "mp3").unwrap();
        assert_eq!((info(&dir).file.as_deref(), info(&dir).custom), (Some("play_win.mp3"), true));
        assert!(!dir.0.join("play_win.wav").exists());

        // Sube un wav distinto: sustituye al mp3 (si no, el mp3 viejo seguiría ganando).
        let other_wav = [WAV, b"extra"].concat();
        dir.save("play_win", &other_wav, "wav").unwrap();
        assert!(!dir.0.join("play_win.mp3").exists());
        assert!(info(&dir).custom, "wav distinto del original = personalizado");
        assert!(!dir.0.join("play_win.wav.tmp").exists(), "sin temporales");

        dir.reset("play_win", Some(&defaults)).unwrap();
        assert_eq!((info(&dir).file.as_deref(), info(&dir).custom), (Some("play_win.wav"), false));
        assert!(dir.reset("play_win", None).is_err());
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn list_reports_missing_sounds() {
        let (base, dir, defaults) = dirs("list");
        let list = dir.list(Some(&defaults));
        assert_eq!(list.len(), 5);
        assert!(list.iter().all(|i| i.file.is_none() && !i.custom && i.has_default));
        let _ = fs::remove_dir_all(base);
    }
}
