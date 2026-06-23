use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

const DEFAULT_RUNNER_TIMEOUT_SECONDS: u64 = 1800;
const RUNNER_POLL_INTERVAL_MS: u64 = 200;

static ACTIVE_RUNNERS: OnceLock<Mutex<HashMap<String, u32>>> = OnceLock::new();

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CliDetection {
    engine: String,
    available: bool,
    path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunnerCommand {
    engine: String,
    program: String,
    args: Vec<String>,
    workdir: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunnerProcess {
    engine: String,
    pid: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunnerCancelResult {
    engine: String,
    cancelled: bool,
    pid: Option<u32>,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeliveryEntrypoint {
    label: String,
    kind: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeliveryManifest {
    version: u8,
    job_id: String,
    engine: String,
    workspace_path: String,
    deliverable_type: String,
    summary: String,
    entrypoints: Vec<DeliveryEntrypoint>,
    changed_files: Vec<String>,
    untracked_files: Vec<String>,
    preview_command: String,
    build_artifact_missing: bool,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalRunnerResult {
    engine: String,
    exit_code: i32,
    stdout: String,
    stderr: String,
    workdir: String,
    prompt_path: String,
    duration_seconds: f64,
    command: Vec<String>,
    diff_stat: String,
    diff: String,
    delivery_manifest_path: String,
    delivery_manifest: DeliveryManifest,
}

fn active_runners() -> &'static Mutex<HashMap<String, u32>> {
    ACTIVE_RUNNERS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn active_runner_key(job_id: &str, engine: &str) -> String {
    format!("{job_id}:{engine}")
}

fn register_active_runner(job_id: &str, engine: &str, pid: u32) -> Result<(), String> {
    active_runners()
        .lock()
        .map_err(|error| error.to_string())?
        .insert(active_runner_key(job_id, engine), pid);
    Ok(())
}

fn unregister_active_runner(job_id: &str, engine: &str) {
    if let Ok(mut active) = active_runners().lock() {
        active.remove(&active_runner_key(job_id, engine));
    }
}

fn program_for_engine(engine: &str) -> Result<&'static str, String> {
    match engine {
        "codex" => Ok("codex"),
        "claude-code" => Ok("claude"),
        _ => Err("Unsupported runner engine".to_string()),
    }
}

fn resolve_program(engine: &str) -> Result<String, String> {
    let program = program_for_engine(engine)?;
    if let Ok(output) = Command::new("/usr/bin/which").arg(program).output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Ok(path);
            }
        }
    }

    for prefix in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"] {
        let candidate = Path::new(prefix).join(program);
        if candidate.exists() {
            return Ok(candidate.to_string_lossy().to_string());
        }
    }
    Err(format!("{program} CLI 未安装或不在 PATH 中"))
}

fn safe_path(input: &str) -> Result<String, String> {
    let path = PathBuf::from(input);
    if path
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err("Path must not contain parent directory segments".to_string());
    }
    Ok(path.to_string_lossy().to_string())
}

fn expand_user_path(input: &str) -> PathBuf {
    if let Some(rest) = input.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home).join(rest);
        }
    }
    PathBuf::from(input)
}

fn default_runner_workspace_root_path() -> PathBuf {
    if let Some(home) = std::env::var_os("HOME") {
        return PathBuf::from(home).join("AgentPro").join("runs");
    }
    std::env::temp_dir().join("agentpro-runs")
}

fn default_repo_path() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(parent) = manifest_dir.parent() {
        if parent.exists() {
            return Ok(parent.to_path_buf());
        }
    }
    std::env::current_dir().map_err(|error| error.to_string())
}

fn should_ignore(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    matches!(
        name,
        ".git"
            | ".agentpro_runs"
            | "node_modules"
            | "dist"
            | "target"
            | ".venv"
            | "__pycache__"
            | ".pytest_cache"
            | ".ruff_cache"
    ) || name == ".env"
        || name.starts_with(".env.")
        || name.ends_with(".db")
}

