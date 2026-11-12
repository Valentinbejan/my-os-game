//! Optional local inference, supervised independently of the game and its saved session.
use std::{
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

pub const MINICPM2_FILE: &str = "MiniCPM5-2B-Q4_K_M.gguf";
pub const HORIZON_FILE: &str = "K2-Horizon-4B-Q4_K_M.gguf";
pub const BONSAI_FILE: &str = "Ternary-Bonsai-2-27B-Abliterated-PTQ1_0.gguf";
pub const SMALL_FILE: &str = "Huihui-MiniCPM5-1B-abliterated.Q4_K_M.gguf";
const SERVER_FILE: &str = if cfg!(windows) {
    "llama-server.exe"
} else {
    "llama-server"
};

#[derive(Clone, Debug)]
pub struct Installation {
    pub binary: PathBuf,
    pub weights: PathBuf,
    pub kind: ModelKind,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ModelKind {
    MiniCpm2,
    Horizon,
    Bonsai,
    Small,
}

impl ModelKind {
    fn folder(self) -> &'static str {
        match self {
            Self::MiniCpm2 => "llama",
            Self::Horizon => "llama-k2",
            Self::Bonsai => "llama-prism",
            Self::Small => "llama",
        }
    }
    fn file(self) -> &'static str {
        match self {
            Self::MiniCpm2 => MINICPM2_FILE,
            Self::Horizon => HORIZON_FILE,
            Self::Bonsai => BONSAI_FILE,
            Self::Small => SMALL_FILE,
        }
    }
    /// The name the game's configuration page uses for this model.
    pub fn key(self) -> &'static str {
        match self {
            Self::MiniCpm2 => "minicpm2",
            Self::Horizon => "horizon",
            Self::Bonsai => "bonsai",
            Self::Small => "small",
        }
    }
    fn title(self) -> &'static str {
        match self {
            Self::MiniCpm2 => "MiniCPM5-2B",
            Self::Horizon => "Horizon",
            Self::Bonsai => "Bonsai",
            Self::Small => "Small model",
        }
    }
}

/// Prefer MiniCPM5-2B; preserve Horizon/Bonsai as explicit choices and MiniCPM5-1B as fallback.
/// Packaged installations are self-contained; only development builds search `.tools`.
pub fn installations(packaged: &Path, development: &Path, preference: &str) -> Vec<Installation> {
    let (root, weights_root) = if packaged.is_dir() {
        (packaged, packaged.to_path_buf())
    } else {
        (development, development.join("models"))
    };
    let find = |kind: ModelKind| {
        let item = Installation {
            binary: root.join(kind.folder()).join(SERVER_FILE),
            weights: weights_root.join(kind.file()),
            kind,
        };
        (item.binary.is_file() && item.weights.is_file()).then_some(item)
    };
    let small = find(ModelKind::Small);
    match preference {
        "small" => small.into_iter().collect(),
        "minicpm2" => find(ModelKind::MiniCpm2).into_iter().chain(small).collect(),
        "bonsai" => find(ModelKind::Bonsai).into_iter().chain(small).collect(),
        "horizon" => find(ModelKind::Horizon).into_iter().chain(small).collect(),
        _ => {
            // Older installations retain their previous preference until MiniCPM5-2B is installed.
            let preferred = find(ModelKind::MiniCpm2)
                .or_else(|| find(ModelKind::Horizon))
                .or_else(|| find(ModelKind::Bonsai));
            preferred.into_iter().chain(small).collect()
        }
    }
}

/// Every model this installation can run, preferred first.
pub fn installed(packaged: &Path, development: &Path) -> Vec<ModelKind> {
    let mut kinds: Vec<ModelKind> = Vec::new();
    for preference in ["minicpm2", "small", "horizon", "bonsai"] {
        for item in installations(packaged, development, preference) {
            if !kinds.contains(&item.kind) {
                kinds.push(item.kind);
            }
        }
    }
    let order = [
        ModelKind::MiniCpm2,
        ModelKind::Small,
        ModelKind::Horizon,
        ModelKind::Bonsai,
    ];
    order
        .into_iter()
        .filter(|kind| kinds.contains(kind))
        .collect()
}

