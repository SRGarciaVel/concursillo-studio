//! Sirve la vista `/stage` por HTTP para la Browser Source de OBS.
//!
//! En producción los archivos del stage van embebidos en el `.exe` (Tauri los
//! empaqueta desde `frontendDist`), así que no hay que instalar nada aparte:
//! Axum los pide al `AssetResolver` de Tauri. En desarrollo, si no hay build,
//! redirige al servidor de Vite del stage.

use std::sync::Arc;

use axum::{
    body::Body,
    extract::Path,
    http::{header, StatusCode},
    response::{IntoResponse, Redirect, Response},
    routing::get,
    Router,
};

/// Busca un asset del frontend por ruta (`"stage/index.html"`) → (bytes, mime).
pub type AssetLookup = Arc<dyn Fn(&str) -> Option<(Vec<u8>, String)> + Send + Sync>;

/// URL del Vite del stage en desarrollo.
pub const DEV_STAGE_URL: &str = "http://localhost:4323";

pub fn routes<S: Clone + Send + Sync + 'static>(assets: Option<AssetLookup>) -> Router<S> {
    let index = {
        let assets = assets.clone();
        move || serve(assets.clone(), String::new())
    };
    let file = move |Path(path): Path<String>| serve(assets.clone(), path);
    Router::new()
        // Sin barra final las rutas relativas (./assets/...) se resolverían mal.
        .route("/stage", get(|| async { Redirect::permanent("/stage/") }))
        .route("/stage/", get(index))
        .route("/stage/*path", get(file))
}

async fn serve(assets: Option<AssetLookup>, path: String) -> Response {
    let path = path.trim_start_matches('/');
    if path.split('/').any(|seg| seg == "..") {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let wanted = if path.is_empty() { "index.html".to_string() } else { path.to_string() };
    let lookup = |p: &str| assets.as_ref().and_then(|f| f(&format!("stage/{p}")));
    // Rutas sin extensión (navegación de SPA) → index.html.
    let found = lookup(&wanted).or_else(|| (!wanted.contains('.')).then(|| lookup("index.html")).flatten());
    match found {
        Some((bytes, mime)) => Response::builder()
            .header(header::CONTENT_TYPE, mime)
            .header(header::CACHE_CONTROL, "no-cache")
            .body(Body::from(bytes))
            .unwrap(),
        None if cfg!(debug_assertions) => Redirect::temporary(&format!("{DEV_STAGE_URL}/{path}")).into_response(),
        None => (StatusCode::NOT_FOUND, "Stage no encontrado en el ejecutable").into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use tower::ServiceExt;

    fn fake_assets() -> AssetLookup {
        Arc::new(|path: &str| match path {
            "stage/index.html" => Some((b"<html>stage</html>".to_vec(), "text/html".into())),
            "stage/assets/app.js" => Some((b"console.log(1)".to_vec(), "text/javascript".into())),
            _ => None,
        })
    }

    async fn get(app: &Router, uri: &str) -> (StatusCode, Option<String>, String) {
        let res = app.clone().oneshot(axum::http::Request::get(uri).body(Body::empty()).unwrap()).await.unwrap();
        let status = res.status();
        let loc = res.headers().get(header::LOCATION).map(|v| v.to_str().unwrap().to_string());
        let body = String::from_utf8(to_bytes(res.into_body(), 1 << 20).await.unwrap().to_vec()).unwrap();
        (status, loc, body)
    }

    #[tokio::test]
    async fn serves_embedded_stage() {
        let app: Router = routes(Some(fake_assets()));
        assert_eq!(get(&app, "/stage").await.1.as_deref(), Some("/stage/"));
        assert_eq!(get(&app, "/stage/").await.2, "<html>stage</html>");
        assert_eq!(get(&app, "/stage/assets/app.js").await.2, "console.log(1)");
        assert_eq!(get(&app, "/stage/alguna/ruta").await.2, "<html>stage</html>", "fallback SPA");
        assert_eq!(get(&app, "/stage/../secret").await.0, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn missing_build_redirects_to_vite_in_dev() {
        let app: Router = routes(None);
        let (status, loc, _) = get(&app, "/stage/").await;
        assert_eq!(status, StatusCode::TEMPORARY_REDIRECT);
        assert_eq!(loc.as_deref(), Some("http://localhost:4323/"));
    }
}