fn copy_dir_filtered(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let source_path = entry.path();
        if should_ignore(&source_path) {
            continue;
        }
        let destination_path = destination.join(entry.file_name());
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_dir() {
            copy_dir_filtered(&source_path, &destination_path)?;
        } else if file_type.is_file() {
            fs::copy(&source_path, &destination_path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn prepare_local_workspace(
    job_id: &str,
    engine: &str,
    repo_path: Option<String>,
    workspace_root: Option<String>,
) -> Result<PathBuf, String> {
    let root = workspace_root
        .filter(|value| !value.trim().is_empty())
        .map(|value| expand_user_path(value.trim()))
        .unwrap_or_else(default_runner_workspace_root_path);
    let workdir = root.join(job_id).join(engine);
    if workdir.exists() {
        fs::remove_dir_all(&workdir).map_err(|error| error.to_string())?;
    }
    fs::create_dir_all(workdir.parent().unwrap_or(&root)).map_err(|error| error.to_string())?;

    let source = repo_path
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or(default_repo_path()?);
    let source = source.canonicalize().map_err(|error| error.to_string())?;
    if !source.exists() || !source.is_dir() {
        return Err("本地项目路径不存在或不是目录".to_string());
    }

    let worktree_status = Command::new("git")
        .arg("-C")
        .arg(&source)
        .arg("worktree")
        .arg("add")
        .arg("--detach")
        .arg(&workdir)
        .arg("HEAD")
        .status();

    if !matches!(worktree_status, Ok(status) if status.success()) {
        copy_dir_filtered(&source, &workdir)?;
    }
    Ok(workdir)
}

fn command_for_engine(engine: &str, program: &str, workdir: &Path) -> Result<Vec<String>, String> {
    match engine {
        "codex" => Ok(vec![
            program.to_string(),
            "exec".to_string(),
            "--cd".to_string(),
            workdir.to_string_lossy().to_string(),
            "--sandbox".to_string(),
            "workspace-write".to_string(),
            "--skip-git-repo-check".to_string(),
            "-".to_string(),
        ]),
        "claude-code" => Ok(vec![
            program.to_string(),
            "--print".to_string(),
            "--permission-mode".to_string(),
            "acceptEdits".to_string(),
            "--add-dir".to_string(),
            workdir.to_string_lossy().to_string(),
            "--input-format".to_string(),
            "text".to_string(),
            "--output-format".to_string(),
            "text".to_string(),
        ]),
        _ => Err("Unsupported runner engine".to_string()),
    }
}

fn wait_with_timeout(
    mut child: std::process::Child,
    timeout: Duration,
) -> Result<(Output, bool), String> {
    let started = Instant::now();
    loop {
        if let Some(_status) = child.try_wait().map_err(|error| error.to_string())? {
            return child
                .wait_with_output()
                .map(|output| (output, false))
                .map_err(|error| error.to_string());
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            return child
                .wait_with_output()
                .map(|output| (output, true))
                .map_err(|error| error.to_string());
        }
        thread::sleep(Duration::from_millis(RUNNER_POLL_INTERVAL_MS));
    }
}

fn trim_output(value: String) -> String {
    const LIMIT: usize = 40_000;
    // Count characters, not bytes: slicing by byte index can land mid-UTF-8-char and panic
    // on multi-byte output (Chinese, emoji, …). Truncating by chars is always boundary-safe.
    let total = value.chars().count();
    if total <= LIMIT {
        value
    } else {
        let truncated: String = value.chars().take(LIMIT).collect();
        format!("{truncated}\n...[truncated {} chars]", total - LIMIT)
    }
}

fn run_git_capture(workdir: &Path, args: &[&str]) -> String {
    match Command::new("git").args(args).current_dir(workdir).output() {
        Ok(output) if output.status.success() => {
            trim_output(String::from_utf8_lossy(&output.stdout).to_string())
        }
        Ok(output) => trim_output(String::from_utf8_lossy(&output.stderr).to_string()),
        Err(error) => error.to_string(),
    }
}

fn git_status_files(workdir: &Path) -> (Vec<String>, Vec<String>) {
    let status = run_git_capture(workdir, &["status", "--porcelain"]);
    let mut changed_files = Vec::new();
    let mut untracked_files = Vec::new();

    for line in status.lines() {
        let code = line.get(0..2).unwrap_or("").trim();
        let path = line.get(3..).unwrap_or("").trim();
        if path.is_empty() {
            continue;
        }
        if code == "??" {
            untracked_files.push(path.to_string());
        } else {
            changed_files.push(path.to_string());
        }
    }

    (changed_files, untracked_files)
}

fn iso_timestamp_utc() -> String {
    let output = Command::new("date")
        .arg("-u")
        .arg("+%Y-%m-%dT%H:%M:%SZ")
        .output();
    match output {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        }
        _ => "1970-01-01T00:00:00Z".to_string(),
    }
}

fn build_delivery_manifest(job_id: &str, engine: &str, workdir: &Path) -> DeliveryManifest {
    let (changed_files, untracked_files) = git_status_files(workdir);
    let dist_index = workdir.join("dist").join("index.html");
    let readme = workdir.join("README.md");
    let build_artifact_missing = !dist_index.exists();
    let mut entrypoints = vec![DeliveryEntrypoint {
        label: "Runner 工作区".to_string(),
        kind: "workspace".to_string(),
        path: workdir.to_string_lossy().to_string(),
    }];

    if dist_index.exists() {
        entrypoints.push(DeliveryEntrypoint {
            label: "构建产物".to_string(),
            kind: "build".to_string(),
            path: dist_index.to_string_lossy().to_string(),
        });
    }
    if readme.exists() {
        entrypoints.push(DeliveryEntrypoint {
            label: "运行说明".to_string(),
            kind: "readme".to_string(),
            path: readme.to_string_lossy().to_string(),
        });
    }

    DeliveryManifest {
        version: 1,
        job_id: job_id.to_string(),
        engine: engine.to_string(),
        workspace_path: workdir.to_string_lossy().to_string(),
        deliverable_type: "agentpro_patch".to_string(),
        summary: "本次产物是 AgentPro 源码补丁，而不是独立安装包。".to_string(),
        entrypoints,
        changed_files,
        untracked_files,
        preview_command: "npm run preview -- --host 127.0.0.1".to_string(),
        build_artifact_missing,
        created_at: iso_timestamp_utc(),
    }
}

#[tauri::command]
fn detect_agent_cli(engine: String) -> Result<CliDetection, String> {
    let path = resolve_program(&engine).ok();
    let available = path.is_some();
    Ok(CliDetection {
        engine,
        available,
        path,
    })
}

#[tauri::command]
fn open_local_path(path: String) -> Result<(), String> {
    let safe = PathBuf::from(safe_path(&path)?);
    if !safe.exists() {
        return Err("路径不存在，可能产物目录已被清理。".to_string());
    }
    let status = Command::new("open")
        .arg(&safe)
        .status()
        .map_err(|error| error.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("打开路径失败，退出码：{}", status))
    }
}

#[tauri::command]
fn get_default_runner_workspace_root() -> Result<String, String> {
    let root = default_runner_workspace_root_path();
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    Ok(root.to_string_lossy().to_string())
}

#[tauri::command]
fn select_runner_workspace_root() -> Result<Option<String>, String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg("POSIX path of (choose folder with prompt \"选择 AgentPro Runner 保存目录\")")
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if stderr.to_lowercase().contains("user canceled") || stderr.contains("-128") {
            return Ok(None);
        }
        return Err(if stderr.trim().is_empty() {
            "选择目录失败".to_string()
        } else {
            stderr
        });
    }

    let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if selected.is_empty() {
        return Ok(None);
    }
    let path = PathBuf::from(selected);
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(Some(
        path.to_string_lossy().trim_end_matches('/').to_string(),
    ))
}