/// The weights as the server should open them: relative to its own folder when they sit
/// beside it (the release) or in `models` beside it (development), so a game folder whose
/// path has spaces or letters outside the system's code page still opens.
fn weights_argument(item: &Installation) -> String {
    let above = item.binary.parent().and_then(Path::parent);
    let name = item
        .weights
        .file_name()
        .map(|n| n.to_string_lossy().into_owned());
    if let (Some(above), Some(name), Some(folder)) = (above, name, item.weights.parent()) {
        let sep = std::path::MAIN_SEPARATOR;
        if folder == above {
            return format!("..{sep}{name}");
        }
        if folder == above.join("models") {
            return format!("..{sep}models{sep}{name}");
        }
    }
    item.weights.to_string_lossy().into_owned()
}

pub fn arguments(item: &Installation, port: u16, alias: &str) -> Vec<String> {
    let mut args = vec![
        "-m".into(),
        weights_argument(item),
        "--host".into(),
        "127.0.0.1".into(),
        "--port".into(),
        port.to_string(),
        "--alias".into(),
        alias.into(),
        // Two slots of 8192 tokens each: the site assistant and the other one keep their own
        // prompts cached, so the voice that answers can change without reading one again.
        "--ctx-size".into(),
        "16384".into(),
        "--parallel".into(),
        "2".into(),
        "--reasoning".into(),
        "off".into(),
        "--no-webui".into(),
        "--offline".into(),
    ];
    match item.kind {
        // llama.cpp picks its thread count from the processor it finds, whatever the PC.
        ModelKind::MiniCpm2 | ModelKind::Horizon => args.push("--jinja".into()),
        ModelKind::Bonsai => args.extend(
            [
                "--device",
                "CUDA0",
                "--fit",
                "on",
                "--fit-target",
                "768",
                "--batch-size",
                "256",
                "--ubatch-size",
                "128",
                "--jinja",
            ]
            .into_iter()
            .map(str::to_owned),
        ),
        ModelKind::Small => {}
    }
    args
}

#[derive(Default)]
struct Running {
    child: Option<Child>,
    started: bool,
    stopping: bool,
    preferred: bool,
    fallback_requested: bool,
    /// Bumped by every restart: a supervisor loop from an older generation leaves at once.
    generation: u64,
    /// The model the current server runs, and whether it has answered its health check.
    active: Option<ModelKind>,
    ready: bool,
    /// The loopback port the server listens on.
    port: u16,
}

/// What the game's menus show about the model server.
#[derive(Clone, Debug, serde::Serialize)]
pub struct ServerState {
    pub active: Option<&'static str>,
    pub ready: bool,
    /// The game started this server (not a separately started one).
    pub owned: bool,
}

#[derive(Clone, Default)]
pub struct ModelServer(Arc<Mutex<Running>>);

