pub mod bulk;
pub mod comodines;
pub mod files;
pub mod game;
pub mod logger;
pub mod presets;
pub mod schemas;
pub mod server;
pub mod sounds;
pub mod twitch;

use std::sync::Arc;

use files::QuestionsDir;
use game::GameState;
use presets::PresetsDir;
use schemas::GameMode;
use server::{stage::AssetLookup, AppState};
use sounds::{DefaultSoundsDir, SoundsDir};
use tauri::{AppHandle, Manager, WindowEvent};

/// Etiqueta de la ventana secundaria del editor.
const EDITOR_LABEL: &str = "editor";

/// Abre el editor, o lo trae al frente si ya está abierto.
fn show_editor(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(EDITOR_LABEL) {
        window.unminimize()?;
        window.show()?;
        return window.set_focus();
    }
    // Vite en desarrollo, assets embebidos en producción.
    #[cfg(debug_assertions)]
    let url = tauri::WebviewUrl::External("http://localhost:4324".parse().unwrap());
    #[cfg(not(debug_assertions))]
    let url = tauri::WebviewUrl::App("editor/index.html".into());
    tauri::WebviewWindowBuilder::new(app, EDITOR_LABEL, url)
        .title("Concursillo Studio · Editor")
        .inner_size(1100.0, 800.0)
        .build()?;
    Ok(())
}

/// Botón "Abrir editor" del panel de control.
/// Tiene que ser `async`: en Windows, crear una ventana desde un comando
/// síncrono bloquea WebView2 (la ventana se queda en `about:blank`).
#[tauri::command]
async fn open_editor(app: AppHandle) -> Result<(), String> {
    show_editor(&app).map_err(|e| e.to_string())
}

/// Copia texto al portapapeles del sistema (botón "Copiar URL" de OBS).
/// Se hace desde Rust porque `navigator.clipboard` en WebView2 exige que la
/// ventana tenga el foco y un gesto de usuario "reciente", y falla en silencio
/// si el streamer está con OBS delante.
#[tauri::command]
fn copy_to_clipboard(app: AppHandle, text: String) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    if text.len() > 4096 {
        return Err("Texto demasiado largo para copiar".into());
    }
    app.clipboard().write_text(text).map_err(|e| {
        logger::warn("clipboard", format!("no se pudo copiar: {e}"));
        e.to_string()
    })
}

/// Botón "Abrir carpeta de logs" del panel de control.
#[tauri::command]
fn open_logs_folder() -> Result<(), String> {
    let dir = logger::dir().ok_or("El registro no está disponible")?;
    let result = logger::reveal(dir);
    logger::info("logs", format!("abrir carpeta {} → {}", dir.display(), if result.is_ok() { "ok" } else { "error" }));
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::new(GameState::new(GameMode::Millonario, 15));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            files::save_questions_set,
            files::load_questions_set,
            files::list_questions_sets,
            presets::save_preset,
            presets::load_preset,
            presets::list_presets,
            bulk::parse_bulk_questions,
            bulk::bulk_template,
            sounds::save_custom_sound,
            sounds::reset_sound,
            sounds::list_sounds,
            open_editor,
            open_logs_folder,
            copy_to_clipboard,
        ])
        // El editor es secundario: cerrarlo no afecta a nada. Cerrar el panel
        // de control (ventana principal) cierra la app entera, editor incluido.
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, WindowEvent::CloseRequested { .. }) {
                window.app_handle().exit(0);
            }
        })
        .setup(move |app| {
            // Logs siempre en %APPDATA%\com.concursillo.studio\logs (también en
            // desarrollo, para no ensuciar el repositorio).
            if let Ok(app_data) = app.path().app_data_dir() {
                if let Err(e) = logger::init(&app_data.join("logs")) {
                    eprintln!("[logger] no se pudo abrir el log: {e}");
                }
            }
            logger::info("app", format!("Concursillo Studio {} arrancando", env!("CARGO_PKG_VERSION")));
            if let Some(dir) = logger::dir() {
                logger::info("app", format!("logs en {:?}", dir));
            }

            let data_dir = files::data_dir(app.path().app_data_dir().ok());
            let resources = app.path().resource_dir().ok();

            // En release los datos viven en la carpeta del usuario: la primera vez
            // se copian los ejemplos (sets, presets, sonidos) que trae el instalador.
            #[cfg(not(debug_assertions))]
            if let Some(resources) = &resources {
                match files::seed_data(&resources.join("data"), &data_dir) {
                    Ok(n) if n > 0 => logger::info("datos", format!("{n} archivos de ejemplo copiados a {}", data_dir.display())),
                    Ok(_) => {}
                    Err(e) => logger::error("datos", format!("no se pudieron copiar los ejemplos: {e}")),
                }
            }

            app.manage(QuestionsDir::resolve(&data_dir));
            app.manage(PresetsDir::resolve(&data_dir));
            app.manage(SoundsDir(data_dir.join("sounds")));
            // Originales empaquetados (también en desarrollo: target/<perfil>/data/sounds).
            app.manage(DefaultSoundsDir(
                resources.map(|r| r.join("data").join("sounds")).filter(|d| d.is_dir()),
            ));
            // Los comandos IPC (p. ej. sonidos) también avisan a los clientes por WS.
            app.manage(app_state.clone());

            // El stage para OBS se sirve por HTTP desde los assets embebidos en el .exe.
            // En desarrollo NO: el resolver leería un dist/ viejo; /stage redirige a Vite.
            let stage_assets: Option<AssetLookup> = if cfg!(debug_assertions) {
                None
            } else {
                let handle = app.handle().clone();
                Some(Arc::new(move |path: &str| {
                    handle.asset_resolver().get(path.to_string()).map(|a| (a.bytes, a.mime_type))
                }))
            };

            // Runtime tokio de Tauri: no bloquea el hilo principal.
            let state = app_state.clone();
            let sounds_dir = data_dir.join("sounds");
            tauri::async_runtime::spawn(async move {
                if let Err(e) = server::serve(state, sounds_dir, stage_assets).await {
                    // Típico: el puerto 4322 ya está ocupado (otra instancia abierta).
                    logger::error("server", format!("el servidor no pudo arrancar: {e}"));
                }
            });

            show_editor(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
