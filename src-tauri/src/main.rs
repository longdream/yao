#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
// no prelude import; use fully-qualified tauri paths to avoid unused import warnings
use std::io::Write as _;
use tauri::Manager;
use tauri::Window;
use tauri::Emitter;
use std::sync::{OnceLock, atomic::{AtomicBool, Ordering}};
use futures_util::StreamExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfig {
  pub name: String,
  pub provider: String,
  pub base_url: String,
  pub api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
  pub provider: String,
  pub base_url: String,
  pub api_key: Option<String>,
  pub model: Option<String>,
  #[serde(default)]
  pub ollama_path: Option<String>,
  #[serde(default)]
  pub models: Option<Vec<ModelConfig>>,
  #[serde(default)]
  pub streaming_enabled: Option<bool>,
  #[serde(default)]
  pub default_think: Option<bool>,
  #[serde(default)]
  pub max_context_messages: Option<u32>,
  #[serde(default)]
  pub temperature: Option<f64>,
}

#[tauri::command]
async fn proxy_models(config: AppConfig) -> Result<String, String> {
  let client = Client::new();
  let result = if config.provider == "ollama" {
    let url = format!("{}/api/tags", config.base_url.trim_end_matches('/'));
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let list = v.get("models").and_then(|m| m.as_array()).map(|arr| {
      arr.iter()
        .filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))
        .collect::<Vec<String>>()
    }).unwrap_or_default();
    serde_json::to_string(&list).map_err(|e| e.to_string())?
  } else {
    let url = format!("{}/v1/models", config.base_url.trim_end_matches('/'));
    let mut req = client.get(url);
    if let Some(k) = config.api_key {
      req = req.bearer_auth(k);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let list = v.get("data").and_then(|m| m.as_array()).map(|arr| {
      arr.iter()
        .filter_map(|m| m.get("id").and_then(|n| n.as_str()).map(|s| s.to_string()))
        .collect::<Vec<String>>()
    }).unwrap_or_default();
    serde_json::to_string(&list).map_err(|e| e.to_string())?
  };
  Ok(result)
}

#[tauri::command]
async fn proxy_chat_stream(body: String) -> Result<String, String> {
  // In this MVP, return the body handle string back; real-time streaming can be added with events
  Ok(body)
}

