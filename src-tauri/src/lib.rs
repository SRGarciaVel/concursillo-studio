pub mod comodines;
pub mod files;
pub mod game;
pub mod presets;
pub mod schemas;
pub mod server;
pub mod twitch;

use std::sync::Arc;

use files::QuestionsDir;
use game::GameState;
use presets::PresetsDir;
use schemas::GameMode;
use server::{stage::AssetLookup, AppState};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::new(GameState::new(GameMode::Millonario, 15));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            files::save_questions_set,
            files::load_questions_set,
            files::list_questions_sets,
            presets::save_preset,
            presets::load_preset,
            presets::list_presets,
        ])
        .setup(move |app| {
            let data_dir = files::data_dir(app.path().app_data_dir().ok());

            // En release los datos viven en la carpeta del usuario: la primera vez
            // se copian los ejemplos (sets, presets, sonidos) que trae el instalador.
            #[cfg(not(debug_assertions))]
            if let Ok(resources) = app.path().resource_dir() {
                match files::seed_data(&resources.join("data"), &data_dir) {
                    Ok(n) if n > 0 => println!("[datos] {n} archivos de ejemplo copiados a {}", data_dir.display()),
                    Ok(_) => {}
                    Err(e) => eprintln!("[datos] no se pudieron copiar los ejemplos: {e}"),
                }
            }

            app.manage(QuestionsDir::resolve(&data_dir));
            app.manage(PresetsDir::resolve(&data_dir));

            // El stage para OBS se sirve por HTTP desde los assets embebidos en el .exe.
            let handle = app.handle().clone();
            let stage_assets: AssetLookup = Arc::new(move |path: &str| {
                handle.asset_resolver().get(path.to_string()).map(|a| (a.bytes, a.mime_type))
            });

            // Runtime tokio de Tauri: no bloquea el hilo principal.
            let state = app_state.clone();
            let sounds_dir = data_dir.join("sounds");
            tauri::async_runtime::spawn(async move {
                if let Err(e) = server::serve(state, sounds_dir, Some(stage_assets)).await {
                    eprintln!("[server] error: {e}");
                }
            });

            // Ventana del editor: Vite en desarrollo, assets embebidos en producción.
            #[cfg(debug_assertions)]
            let editor_url = tauri::WebviewUrl::External("http://localhost:4324".parse().unwrap());
            #[cfg(not(debug_assertions))]
            let editor_url = tauri::WebviewUrl::App("editor/index.html".into());
            tauri::WebviewWindowBuilder::new(app, "editor", editor_url)
                .title("Concursillo Studio · Editor")
                .inner_size(1100.0, 800.0)
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
