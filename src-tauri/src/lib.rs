use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;

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
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir().join("agentpro-runs"));
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

fn trim_output(value: String) -> String {
    const LIMIT: usize = 40_000;
    if value.len() <= LIMIT {
        value
    } else {
        format!(
            "{}\n...[truncated {} chars]",
            &value[..LIMIT],
            value.len() - LIMIT
        )
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

    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(prompt.as_bytes())
            .map_err(|error| error.to_string())?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| error.to_string())?;
    let duration = started.elapsed().as_secs_f64();
    let diff_stat = run_git_capture(&workdir, &["diff", "--stat"]);
    let diff = run_git_capture(&workdir, &["diff"]);

    Ok(LocalRunnerResult {
        engine,
        exit_code: output.status.code().unwrap_or(-1),
        stdout: trim_output(String::from_utf8_lossy(&output.stdout).to_string()),
        stderr: trim_output(String::from_utf8_lossy(&output.stderr).to_string()),
        workdir: workdir.to_string_lossy().to_string(),
        prompt_path: prompt_path.to_string_lossy().to_string(),
        duration_seconds: (duration * 100.0).round() / 100.0,
        command,
        diff_stat,
        diff,
    })
}

#[tauri::command]
async fn execute_agent_runner(
    engine: String,
    job_id: String,
    prompt: String,
    repo_path: Option<String>,
    workspace_root: Option<String>,
) -> Result<LocalRunnerResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        execute_agent_runner_blocking(engine, job_id, prompt, repo_path, workspace_root)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            detect_agent_cli,
            build_agent_runner_command,
            start_agent_runner,
            execute_agent_runner
        ])
        .run(tauri::generate_context!())
        .expect("error while running AgentPro");
}