#[tauri::command]
async fn proxy_chat(handle: String) -> Result<String, String> {
  #[derive(Deserialize)]
  struct InBody { config: AppConfig, messages: Vec<Message>, model: String, #[serde(default)] think: bool }
  let parsed: InBody = serde_json::from_str(&handle).map_err(|e| e.to_string())?;
  chat_once(parsed.config, parsed.messages, parsed.model, parsed.think).await.map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Message { role: String, content: String }

async fn chat_once(config: AppConfig, messages: Vec<Message>, model: String, think: bool) -> Result<String> {
  eprintln!("[DEBUG] chat_once called with config: provider={}, baseUrl={}, apiKey={:?}", 
    config.provider, config.base_url, config.api_key.as_ref().map(|k| format!("{}...", &k[..std::cmp::min(8, k.len())])));
  let client = Client::new();
  if config.provider == "ollama" {
    // ensure model exists locally; if not, try to pull once
    ensure_ollama_model(&client, &config, &model).await.ok();
    let url = format!("{}/api/chat", config.base_url.trim_end_matches('/'));
    let mut body = serde_json::json!({
      "model": if model.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(model.clone()) },
      "messages": messages,
      "stream": false
    });
    // Handle think mode based on Ollama version
    // For newer versions (0.9+), use reasoning API
    // For older versions (0.6.x), modify the last message content
    if think {
      // Try new API first (for 0.9+)
      body["options"] = serde_json::json!({ "reasoning": { "effort": "medium" } });
    } else {
      // For disabling think in older versions, we might need to add /no_think to the last message
      if let Some(messages_array) = body.get_mut("messages").and_then(|m| m.as_array_mut()) {
        if let Some(last_message) = messages_array.last_mut() {
          if let Some(content) = last_message.get_mut("content").and_then(|c| c.as_str()) {
            // Add /no_think to disable thinking in older Ollama versions
            let new_content = format!("{} /no_think", content);
            last_message["content"] = serde_json::Value::String(new_content);
          }
        }
      }
    }
    let resp = client.post(url).json(&body).send().await?;
    let status = resp.status();
    let text = resp.text().await?;
    // Try parse JSON and get content
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
      if let Some(content) = v
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
      {
        if !content.is_empty() {
          return Ok(content.to_string());
        }
      }
      if let Some(resp_str) = v.get("response").and_then(|c| c.as_str()) {
        if !resp_str.is_empty() {
          return Ok(resp_str.to_string());
        }
      }
      if !status.is_success() {
        let err = v.get("error").and_then(|e| e.as_str()).unwrap_or(text.as_str());
        anyhow::bail!(err.to_string());
      }
    }
    // Fallback: use /api/generate by flattening messages
    let prompt = messages
      .iter()
      .map(|m| format!("{}: {}", m.role, m.content))
      .collect::<Vec<_>>()
      .join("\n");
    let gen_url = format!("{}/api/generate", config.base_url.trim_end_matches('/'));
    let mut gen_body = serde_json::json!({
      "model": if model.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(model.clone()) },
      "prompt": prompt,
      "stream": false
    });
    // Handle think mode for Ollama generate API
    if think {
      gen_body["options"] = serde_json::json!({ "reasoning": { "effort": "medium" } });
    } else {
      // For disabling think in older versions, add /no_think to prompt
      if let Some(prompt_str) = gen_body.get_mut("prompt").and_then(|p| p.as_str()) {
        let new_prompt = format!("{} /no_think", prompt_str);
        gen_body["prompt"] = serde_json::Value::String(new_prompt);
      }
    }
    let gen_resp = client.post(gen_url).json(&gen_body).send().await?;
    let gen_status = gen_resp.status();
    let gen_text = gen_resp.text().await?;
    if let Ok(v2) = serde_json::from_str::<serde_json::Value>(&gen_text) {
      if let Some(resp_str) = v2.get("response").and_then(|c| c.as_str()) {
        return Ok(resp_str.to_string());
      }
      if !gen_status.is_success() {
        let err = v2.get("error").and_then(|e| e.as_str()).unwrap_or(gen_text.as_str());
        anyhow::bail!(err.to_string());
      }
    }
    anyhow::bail!(format!("ollama empty response: status={} body={}", status, text))
  } else {
    let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
    eprintln!("[DEBUG] OpenAI API URL: {}", url);
    let body = serde_json::json!({
      "model": model,
      "messages": messages,
      "stream": false,
      "temperature": config.temperature.unwrap_or(0.6)
    });
    // For OpenAI-compatible APIs, thinking is typically handled differently
    // Remove the reasoning parameter as it might not be supported
    // if think { 
    //   body["reasoning"] = serde_json::json!({ "effort": "medium" }); 
    // }
    eprintln!("[DEBUG] Request body: {}", serde_json::to_string_pretty(&body).unwrap_or_default());
    let mut req = client.post(url)
      .header("Content-Type", "application/json")
      .header("User-Agent", "TautiOllama/1.0")
      .json(&body);
    if let Some(k) = &config.api_key {
      if !k.is_empty() {
        eprintln!("[DEBUG] Using API key: {}...", &k[..std::cmp::min(8, k.len())]);
        req = req.bearer_auth(k);
      } else {
        eprintln!("[DEBUG] API key is empty");
      }
    } else {
      eprintln!("[DEBUG] No API key provided");
    }
    let resp = req.send().await?;
    let status = resp.status();
    let text = resp.text().await?;
    eprintln!("[DEBUG] Response status: {}", status);
    eprintln!("[DEBUG] Response body: {}", text);
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
      if let Some(content) = v
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
      {
        return Ok(content.to_string());
      }
      if !status.is_success() {
        let err = v.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()).unwrap_or(text.as_str());
        anyhow::bail!(err.to_string());
      }
    }
    anyhow::bail!(format!("openai empty response: status={} body={}", status, text))
  }
}

async fn ensure_ollama_model(client: &Client, config: &AppConfig, model: &str) -> Result<()> {
  if model.is_empty() { return Ok(()); }
  // check tags
  let tags_url = format!("{}/api/tags", config.base_url.trim_end_matches('/'));
  if let Ok(resp) = client.get(tags_url).send().await {
    if let Ok(v) = resp.json::<serde_json::Value>().await {
      if v.get("models").and_then(|m| m.as_array()).map(|arr| {
        arr.iter().any(|m| m.get("name").and_then(|n| n.as_str()) == Some(model))
      }).unwrap_or(false) {
        return Ok(());
      }
    }
  }
  // try to pull via CLI
  #[cfg(target_os = "windows")]
  {
    use std::process::Command as P;
    let exe = config.ollama_path.clone().filter(|p| !p.trim().is_empty()).unwrap_or_else(|| "ollama".to_string());
    let _ = P::new("powershell")
      .args([
        "-NoProfile","-WindowStyle","Hidden","-Command",
        &format!("Start-Process -Wait -WindowStyle Hidden -FilePath '{}' -ArgumentList 'pull \"{}\"'", exe.replace("'","''"), model.replace("'","''")),
      ])
      .status();
  }
  #[cfg(not(target_os = "windows"))]
  {
    use std::process::Command as P;
    let exe = config.ollama_path.clone().filter(|p| !p.trim().is_empty()).unwrap_or_else(|| "ollama".to_string());
    let _ = P::new(exe).arg("pull").arg(model).status();
  }
  Ok(())
}

