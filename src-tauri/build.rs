fn main() {
    // Declara los comandos propios para que Tauri genere sus permisos
    // (`allow-save-questions-set`, etc.) y se puedan conceder en capabilities/.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "save_questions_set",
            "load_questions_set",
            "list_questions_sets",
            "save_preset",
            "load_preset",
            "list_presets",
        ]),
    ))
    .expect("failed to run tauri-build");
}