#[tauri::command]
fn build_agent_runner_command(
    engine: String,
    prompt_path: String,
    workdir: Option<String>,
) -> Result<RunnerCommand, String> {
    let program = program_for_engine(&engine)?.to_string();
    let safe_prompt_path = safe_path(&prompt_path)?;
    let args = match engine.as_str() {
        "codex" => vec!["exec".to_string(), "--file".to_string(), safe_prompt_path],
        "claude-code" => vec!["--file".to_string(), safe_prompt_path],
        _ => return Err("Unsupported runner engine".to_string()),
    };
    let safe_workdir = workdir.map(|value| safe_path(&value)).transpose()?;
    Ok(RunnerCommand {
        engine,
        program,
        args,
        workdir: safe_workdir,
    })
}

#[tauri::command]
fn start_agent_runner(
    engine: String,
    prompt_path: String,
    workdir: Option<String>,
) -> Result<RunnerProcess, String> {
    let command = build_agent_runner_command(engine.clone(), prompt_path, workdir)?;
    let mut process = Command::new(&command.program);
    process.args(&command.args);
    if let Some(workdir) = &command.workdir {
        process.current_dir(workdir);
    }
    let child = process.spawn().map_err(|error| error.to_string())?;
    Ok(RunnerProcess {
        engine,
        pid: child.id(),
    })
}