#[tauri::command]
async fn ensure_ollama(config: AppConfig) -> Result<bool, String> {
  let client = Client::new();
  let base = config.base_url.trim_end_matches('/');
  let probe = client
    .get(format!("{}/api/tags", base))
    .send()
    .await
    .map_err(|e| e.to_string());
  if probe.is_ok() {
    return Ok(true);
  }

  static STARTING: OnceLock<AtomicBool> = OnceLock::new();
  let starting = STARTING.get_or_init(|| AtomicBool::new(false));
  // If someone else is already starting, just poll readiness and return
  if starting.load(Ordering::SeqCst) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(12);
    while std::time::Instant::now() < deadline {
      if let Ok(resp) = client.get(format!("{}/api/tags", base)).send().await {
        if resp.status().is_success() { return Ok(true); }
      }
      tokio::time::sleep(std::time::Duration::from_millis(900)).await;
    }
    return Ok(false);
  }
  starting.store(true, Ordering::SeqCst);

  // try start
  #[cfg(target_os = "windows")]
  {
    use std::process::Command as P;
    let exe = config
      .ollama_path
      .clone()
      .filter(|p| !p.trim().is_empty())
      .unwrap_or_else(|| "ollama".to_string());
    // Prefer PowerShell Start-Process to avoid opening folders/windows unexpectedly
    let try_ps = P::new("powershell")
      .args([
        "-NoProfile",
        "-WindowStyle",
        "Hidden",
        "-Command",
        &format!("Start-Process -WindowStyle Hidden -FilePath '{}' -ArgumentList 'serve'", exe.replace("'", "''")),
      ])
      .spawn();
    if try_ps.is_err() {
      // Fallback to cmd start
      let _ = P::new("cmd")
        .args(["/C", "start", "", &exe, "serve"])
        .spawn()
        .map_err(|e| e.to_string())?;
    }
  }
  #[cfg(not(target_os = "windows"))]
  {
    use std::process::Command as P;
    let exe = config
      .ollama_path
      .clone()
      .filter(|p| !p.trim().is_empty())
      .unwrap_or_else(|| "ollama".to_string());
    // background serve
    let _ = P::new(exe)
      .arg("serve")
      .spawn()
      .map_err(|e| e.to_string())?;
  }

  let deadline = std::time::Instant::now() + std::time::Duration::from_secs(12);
  loop {
    if std::time::Instant::now() > deadline {
      break;
    }
    if let Ok(resp) = client.get(format!("{}/api/tags", base)).send().await {
      if resp.status().is_success() {
        starting.store(false, Ordering::SeqCst);
        return Ok(true);
      }
    }
    tokio::time::sleep(std::time::Duration::from_millis(900)).await;
  }
  // As a last resort on Windows, try `ollama run <model>` once to trigger engine init
  #[cfg(target_os = "windows")]
  {
    if let Some(m) = config.model.clone() {
      use std::process::Command as P;
      let exe = config
        .ollama_path
        .clone()
        .filter(|p| !p.trim().is_empty())
        .unwrap_or_else(|| "ollama".to_string());
      let _ = P::new("powershell")
        .args([
          "-NoProfile",
          "-WindowStyle",
          "Hidden",
          "-Command",
          &format!(
            "Start-Process -WindowStyle Hidden -FilePath '{}' -ArgumentList 'run \"{}\" -p \"hello\"'",
            exe.replace("'", "''"),
            m.replace("'", "''")
          ),
        ])
        .spawn();
      let deadline2 = std::time::Instant::now() + std::time::Duration::from_secs(8);
      while std::time::Instant::now() < deadline2 {
        if let Ok(resp) = client.get(format!("{}/api/tags", base)).send().await {
          if resp.status().is_success() { starting.store(false, Ordering::SeqCst); return Ok(true); }
        }
        tokio::time::sleep(std::time::Duration::from_millis(900)).await;
      }
    }
  }
  starting.store(false, Ordering::SeqCst);
  Ok(false)
}

