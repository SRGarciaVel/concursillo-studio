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
            "parse_bulk_questions",
            "bulk_template",
            "save_custom_sound",
            "reset_sound",
            "list_sounds",
            "open_editor",
            "open_logs_folder",
            "copy_to_clipboard",
        ]),
    ))
    .expect("failed to run tauri-build");
}
