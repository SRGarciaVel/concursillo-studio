//! Registro de eventos en archivo (`%APPDATA%\com.concursillo.studio\logs\app.log`).
//!
//! Sin dependencias: una línea por evento con hora UTC, nivel y origen.
//! Pensado para diagnosticar después de un directo ("¿por qué se desconectó
//! Twitch?"), no para depurar: solo eventos importantes (arranque, conexiones,
//! comandos rechazados, errores y cierres inesperados).
//!
//! Reglas:
//! - Nunca se escriben tokens ni payloads completos de comandos (las preguntas
//!   del set no deben acabar en un log que el streamer puede compartir).
//! - Rotación simple: al superar `MAX_BYTES`, `app.log` pasa a `app.log.1`.
//! - Si el log no está inicializado (tests) o falla la escritura, no pasa nada:
//!   el registro nunca debe tumbar la app.

use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

const FILE_NAME: &str = "app.log";
const MAX_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Level {
    Info,
    Warn,
    Error,
}

impl Level {
    fn tag(self) -> &'static str {
        match self {
            Level::Info => "INFO ",
            Level::Warn => "WARN ",
            Level::Error => "ERROR",
        }
    }
}

struct Logger {
    dir: PathBuf,
    file: Mutex<Option<File>>,
}

static LOGGER: OnceLock<Logger> = OnceLock::new();

/// Abre (o crea) `<dir>/app.log`. Llamar una vez al arrancar.
pub fn init(dir: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    let file = open(dir)?;
    let _ = LOGGER.set(Logger { dir: dir.to_path_buf(), file: Mutex::new(Some(file)) });
    install_panic_hook();
    Ok(())
}

/// Carpeta de logs (para el botón "Abrir carpeta de logs").
pub fn dir() -> Option<&'static Path> {
    LOGGER.get().map(|l| l.dir.as_path())
}

fn open(dir: &Path) -> std::io::Result<File> {
    OpenOptions::new().create(true).append(true).open(dir.join(FILE_NAME))
}

pub fn info(source: &str, msg: impl AsRef<str>) {
    write(Level::Info, source, msg.as_ref());
}
pub fn warn(source: &str, msg: impl AsRef<str>) {
    write(Level::Warn, source, msg.as_ref());
}
pub fn error(source: &str, msg: impl AsRef<str>) {
    write(Level::Error, source, msg.as_ref());
}

/// Escribe una línea. También va a la consola en desarrollo.
pub fn write(level: Level, source: &str, msg: &str) {
    let line = format_line(SystemTime::now(), level, source, msg);
    if cfg!(debug_assertions) {
        eprint!("{line}");
    }
    let Some(logger) = LOGGER.get() else { return };
    let Ok(mut guard) = logger.file.lock() else { return };
    rotate_if_needed(&logger.dir, &mut guard);
    if let Some(file) = guard.as_mut() {
        let _ = file.write_all(line.as_bytes());
    }
}

fn rotate_if_needed(dir: &Path, file: &mut Option<File>) {
    let too_big = file.as_ref().and_then(|f| f.metadata().ok()).is_some_and(|m| m.len() > MAX_BYTES);
    if !too_big {
        return;
    }
    *file = None; // cerrar antes de renombrar (Windows no renombra archivos abiertos)
    let current = dir.join(FILE_NAME);
    let _ = fs::rename(&current, dir.join(format!("{FILE_NAME}.1")));
    *file = open(dir).ok();
}

/// `2026-11-18 20:31:05Z INFO  [twitch] conectado a #canal`
pub(crate) fn format_line(now: SystemTime, level: Level, source: &str, msg: &str) -> String {
    let secs = now.duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let (y, mo, d) = civil_from_days((secs / 86_400) as i64);
    let rem = secs % 86_400;
    // Una línea por evento: los saltos de línea del mensaje se aplanan.
    let msg = msg.replace(['\r', '\n'], " ");
    format!(
        "{y:04}-{mo:02}-{d:02} {:02}:{:02}:{:02}Z {} [{source}] {msg}\n",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60,
        level.tag()
    )
}

/// Días desde 1970-01-01 → (año, mes, día). Algoritmo de Howard Hinnant.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

/// Un pánico (crash) queda en el log antes de que el proceso muera.
fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info.location().map(|l| format!(" en {}:{}", l.file(), l.line())).unwrap_or_default();
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "(sin mensaje)".into());
        error("panic", format!("{payload}{location}"));
        previous(info);
    }));
}

/// Abre la carpeta de logs en el explorador de archivos.
///
/// - Crea la carpeta si no existe (p. ej. si el usuario la borró con la app abierta).
/// - Usa la API del sistema (`SHOpenFolderAndSelectItems` en Windows) vía
///   `tauri-plugin-opener`, en lugar de lanzar `explorer.exe` como proceso hijo:
///   así fallaba con "Ubicación no disponible" según el entorno del proceso.
pub fn reveal(dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("No se pudo crear la carpeta de logs ({}): {e}", dir.display()))?;
    if !dir.is_dir() {
        return Err(format!("La carpeta de logs no existe: {}", dir.display()));
    }
    // `open_path` (ShellExecute sobre la carpeta). `reveal_item_in_dir` (seleccionar
    // app.log) no abría nada al llamarse desde un comando de la app.
    tauri_plugin_opener::open_path(dir, None::<&str>).map_err(|e| {
        warn("logs", format!("no se pudo abrir {}: {e}", dir.display()));
        format!("No se pudo abrir la carpeta de logs. Ábrela a mano: {}", dir.display())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn formats_utc_timestamp_and_flattens_newlines() {
        // 2026-11-18 20:31:05 UTC
        let t = UNIX_EPOCH + Duration::from_secs(1_795_033_865);
        let line = format_line(t, Level::Warn, "ws", "comando rechazado\nsegunda línea");
        assert_eq!(line, "2026-11-18 20:31:05Z WARN  [ws] comando rechazado segunda línea\n");
    }

    #[test]
    fn civil_dates_cover_leap_years() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19_782), (2024, 2, 29));
        assert_eq!(civil_from_days(20_454), (2026, 1, 1));
    }

    #[test]
    fn rotates_when_file_is_too_big() {
        let dir = std::env::temp_dir().join(format!("concursillo-log-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), vec![b'x'; (MAX_BYTES + 1) as usize]).unwrap();
        let mut file = Some(open(&dir).unwrap());
        rotate_if_needed(&dir, &mut file);
        assert!(dir.join("app.log.1").exists());
        assert_eq!(fs::metadata(dir.join(FILE_NAME)).unwrap().len(), 0);
        drop(file);
        let _ = fs::remove_dir_all(&dir);
    }
}