#[tauri::command]
async fn get_log_path(_app: tauri::AppHandle) -> Result<String, String> {
  // Prefer executable directory /logs/app.log
  if let Ok(exe) = std::env::current_exe() {
    if let Some(dir) = exe.parent() {
      let p = dir.join("logs").join("app.log");
      return Ok(p.to_string_lossy().into_owned());
    }
  }
  // Fallback to app data dir
  let base = _app.path().app_local_data_dir().map_err(|e| e.to_string())?;
  let p = base.join("logs").join("app.log");
  Ok(p.to_string_lossy().into_owned())
}

#[tauri::command]
async fn get_conversations_path(_app: tauri::AppHandle) -> Result<String, String> {
  if let Ok(exe) = std::env::current_exe() {
    if let Some(dir) = exe.parent() {
      let p = dir.join("conversations.json");
      return Ok(p.to_string_lossy().into_owned());
    }
  }
  let base = _app.path().app_local_data_dir().map_err(|e| e.to_string())?;
  let p = base.join("conversations.json");
  Ok(p.to_string_lossy().into_owned())
}
#[tauri::command]
async fn write_log_line(_app: tauri::AppHandle, line: String) -> Result<(), String> {
  // Use exe dir logs
  let base = std::env::current_exe().map_err(|e| e.to_string())?;
  let dir = base.parent().ok_or("no parent")?.join("logs");
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let file = dir.join("app.log");
  let mut f = std::fs::OpenOptions::new()
    .create(true)
    .append(true)
    .open(file)
    .map_err(|e| e.to_string())?;
  writeln!(f, "{}", line).map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
async fn get_config_path(_app: tauri::AppHandle) -> Result<String, String> {
  // 始终使用应用数据目录，这样更安全且符合权限配置
  let base = _app.path().app_local_data_dir().map_err(|e| e.to_string())?;
  
  // 确保目录存在
  if let Err(e) = std::fs::create_dir_all(&base) {
    eprintln!("Failed to create config directory: {}", e);
  }
  
  let p = base.join("settings.json");
  Ok(p.to_string_lossy().into_owned())
}

#[tauri::command]
async fn start_chat_stream(window: Window, body: String) -> Result<String, String> {
  #[derive(Deserialize)]
  struct InBody { config: AppConfig, messages: Vec<Message>, model: String, #[serde(default)] think: bool }
  let parsed: InBody = serde_json::from_str(&body).map_err(|e| e.to_string())?;
  // simple unique id without external deps
  let millis = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap_or_else(|_| std::time::Duration::from_millis(0))
    .as_millis();
  let stream_id = format!("stream-{}", millis);
  let sid = stream_id.clone();

  // log start
  if let Ok(_path) = get_log_path(window.app_handle().clone()).await {
    let _ = write_log_line(window.app_handle().clone(), format!(
      "[chat-start] id={} model={} think={} input={}",
      stream_id,
      parsed.model,
      parsed.think,
      parsed
        .messages
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.as_str())
        .unwrap_or("")
    ))
    .await;
  }

  // spawn task
  let win = window.clone();
  tauri::async_runtime::spawn(async move {
    match chat_once(parsed.config, parsed.messages.clone(), parsed.model.clone(), parsed.think).await {
      Ok(content) => {
        // emit chunks by characters batches of 8 for smoother UI
        let mut buf = String::new();
        for (i, ch) in content.chars().enumerate() {
          buf.push(ch);
          if buf.len() >= 8 || i == content.chars().count().saturating_sub(1) {
            let _ = win.emit(&format!("chat-chunk:{}", sid), buf.clone());
            buf.clear();
          }
        }
        let _ = win.emit(&format!("chat-end:{}", sid), "");
        let _ = write_log_line(win.app_handle().clone(), format!(
          "[chat-end] id={} output_len={}",
          sid,
          content.len()
        ))
        .await;
      }
      Err(err) => {
        let _ = win.emit(&format!("chat-error:{}", sid), err.to_string());
        let _ = write_log_line(win.app_handle().clone(), format!(
          "[chat-error] id={} err={}",
          sid,
          err.to_string()
        ))
        .await;
      }
    }
  });

  Ok(stream_id)
}

#[tauri::command]
async fn check_model_exists(window: Window, config: AppConfig, model: String) -> Result<bool, String> {
  if model.is_empty() { 
    let _ = write_log_line(window.app_handle().clone(), format!(
      "[model-check] model=<empty> exists=true"
    )).await;
    return Ok(true); 
  }
  
  let _ = write_log_line(window.app_handle().clone(), format!(
    "[model-check] checking model existence model={} baseUrl={}",
    model, config.base_url
  )).await;
  
  let client = Client::new();
  let url = format!("{}/api/tags", config.base_url.trim_end_matches('/'));
  let resp = client.get(url).send().await.map_err(|e| {
    let _err_msg = format!("Failed to connect to Ollama: {}", e);
    // Note: async logging in error handler - will be logged if reached
    e.to_string()
  })?;
  
  let v: serde_json::Value = resp.json().await.map_err(|e| {
    let err_msg = format!("Failed to parse Ollama response: {}", e);
    // Note: async logging in error handler - will be logged if reached
    err_msg
  })?;
  
  let available_models: Vec<String> = v.get("models")
    .and_then(|m| m.as_array())
    .map(|arr| {
      arr.iter()
        .filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))
        .collect()
    })
    .unwrap_or_default();
    
  let exists = available_models.iter().any(|m| m == &model);
  
  let _ = write_log_line(window.app_handle().clone(), format!(
    "[model-check] model={} exists={} available_models={:?}",
    model, exists, available_models
  )).await;
  
  Ok(exists)
}

