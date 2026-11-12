#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod model_runtime;
use futures_util::StreamExt;
use model_runtime::ModelServer;
use std::{
    collections::HashMap,
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::Child,
    sync::Mutex,
    time::Duration,
};
use tauri::{ipc::Channel, Manager, RunEvent, State};
use tokio_util::sync::CancellationToken;

#[derive(Default)]
struct Requests(Mutex<HashMap<String, CancellationToken>>);

fn endpoint(value: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(value).map_err(|_| "Invalid endpoint")?;
    if url.scheme() != "http"
        || url.host_str() != Some("127.0.0.1")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Loopback model endpoint required".into());
    }
    Ok(url)
}
fn client(timeout: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(timeout))
        .build()
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn model_health(endpoint: String) -> Result<bool, String> {
    let base = self::endpoint(&endpoint)?;
    Ok(client(3)?
        .get(base.join("health").map_err(|e| e.to_string())?)
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false))
}
#[tauri::command]
async fn model_stream(
    endpoint: String,
    body: String,
    id: String,
    on_chunk: Channel<Vec<u8>>,
    requests: State<'_, Requests>,
) -> Result<(), String> {
    let base = self::endpoint(&endpoint)?;
    if body.len() > 65536 || id.len() > 64 {
        return Err("Request too large".into());
    }
    let token = CancellationToken::new();
    {
        let mut active = requests.0.lock().map_err(|e| e.to_string())?;
        if !active.is_empty() {
            return Err("Channel busy".into());
        }
        active.insert(id.clone(), token.clone());
    }
    let result = async {
        let response = tokio::select! {
            _ = token.cancelled() => return Err("Cancelled".to_string()),
            response = client(45)?.post(base.join("v1/chat/completions").map_err(|e| e.to_string())?)
                .header("Content-Type","application/json").body(body).send() => response.map_err(|e| e.to_string())?,
        };
        if !response.status().is_success() { return Err("Model unavailable".into()); }
        let mut stream = response.bytes_stream();
        let mut count = 0;
        loop {
            let chunk = tokio::select! {
                _ = token.cancelled() => return Err("Cancelled".to_string()),
                next = stream.next() => next,
            };
            match chunk {
                None => break,
                Some(Err(e)) => return Err(e.to_string()),
                Some(Ok(bytes)) => {
                    count += bytes.len();
                    if count > 524288 { return Err("Response too large".into()); }
                    on_chunk.send(bytes.to_vec()).map_err(|e| e.to_string())?;
                }
            }
        }
        Ok(())
    }.await;
    requests.0.lock().map_err(|e| e.to_string())?.remove(&id);
    result
}
#[tauri::command]
fn model_cancel(id: String, requests: State<'_, Requests>) {
    if let Ok(mut active) = requests.0.lock() {
        if let Some(token) = active.remove(&id) {
            token.cancel();
        }
    }
}
/// Ties the server's lifetime to the game: when the game exits for any reason, including a
/// crash, Windows closes the job and ends the server with it.
#[cfg(windows)]
fn bind_to_game(child: &Child) {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    // SAFETY: plain Win32 calls on a zeroed limits struct and the live child's process handle.
    // The job handle is deliberately never closed; the OS closes it when the game exits.
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return;
        }
        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &limits as *const _ as *const core::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        AssignProcessToJobObject(job, child.as_raw_handle() as _);
    }
}
/// Starts the bundled model server on the configured loopback port. Returns false when no
/// runtime and weights are installed, so the game keeps its authored fallback dialogue.
/// Where the release keeps its models, and where a development checkout keeps them.
fn model_roots() -> (PathBuf, PathBuf) {
    let beside = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf))
        .unwrap_or_default()
        .join("model");
    let development = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join(".tools");
    (beside, development)
}
/// The model the player chose in the configuration; "auto" (or none) follows the launcher's
/// SIGNAL91_MODEL, so the "Start with ... model.cmd" files keep working.
fn preference(choice: Option<String>) -> Result<String, String> {
    let choice = choice.unwrap_or_default();
    match choice.as_str() {
        "" | "auto" => Ok(std::env::var("SIGNAL91_MODEL").unwrap_or_default()),
        "minicpm2" | "small" | "horizon" | "bonsai" => Ok(choice),
        _ => Err("Unknown model".into()),
    }
}
fn checked(endpoint: &str, model: &str) -> Result<u16, String> {
    let base = self::endpoint(endpoint)?;
    if model.is_empty()
        || model.len() > 64
        || !model
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
    {
        return Err("Invalid model alias".into());
    }
    Ok(base.port_or_known_default().unwrap_or(80))
}
fn server_log(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().and_then(|dir| {
        std::fs::create_dir_all(&dir)
            .ok()
            .map(|_| dir.join("llama-server.log"))
    })
}
/// Something else answers on the model port (a separately started server).
fn port_taken(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&address, Duration::from_millis(300)).is_ok()
}
/// A model server already answers its health check on this port (one started by hand).
async fn model_answers(port: u16) -> bool {
    let Ok(client) = client(2) else {
        return false;
    };
    client
        .get(format!("http://127.0.0.1:{port}/health"))
        .send()
        .await
        .is_ok_and(|response| response.status().is_success())
}
/// A loopback port nothing listens on.
fn free_port() -> Option<u16> {
    std::net::TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|listener| listener.local_addr().ok())
        .map(|address| address.port())
}
/// Starts the bundled model and returns the endpoint the game should talk to, or None when
/// no model is installed. A model server someone started by hand on the usual port is used
/// (and never stopped); if some other program holds that port, ours starts on a free one.
#[tauri::command]
async fn model_start(
    endpoint: String,
    model: String,
    choice: Option<String>,
    app: tauri::AppHandle,
    server: State<'_, ModelServer>,
) -> Result<Option<String>, String> {
    let wanted = checked(&endpoint, &model)?;
    let url = |port: u16| format!("http://127.0.0.1:{port}");
    if let Some(port) = server.port() {
        return Ok(Some(url(port)));
    }
    let port = if !port_taken(wanted) {
        wanted
    } else if model_answers(wanted).await {
        return Ok(Some(url(wanted)));
    } else {
        free_port().ok_or("No free port")?
    };
    let (beside, development) = model_roots();
    let choices = model_runtime::installations(&beside, &development, &preference(choice)?);
    Ok(server
        .start(choices, port, model, server_log(&app))?
        .then(|| url(port)))
}
/// The player picked another model (or none) in the configuration: stop ours, start that.
#[tauri::command]
fn model_select(
    endpoint: String,
    model: String,
    choice: String,
    app: tauri::AppHandle,
    server: State<'_, ModelServer>,
) -> Result<bool, String> {
    let port = checked(&endpoint, &model)?;
    if choice == "off" {
        server.switch_off();
        return Ok(true);
    }
    let preference = preference(Some(choice))?;
    // A server the game did not start is left alone.
    if !server.state().owned && port_taken(port) {
        return Ok(false);
    }
    let (beside, development) = model_roots();
    let choices = model_runtime::installations(&beside, &development, &preference);
    server.restart(choices, port, model, server_log(&app))
}
#[derive(serde::Serialize)]
struct ModelState {
    installed: Vec<&'static str>,
    #[serde(flatten)]
    server: model_runtime::ServerState,
}
#[tauri::command]
fn model_state(server: State<'_, ModelServer>) -> ModelState {
    let (beside, development) = model_roots();
    ModelState {
        installed: model_runtime::installed(&beside, &development)
            .into_iter()
            .map(model_runtime::ModelKind::key)
            .collect(),
        server: server.state(),
    }
}
#[tauri::command]
fn model_use_fallback(server: State<'_, ModelServer>) {
    server.use_small();
}
#[tauri::command]
fn load_save(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("session.json");
    match std::fs::read_to_string(path) {
        Ok(data) if data.len() <= 1_000_000 => Ok(Some(data)),
        Ok(_) => Ok(None),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
#[tauri::command]
fn save_game(app: tauri::AppHandle, data: String) -> Result<(), String> {
    if data.len() > 1_000_000 || serde_json::from_str::<serde_json::Value>(&data).is_err() {
        return Err("Invalid save".into());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let temporary = dir.join("session.pending.json");
    std::fs::write(&temporary, data).map_err(|e| e.to_string())?;
    std::fs::rename(temporary, dir.join("session.json")).map_err(|e| e.to_string())
}
/// Hands browser shortcuts (F5 reload, F7 caret browsing, Ctrl+F find, Ctrl+P print ...) to
/// the game: the period programs use those keys themselves.
#[cfg(windows)]
fn release_browser_keys(app: &tauri::App) {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows_core::Interface;
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.with_webview(|webview| {
        // SAFETY: COM calls on the live WebView2 controller, made on its own UI thread.
        unsafe {
            let settings = webview
                .controller()
                .CoreWebView2()
                .and_then(|core| core.Settings())
                .and_then(|settings| settings.cast::<ICoreWebView2Settings3>());
            if let Ok(settings) = settings {
                let _ = settings.SetAreBrowserAcceleratorKeysEnabled(false);
            }
        }
    });
}
/// Microsoft's WebView2 runtime draws the game. Windows 11 and updated Windows 10 have it;
/// without it the window could never open, so say so and offer Microsoft's download page.
#[cfg(windows)]
fn webview2_present() -> bool {
    use webview2_com::Microsoft::Web::WebView2::Win32::GetAvailableCoreWebView2BrowserVersionString;
    let mut version = windows_core::PWSTR::null();
    // SAFETY: asks the WebView2 loader for the installed runtime's version into `version`.
    let found = unsafe {
        GetAvailableCoreWebView2BrowserVersionString(windows_core::PCWSTR::null(), &mut version)
    }
    .is_ok()
        && !version.is_null();
    if !version.is_null() {
        let _ = webview2_com::take_pwstr(version);
    }
    found
}
#[cfg(windows)]
fn explain_missing_webview2() {
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, IDOK, MB_ICONWARNING, MB_OKCANCEL, SW_SHOWNORMAL,
    };
    let wide = |text: &str| text.encode_utf16().chain([0]).collect::<Vec<u16>>();
    let title = wide("SIGNAL/91");
    let text = wide(
        "SIGNAL/91 needs the Microsoft Edge WebView2 Runtime, which this PC does not have.\n\n\
         It is free and comes with Windows 11 and updated Windows 10. Press OK to open \
         Microsoft's download page, install the Evergreen runtime, then start the game again.",
    );
    // SAFETY: plain Win32 calls with null-terminated UTF-16 strings that outlive them.
    unsafe {
        if MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            title.as_ptr(),
            MB_OKCANCEL | MB_ICONWARNING,
        ) == IDOK
        {
            let open = wide("open");
            let page = wide("https://developer.microsoft.com/microsoft-edge/webview2/");
            ShellExecuteW(
                std::ptr::null_mut(),
                open.as_ptr(),
                page.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                SW_SHOWNORMAL,
            );
        }
    }
}
fn main() {
    #[cfg(windows)]
    if !webview2_present() {
        explain_missing_webview2();
        return;
    }
    tauri::Builder::default()
        .setup(|_app| {
            #[cfg(windows)]
            release_browser_keys(_app);
            Ok(())
        })
        .manage(Requests::default())
        .manage(ModelServer::default())
        .invoke_handler(tauri::generate_handler![
            model_health,
            model_start,
            model_select,
            model_state,
            model_use_fallback,
            model_stream,
            model_cancel,
            load_save,
            save_game
        ])
        .build(tauri::generate_context!())
        .expect("Unable to start AEGIS terminal")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<ModelServer>().stop();
            }
        });
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_non_loopback_destinations() {
        for address in [
            "http://localhost:8080",
            "https://127.0.0.1",
            "http://example.com",
            "http://127.0.0.1@evil.com",
            "http://127.0.0.1/path",
            "http://127.0.0.1?x=1",
        ] {
            assert!(endpoint(address).is_err(), "{address}");
        }
        assert!(endpoint("http://127.0.0.1:8080").is_ok());
    }
}