fn execute_agent_runner_blocking(
    engine: String,
    job_id: String,
    prompt: String,
    repo_path: Option<String>,
    workspace_root: Option<String>,
    timeout_seconds: Option<u64>,
) -> Result<LocalRunnerResult, String> {
    let program = resolve_program(&engine)?;
    let workdir = prepare_local_workspace(&job_id, &engine, repo_path, workspace_root)?;
    let prompt_path = workdir.join("agentpro-runner-prompt.md");
    fs::write(&prompt_path, &prompt).map_err(|error| error.to_string())?;
    let command = command_for_engine(&engine, &program, &workdir)?;
    let started = Instant::now();

    let mut child = Command::new(&command[0])
        .args(&command[1..])
        .current_dir(&workdir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    register_active_runner(&job_id, &engine, child.id())?;

    if let Some(stdin) = child.stdin.as_mut() {
        if let Err(error) = stdin.write_all(prompt.as_bytes()) {
            unregister_active_runner(&job_id, &engine);
            let _ = child.kill();
            return Err(error.to_string());
        }
    }

    let timeout = Duration::from_secs(timeout_seconds.unwrap_or(DEFAULT_RUNNER_TIMEOUT_SECONDS));
    let wait_result = wait_with_timeout(child, timeout);
    unregister_active_runner(&job_id, &engine);
    let (output, timed_out) = wait_result?;
    let duration = started.elapsed().as_secs_f64();
    let diff_stat = run_git_capture(&workdir, &["diff", "--stat"]);
    let diff = run_git_capture(&workdir, &["diff"]);
    let delivery_manifest = build_delivery_manifest(&job_id, &engine, &workdir);
    let delivery_manifest_path = workdir.join("agentpro-delivery.json");
    let delivery_manifest_json =
        serde_json::to_string_pretty(&delivery_manifest).map_err(|error| error.to_string())?;
    fs::write(&delivery_manifest_path, delivery_manifest_json)
        .map_err(|error| error.to_string())?;

    Ok(LocalRunnerResult {
        engine,
        exit_code: if timed_out {
            124
        } else {
            output.status.code().unwrap_or(-1)
        },
        stdout: trim_output(String::from_utf8_lossy(&output.stdout).to_string()),
        stderr: trim_output(if timed_out {
            format!(
                "Runner command timed out after {} seconds\n{}",
                timeout.as_secs(),
                String::from_utf8_lossy(&output.stderr)
            )
        } else {
            String::from_utf8_lossy(&output.stderr).to_string()
        }),
        workdir: workdir.to_string_lossy().to_string(),
        prompt_path: prompt_path.to_string_lossy().to_string(),
        duration_seconds: (duration * 100.0).round() / 100.0,
        command,
        diff_stat,
        diff,
        delivery_manifest_path: delivery_manifest_path.to_string_lossy().to_string(),
        delivery_manifest,
    })
}

#[tauri::command]
async fn execute_agent_runner(
    engine: String,
    job_id: String,
    prompt: String,
    repo_path: Option<String>,
    workspace_root: Option<String>,
    timeout_seconds: Option<u64>,
) -> Result<LocalRunnerResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        execute_agent_runner_blocking(
            engine,
            job_id,
            prompt,
            repo_path,
            workspace_root,
            timeout_seconds,
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn cancel_agent_runner(job_id: String, engine: String) -> Result<RunnerCancelResult, String> {
    let pid = {
        active_runners()
            .lock()
            .map_err(|error| error.to_string())?
            .get(&active_runner_key(&job_id, &engine))
            .copied()
    };
    let Some(pid) = pid else {
        return Ok(RunnerCancelResult {
            engine,
            cancelled: false,
            pid: None,
            message: "没有正在运行的本机 Runner 进程。".to_string(),
        });
    };

    let status = Command::new("/bin/kill")
        .arg("-TERM")
        .arg(pid.to_string())
        .status()
        .map_err(|error| error.to_string())?;
    if status.success() {
        Ok(RunnerCancelResult {
            engine,
            cancelled: true,
            pid: Some(pid),
            message: "已发送取消信号。".to_string(),
        })
    } else {
        Err(format!("取消 Runner 失败，退出码：{}", status))
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            detect_agent_cli,
            open_local_path,
            get_default_runner_workspace_root,
            select_runner_workspace_root,
            build_agent_runner_command,
            start_agent_runner,
            execute_agent_runner,
            cancel_agent_runner
        ])
        .run(tauri::generate_context!())
        .expect("error while running AgentPro");
}

#[cfg(test)]
mod tests {
    use super::{trim_output, wait_with_timeout};
    use std::process::{Command, Stdio};
    use std::time::Duration;

    #[test]
    fn trim_output_keeps_short_value() {
        let input = "短输出 ok".to_string();
        assert_eq!(trim_output(input.clone()), input);
    }

    #[test]
    fn trim_output_truncates_multibyte_without_panic() {
        // ~45000 Chinese chars (3 bytes each): byte length far exceeds the limit and the
        // 40_000th byte never lands on a char boundary — the old byte slice would panic here.
        let input = "中".repeat(45_000);
        let trimmed = trim_output(input);
        assert!(trimmed.contains("[truncated 5000 chars]"));
        // Result is still valid UTF-8 and retains the truncated prefix.
        assert!(trimmed.starts_with('中'));
    }

    #[test]
    fn wait_with_timeout_kills_slow_process() {
        let child = Command::new("/bin/sh")
            .arg("-c")
            .arg("sleep 1; printf done")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("spawn test process");
        let (_output, timed_out) =
            wait_with_timeout(child, Duration::from_millis(10)).expect("wait with timeout");
        assert!(timed_out);
    }
}