#[tauri::command]
async fn start_pull_model(window: Window, base_url: String, name: String) -> Result<String, String> {
  let _ = write_log_line(window.app_handle().clone(), format!(
    "[model-pull] starting download model={} baseUrl={}",
    name, base_url
  )).await;
  
  let url = format!("{}/api/pull", base_url.trim_end_matches('/'));
  let body = serde_json::json!({ "name": name, "stream": true });
  let client = Client::new();
  
  let res = client.post(url).json(&body).send().await.map_err(|e| {
    let err_msg = format!("Failed to start model download: {}", e);
    // Note: async logging in error handler - will be logged if reached  
    err_msg
  })?;
  
  let id = format!("pull-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
  let sid = id.clone();
  let mut buf: Vec<u8> = Vec::new();
  let win = window.clone();
  let model_name = name.clone();
  
  let _ = write_log_line(window.app_handle().clone(), format!(
    "[model-pull] stream established model={} pullId={}",
    name, sid
  )).await;
  
  tauri::async_runtime::spawn(async move {
    let mut stream = res.bytes_stream();
    let mut last_percent = -1.0;
    
    while let Some(item) = stream.next().await {
      match item {
        Ok(bytes) => {
          buf.extend_from_slice(&bytes);
          while let Some(pos) = buf.iter().position(|b| *b == b'\n') {
            let line = buf.drain(..=pos).collect::<Vec<u8>>();
            let line = String::from_utf8_lossy(&line).trim().to_string();
            if line.is_empty() { continue; }
            // Try parse ndjson and emit structured progress
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
              let status = v.get("status").and_then(|s| s.as_str()).unwrap_or("");
              let total = v.get("total").and_then(|t| t.as_f64()).unwrap_or(0.0);
              let completed = v.get("completed").and_then(|t| t.as_f64()).unwrap_or(0.0);
              let percent = if total > 0.0 { (completed / total * 100.0).min(100.0) } else { 0.0 };
              
              // Log progress every 10% or on status changes
              if (percent - last_percent).abs() >= 10.0 || last_percent < 0.0 || !status.is_empty() {
                let _ = write_log_line(win.app_handle().clone(), format!(
                  "[model-pull] progress model={} status='{}' percent={:.1}% completed={:.0}MB total={:.0}MB pullId={}",
                  model_name, status, percent, completed / 1_000_000.0, total / 1_000_000.0, sid
                )).await;
                last_percent = percent;
              }
              
              let payload = serde_json::json!({
                "status": status,
                "total": total,
                "completed": completed,
                "percent": percent,
              });
              let _ = win.emit(&format!("model-pull-progress:{}", sid), payload);
            } else {
              // Log raw status messages
              let _ = write_log_line(win.app_handle().clone(), format!(
                "[model-pull] status model={} message='{}' pullId={}",
                model_name, line, sid
              )).await;
              let _ = win.emit(&format!("model-pull-progress:{}", sid), line.clone());
            }
          }
        }
        Err(err) => {
          let _ = write_log_line(win.app_handle().clone(), format!(
            "[model-pull] stream error model={} error={} pullId={}",
            model_name, err.to_string(), sid
          )).await;
          let _ = win.emit(&format!("model-pull-error:{}", sid), err.to_string());
          return;
        }
      }
    }
    
    let _ = write_log_line(win.app_handle().clone(), format!(
      "[model-pull] download completed successfully model={} pullId={}",
      model_name, sid
    )).await;
    let _ = win.emit(&format!("model-pull-end:{}", sid), "");
  });
  Ok(id)
}

#[tokio::main]
async fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![
      proxy_models,
      proxy_chat_stream,
      proxy_chat,
      ensure_ollama,
      get_log_path,
      write_log_line,
      get_config_path,
      get_conversations_path,
      start_chat_stream,
      check_model_exists,
      start_pull_model
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}