fn stop_child(running: &mut Running) {
    if let Some(mut child) = running.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn note(path: Option<&Path>, message: &str) {
    if let Some(mut file) =
        path.and_then(|p| OpenOptions::new().create(true).append(true).open(p).ok())
    {
        let _ = writeln!(file, "\nSIGNAL91: {message}");
    }
}

impl ModelServer {
    pub fn stop(&self) {
        if let Ok(mut running) = self.0.lock() {
            running.stopping = true;
            stop_child(&mut running);
        }
    }

    /// Stops the server so another model can start, or none at all.
    pub fn switch_off(&self) {
        if let Ok(mut running) = self.0.lock() {
            running.generation += 1;
            running.started = false;
            running.active = None;
            running.ready = false;
            stop_child(&mut running);
        }
    }

    /// Stops the running model and starts the first of `choices` that works.
    pub fn restart(
        &self,
        choices: Vec<Installation>,
        port: u16,
        alias: String,
        log: Option<PathBuf>,
    ) -> Result<bool, String> {
        self.switch_off();
        self.start(choices, port, alias, log)
    }

    pub fn state(&self) -> ServerState {
        match self.0.lock() {
            Ok(running) => ServerState {
                active: running.active.map(ModelKind::key),
                ready: running.ready,
                owned: running.started,
            },
            Err(_) => ServerState {
                active: None,
                ready: false,
                owned: false,
            },
        }
    }

    pub fn use_small(&self) {
        if let Ok(mut running) = self.0.lock() {
            if running.preferred {
                running.fallback_requested = true;
            }
        }
    }

    /// The port the game's own server listens on, once one is started.
    pub fn port(&self) -> Option<u16> {
        self.0
            .lock()
            .ok()
            .filter(|running| running.started)
            .map(|running| running.port)
    }

    pub fn start(
        &self,
        choices: Vec<Installation>,
        port: u16,
        alias: String,
        log: Option<PathBuf>,
    ) -> Result<bool, String> {
        let mut running = self.0.lock().map_err(|e| e.to_string())?;
        if running.started {
            return Ok(true);
        }
        if choices.is_empty() {
            return Ok(false);
        }
        running.started = true;
        running.port = port;
        let generation = running.generation;
        let supervisor = self.clone();
        tauri::async_runtime::spawn(async move {
            supervisor
                .supervise(choices, port, alias, log, generation)
                .await;
        });
        Ok(true)
    }

    async fn supervise(
        &self,
        choices: Vec<Installation>,
        port: u16,
        alias: String,
        log: Option<PathBuf>,
        generation: u64,
    ) {
        if let Some(path) = &log {
            let _ = std::fs::write(path, "");
        }
        let count = choices.len();
        for (index, item) in choices.into_iter().enumerate() {
            note(
                log.as_deref(),
                &format!("Starting {}", item.weights.display()),
            );
            let spawned = {
                let Ok(mut running) = self.0.lock() else {
                    return;
                };
                if running.stopping || running.generation != generation {
                    return;
                }
                // A slow or failed reply moves to the next model only when there is one: the
                // last (or only) model is never stopped for being slow.
                running.preferred = index + 1 < count;
                running.active = Some(item.kind);
                running.ready = false;
                running.fallback_requested = false;
                let output = log
                    .as_deref()
                    .and_then(|p| OpenOptions::new().create(true).append(true).open(p).ok());
                let mut command = Command::new(&item.binary);
                command
                    .args(arguments(&item, port, &alias))
                    .current_dir(item.binary.parent().unwrap_or(Path::new(".")))
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(output.map(Stdio::from).unwrap_or_else(Stdio::null));
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
                }
                match command.spawn() {
                    Ok(child) => {
                        #[cfg(windows)]
                        super::bind_to_game(&child);
                        running.child = Some(child);
                        true
                    }
                    Err(error) => {
                        note(log.as_deref(), &format!("Could not start: {error}"));
                        false
                    }
                }
            };
            if !spawned {
                continue;
            }
            let began = Instant::now();
            let mut ready = false;
            loop {
                let ended = {
                    let Ok(mut running) = self.0.lock() else {
                        return;
                    };
                    if running.stopping {
                        stop_child(&mut running);
                        return;
                    }
                    // A restart has already stopped this loop's server and started another.
                    if running.generation != generation {
                        return;
                    }
                    let exited = running
                        .child
                        .as_mut()
                        .is_none_or(|c| !matches!(c.try_wait(), Ok(None)));
                    if exited
                        || running.fallback_requested
                        // A slow disk and processor can take minutes to load the weights.
                        || (!ready && began.elapsed() > Duration::from_secs(300))
                    {
                        stop_child(&mut running);
                        true
                    } else {
                        false
                    }
                };
                if ended {
                    break;
                }
                if !ready {
                    if let Ok(client) = super::client(3) {
                        ready = client
                            .get(format!("http://127.0.0.1:{port}/health"))
                            .send()
                            .await
                            .is_ok_and(|response| response.status().is_success());
                    }
                    if ready {
                        note(log.as_deref(), &format!("{} ready.", item.kind.title()));
                        if let Ok(mut running) = self.0.lock() {
                            if running.generation == generation {
                                running.ready = true;
                            }
                        }
                    }
                }
                tokio::time::sleep(Duration::from_millis(if ready { 1000 } else { 300 })).await;
            }
            note(log.as_deref(), "Model stopped, failed to become ready, or could not answer in time; trying the next installed model.");
        }
        note(
            log.as_deref(),
            "No remaining live model. Authored dialogue remains available.",
        );
        if let Ok(mut running) = self.0.lock() {
            if running.generation == generation {
                running.active = None;
                running.ready = false;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn installed(root: &Path, bonsai: bool, packaged: bool) {
        let runtime = root.join(if bonsai { "llama-prism" } else { "llama" });
        let models = if packaged {
            root.to_path_buf()
        } else {
            root.join("models")
        };
        std::fs::create_dir_all(&runtime).unwrap();
        std::fs::create_dir_all(&models).unwrap();
        std::fs::write(runtime.join(SERVER_FILE), "").unwrap();
        std::fs::write(
            models.join(if bonsai { BONSAI_FILE } else { SMALL_FILE }),
            "",
        )
        .unwrap();
    }
    #[test]
    fn prefers_horizon_and_keeps_both_older_models_available() {
        let temp = std::env::temp_dir().join(format!("signal91-models-{}", std::process::id()));
        let dev = temp.join("tools");
        let packaged = temp.join("model");
        installed(&dev, false, false);
        assert_eq!(installations(&packaged, &dev, "").len(), 1);
        installed(&dev, true, false);
        let choices = installations(&packaged, &dev, "");
        assert_eq!(choices[0].kind, ModelKind::Bonsai);
        assert_eq!(choices[1].kind, ModelKind::Small);
        assert!(choices[0]
            .binary
            .ends_with(Path::new("llama-prism").join(SERVER_FILE)));
        assert!(choices[1].weights.ends_with(SMALL_FILE));
        assert_eq!(
            installations(&packaged, &dev, "small")[0].kind,
            ModelKind::Small
        );
        installed_horizon(&dev, false);
        let choices = installations(&packaged, &dev, "");
        assert_eq!(choices[0].kind, ModelKind::Horizon);
        assert_eq!(choices[1].kind, ModelKind::Small);
        installed_minicpm2(&dev, false);
        let choices = installations(&packaged, &dev, "");
        assert_eq!(choices[0].kind, ModelKind::MiniCpm2);
        assert_eq!(choices[1].kind, ModelKind::Small);
        assert_eq!(
            installations(&packaged, &dev, "horizon")[0].kind,
            ModelKind::Horizon
        );
        assert_eq!(
            installations(&packaged, &dev, "bonsai")[0].kind,
            ModelKind::Bonsai
        );
        // A portable release never silently uses models from its developer's checkout.
        installed(&packaged, false, true);
        let choices = installations(&packaged, &dev, "");
        assert_eq!(choices.len(), 1);
        assert!(choices[0].weights.starts_with(&packaged));
        std::fs::remove_dir_all(temp).unwrap();
    }
    fn installed_horizon(root: &Path, packaged: bool) {
        let runtime = root.join("llama-k2");
        let models = if packaged {
            root.to_path_buf()
        } else {
            root.join("models")
        };
        std::fs::create_dir_all(&runtime).unwrap();
        std::fs::create_dir_all(&models).unwrap();
        std::fs::write(runtime.join(SERVER_FILE), "").unwrap();
        std::fs::write(models.join(HORIZON_FILE), "").unwrap();
    }
    fn installed_minicpm2(root: &Path, packaged: bool) {
        let runtime = root.join("llama");
        let models = if packaged {
            root.to_path_buf()
        } else {
            root.join("models")
        };
        std::fs::create_dir_all(&runtime).unwrap();
        std::fs::create_dir_all(&models).unwrap();
        std::fs::write(runtime.join(SERVER_FILE), "").unwrap();
        std::fs::write(models.join(MINICPM2_FILE), "").unwrap();
    }
    #[test]
    fn lists_installed_models_and_honours_an_explicit_minicpm2_choice() {
        let temp = std::env::temp_dir().join(format!("signal91-installed-{}", std::process::id()));
        let dev = temp.join("tools");
        let packaged = temp.join("model");
        assert!(super::installed(&packaged, &dev).is_empty());
        installed_minicpm2(&dev, false);
        installed(&dev, true, false);
        installed(&dev, false, false);
        assert_eq!(
            super::installed(&packaged, &dev),
            vec![ModelKind::MiniCpm2, ModelKind::Small, ModelKind::Bonsai]
        );
        let choices = installations(&packaged, &dev, "minicpm2");
        assert_eq!(choices[0].kind, ModelKind::MiniCpm2);
        assert_eq!(choices[1].kind, ModelKind::Small);
        std::fs::remove_dir_all(temp).unwrap();
    }
    #[test]
    fn switching_off_retires_the_running_generation() {
        let server = ModelServer::default();
        assert!(!server.start(Vec::new(), 1, "x".into(), None).unwrap());
        {
            let mut running = server.0.lock().unwrap();
            running.started = true;
            running.active = Some(ModelKind::MiniCpm2);
            running.ready = true;
        }
        let before = server.0.lock().unwrap().generation;
        assert!(server.state().owned);
        server.switch_off();
        let state = server.state();
        assert_eq!(server.0.lock().unwrap().generation, before + 1);
        assert!(!state.owned && !state.ready && state.active.is_none());
    }
    #[test]
    fn opens_the_weights_relative_to_the_server_and_lets_it_count_threads() {
        let sep = std::path::MAIN_SEPARATOR;
        // A folder name with spaces and letters outside most code pages.
        let release = Path::new("C:")
            .join("Games")
            .join("Ärger ñ 91")
            .join("model");
        let item = Installation {
            binary: release.join("llama").join(SERVER_FILE),
            weights: release.join(MINICPM2_FILE),
            kind: ModelKind::MiniCpm2,
        };
        let args = arguments(&item, 8080, "signal-91");
        let at = args.iter().position(|a| a == "-m").unwrap();
        assert_eq!(args[at + 1], format!("..{sep}{MINICPM2_FILE}"));
        assert!(!args.iter().any(|a| a == "--threads"));
        let tools = Path::new("C:").join("work").join(".tools");
        let item = Installation {
            binary: tools.join("llama").join(SERVER_FILE),
            weights: tools.join("models").join(MINICPM2_FILE),
            kind: ModelKind::MiniCpm2,
        };
        let args = arguments(&item, 8080, "signal-91");
        let at = args.iter().position(|a| a == "-m").unwrap();
        assert_eq!(args[at + 1], format!("..{sep}models{sep}{MINICPM2_FILE}"));
    }

    #[test]
    fn only_bonsai_requires_cuda_and_all_profiles_stay_offline() {
        for kind in [
            ModelKind::MiniCpm2,
            ModelKind::Horizon,
            ModelKind::Bonsai,
            ModelKind::Small,
        ] {
            let item = Installation {
                binary: "server".into(),
                weights: "model.gguf".into(),
                kind,
            };
            let args = arguments(&item, 8080, "signal-91");
            assert!(args.windows(2).any(|p| p == ["--host", "127.0.0.1"]));
            assert!(args.windows(2).any(|p| p == ["--parallel", "2"]));
            assert!(args.windows(2).any(|p| p == ["--ctx-size", "16384"]));
            assert!(args.iter().any(|a| a == "--offline"));
            assert_eq!(args.iter().any(|a| a == "CUDA0"), kind == ModelKind::Bonsai);
            assert_eq!(
                args.iter().any(|a| a == "--jinja"),
                kind != ModelKind::Small
            );
        }
    }

    #[test]
    #[ignore = "Requires both downloaded runtimes and the small GGUF; starts an isolated local server"]
    fn live_small_fallback_after_minicpm2_load_failure() {
        let project = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let tools = project.join(".tools");
        let choices = vec![
            Installation {
                binary: tools.join("llama").join(SERVER_FILE),
                weights: tools.join("models/INTENTIONALLY-MISSING-TEST-MODEL.gguf"),
                kind: ModelKind::MiniCpm2,
            },
            Installation {
                binary: tools.join("llama").join(SERVER_FILE),
                weights: tools.join("models").join(SMALL_FILE),
                kind: ModelKind::Small,
            },
        ];
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let server = ModelServer::default();
        let log = project.join("artifacts/minicpm2-model-fallback-test.log");
        server
            .start(choices, port, "fallback-test".into(), Some(log.clone()))
            .unwrap();
        let ready = tauri::async_runtime::block_on(async {
            let began = Instant::now();
            while began.elapsed() < Duration::from_secs(60) {
                if let Ok(response) = super::super::client(2)
                    .unwrap()
                    .get(format!("http://127.0.0.1:{port}/health"))
                    .send()
                    .await
                {
                    if response.status().is_success() {
                        return true;
                    }
                }
                tokio::time::sleep(Duration::from_millis(300)).await;
            }
            false
        });
        server.stop();
        assert!(
            ready,
            "The real small model did not take over; see {}",
            log.display()
        );
        let text = std::fs::read_to_string(log).unwrap();
        assert!(text.contains("trying the next installed model"));
        assert!(text.contains(SMALL_FILE));
        assert!(server.0.lock().unwrap().child.is_none());
    }
}
