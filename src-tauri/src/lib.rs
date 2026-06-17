use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;

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

fn program_for_engine(engine: &str) -> Result<&'static str, String> {
    match engine {
        "codex" => Ok("codex"),
        "claude-code" => Ok("claude"),
        _ => Err("Unsupported runner engine".to_string()),
    }
}

fn safe_path(input: &str) -> Result<String, String> {
    let path = PathBuf::from(input);
    if path.components().any(|component| matches!(component, std::path::Component::ParentDir)) {
        return Err("Path must not contain parent directory segments".to_string());
    }
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn detect_agent_cli(engine: String) -> Result<CliDetection, String> {
    let program = program_for_engine(&engine)?;
    let output = Command::new("/usr/bin/which")
        .arg(program)
        .output()
        .map_err(|error| error.to_string())?;
    let available = output.status.success();
    let path = if available {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    };
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

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            detect_agent_cli,
            build_agent_runner_command,
            start_agent_runner
        ])
        .run(tauri::generate_context!())
        .expect("error while running AgentPro");
}
