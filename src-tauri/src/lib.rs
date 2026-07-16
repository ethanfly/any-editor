use encoding_rs::{Encoding, GBK, UTF_8};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const MAX_DIR_DEPTH: usize = 12;
const MAX_DIR_ENTRIES: usize = 20_000;
const DEFAULT_HISTORY_LIMIT: usize = 30;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
    pub extension: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub extension: String,
    pub encoding: String,
}

#[derive(Debug, Serialize)]
pub struct InitialOpenPath {
    pub path: String,
    pub is_dir: bool,
    pub parent_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HistoryEntry {
    pub id: String,
    pub path: String,
    pub saved_at: u64,
    pub preview: String,
    pub size: usize,
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn extension_of(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
}

fn looks_binary(bytes: &[u8]) -> bool {
    if bytes.is_empty() {
        return false;
    }
    let sample = &bytes[..bytes.len().min(8_192)];
    let mut suspicious = 0usize;
    for &b in sample {
        if b == 0 {
            return true;
        }
        if b < 0x09 || (b > 0x0D && b < 0x20) {
            suspicious += 1;
        }
    }
    (suspicious as f32 / sample.len() as f32) > 0.30
}

fn decode_with_label(bytes: &[u8], label: &str) -> Result<(String, String), String> {
    let enc = match label.to_ascii_lowercase().as_str() {
        "utf-8" | "utf8" => UTF_8,
        "gbk" | "gb2312" | "cp936" => GBK,
        other => Encoding::for_label(other.as_bytes()).unwrap_or(UTF_8),
    };
    let (cow, _enc_used, had_errors) = enc.decode(bytes);
    let name = if enc == GBK {
        if had_errors { "GBK (lossy)".to_string() } else { "GBK".to_string() }
    } else if had_errors {
        "UTF-8 (lossy)".to_string()
    } else {
        "UTF-8".to_string()
    };
    Ok((cow.into_owned(), name))
}

fn detect_and_decode(bytes: Vec<u8>) -> Result<(String, String), String> {
    if looks_binary(&bytes) {
        return Err("BINARY_FILE".to_string());
    }
    // BOM UTF-8
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return decode_with_label(&bytes[3..], "utf-8");
    }
    if let Ok(content) = String::from_utf8(bytes.clone()) {
        return Ok((content, "UTF-8".to_string()));
    }
    // Fallback GBK for common Chinese Windows text
    decode_with_label(&bytes, "gbk")
}

fn encode_text(content: &str, label: &str) -> Result<Vec<u8>, String> {
    let enc = match label.to_ascii_lowercase().as_str() {
        "utf-8" | "utf8" | "utf-8 (lossy)" => UTF_8,
        "gbk" | "gb2312" | "cp936" | "gbk (lossy)" => GBK,
        other => Encoding::for_label(other.as_bytes()).unwrap_or(UTF_8),
    };
    let (cow, _enc, _err) = enc.encode(content);
    Ok(cow.into_owned())
}

fn decode_text(bytes: Vec<u8>) -> Result<(String, String), String> {
    detect_and_decode(bytes)
}

fn should_skip_name(name: &str) -> bool {
    if name.starts_with('.') && name != ".env" && name != ".gitignore" && name != ".editorconfig" {
        return true;
    }
    matches!(
        name,
        "node_modules" | "target" | "dist" | ".git" | ".svn" | ".hg" | "__pycache__" | ".next" | ".cache"
    )
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn hash_path(path: &str) -> String {
    // Stable short folder id for a file path (not cryptographic)
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in path.as_bytes() {
        hash ^= u64::from(*b);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", hash)
}

fn history_root(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let root = base.join("history");
    fs::create_dir_all(&root).map_err(|e| format!("Failed to create history dir: {}", e))?;
    Ok(root)
}

fn history_dir_for(app: &AppHandle, file_path: &str) -> Result<PathBuf, String> {
    let dir = history_root(app)?.join(hash_path(file_path));
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create file history dir: {}", e))?;
    Ok(dir)
}

fn write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;
        }
    }
    let mut file = fs::File::create(path).map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[tauri::command]
fn get_initial_open_path() -> Option<InitialOpenPath> {
    env::args_os().skip(1).find_map(|arg| {
        let raw = arg.to_string_lossy();
        if raw.starts_with('-') {
            return None;
        }

        let path = PathBuf::from(&*raw);
        let path = fs::canonicalize(&path).unwrap_or(path);
        if !path.exists() {
            return None;
        }

        let is_dir = path.is_dir();
        let parent_path = if is_dir {
            None
        } else {
            path.parent().map(path_to_string)
        };

        Some(InitialOpenPath {
            path: path_to_string(&path),
            is_dir,
            parent_path,
        })
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileMeta {
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub modified_ms: u64,
}

#[tauri::command]
fn file_meta(path: String) -> Result<FileMeta, String> {
    let p = PathBuf::from(&path);
    let meta = fs::metadata(&p).map_err(|e| format!("Failed to stat file: {}", e))?;
    let modified_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Ok(FileMeta {
        path,
        size: meta.len(),
        is_dir: meta.is_dir(),
        modified_ms,
    })
}

#[tauri::command]
fn read_file(path: String, encoding: Option<String>) -> Result<FileContent, String> {
    let path_buf = PathBuf::from(&path);
    let bytes = fs::read(&path_buf).map_err(|e| format!("Failed to read file: {}", e))?;
    let extension = extension_of(&path_buf);
    let (content, encoding) = if let Some(label) = encoding {
        if looks_binary(&bytes) {
            return Err("BINARY_FILE".to_string());
        }
        decode_with_label(&bytes, &label)?
    } else {
        decode_text(bytes)?
    };

    Ok(FileContent {
        path,
        content,
        extension,
        encoding,
    })
}

#[tauri::command]
fn write_file(path: String, content: String, encoding: Option<String>) -> Result<(), String> {
    let label = encoding.unwrap_or_else(|| "UTF-8".to_string());
    let bytes = encode_text(&content, &label)?;
    write_bytes(Path::new(&path), &bytes)
}

#[tauri::command]
fn write_file_bytes(path: String, contents: Vec<u8>) -> Result<(), String> {
    write_bytes(Path::new(&path), &contents)
}

/// Save a local history snapshot for a real on-disk file.
#[tauri::command]
fn save_history_snapshot(
    app: AppHandle,
    path: String,
    content: String,
    limit: Option<usize>,
) -> Result<HistoryEntry, String> {
    if path.starts_with("untitled:") {
        return Err("Untitled buffers have no history until saved".to_string());
    }

    let dir = history_dir_for(&app, &path)?;
    let saved_at = now_ms();
    let id = format!("{}", saved_at);
    let file_path = dir.join(format!("{}.mdhist", id));
    write_bytes(&file_path, content.as_bytes())?;

    let preview: String = content.chars().take(120).collect::<String>().replace('\n', " ");
    let entry = HistoryEntry {
        id: id.clone(),
        path: path.clone(),
        saved_at,
        preview,
        size: content.len(),
    };

    // prune old snapshots
    let keep = limit.unwrap_or(DEFAULT_HISTORY_LIMIT).max(1);
    let mut entries = list_history_entries(&app, path)?;
    if entries.len() > keep {
        entries.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));
        for old in entries.into_iter().skip(keep) {
            let p = dir.join(format!("{}.mdhist", old.id));
            let _ = fs::remove_file(p);
        }
    }

    Ok(entry)
}

#[tauri::command]
fn list_history(app: AppHandle, path: String) -> Result<Vec<HistoryEntry>, String> {
    list_history_entries(&app, path)
}

fn list_history_entries(app: &AppHandle, path: String) -> Result<Vec<HistoryEntry>, String> {
    if path.starts_with("untitled:") {
        return Ok(Vec::new());
    }
    let dir = history_dir_for(app, &path)?;
    let mut out = Vec::new();
    let rd = fs::read_dir(&dir).map_err(|e| format!("Failed to read history: {}", e))?;
    for entry in rd.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some("mdhist") {
            continue;
        }
        let id = p
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let saved_at = id.parse::<u64>().unwrap_or(0);
        let bytes = fs::read(&p).unwrap_or_default();
        let content = String::from_utf8_lossy(&bytes);
        let preview: String = content.chars().take(120).collect::<String>().replace('\n', " ");
        out.push(HistoryEntry {
            id,
            path: path.clone(),
            saved_at,
            preview,
            size: bytes.len(),
        });
    }
    out.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));
    Ok(out)
}

#[tauri::command]
fn read_history_snapshot(app: AppHandle, path: String, id: String) -> Result<String, String> {
    let dir = history_dir_for(&app, &path)?;
    let file_path = dir.join(format!("{}.mdhist", id));
    fs::read_to_string(file_path).map_err(|e| format!("Failed to read snapshot: {}", e))
}

#[tauri::command]
fn read_dir(path: String) -> Result<Vec<FileEntry>, String> {
    read_dir_entries(&PathBuf::from(path), 0, false, &mut 0, &mut HashSet::new())
}

#[tauri::command]
fn read_dir_recursive(path: String) -> Result<Vec<FileEntry>, String> {
    read_dir_entries(&PathBuf::from(path), 0, true, &mut 0, &mut HashSet::new())
}

fn read_dir_entries(
    dir_path: &Path,
    depth: usize,
    recursive: bool,
    total: &mut usize,
    visited: &mut HashSet<PathBuf>,
) -> Result<Vec<FileEntry>, String> {
    if depth > MAX_DIR_DEPTH {
        return Ok(Vec::new());
    }

    let canonical = fs::canonicalize(dir_path).unwrap_or_else(|_| dir_path.to_path_buf());
    if !visited.insert(canonical.clone()) {
        return Ok(Vec::new());
    }

    let mut entries: Vec<FileEntry> = Vec::new();
    let dir_entries = fs::read_dir(dir_path).map_err(|e| format!("Failed to read dir: {}", e))?;

    for entry in dir_entries {
        if *total >= MAX_DIR_ENTRIES {
            break;
        }

        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();

        if should_skip_name(&name) {
            continue;
        }

        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let is_dir = meta.is_dir();
        let extension = extension_of(&path);

        let children = if is_dir && recursive {
            match read_dir_entries(&path, depth + 1, true, total, visited) {
                Ok(children) => Some(children),
                Err(_) => Some(Vec::new()),
            }
        } else if is_dir {
            Some(Vec::new())
        } else {
            None
        };

        *total += 1;
        entries.push(FileEntry {
            name,
            path: path_to_string(&path),
            is_dir,
            children,
            extension,
        });
    }

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    PathBuf::from(&path).exists()
}

#[tauri::command]
fn is_directory(path: String) -> bool {
    PathBuf::from(&path).is_dir()
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    let meta = fs::metadata(&path).map_err(|e| format!("Failed to stat file: {}", e))?;
    if meta.len() > 100 * 1024 * 1024 {
        return Err("File too large to open in preview (>100MB)".to_string());
    }
    fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))
}


#[tauri::command]
fn create_file(path: String, content: Option<String>) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.exists() {
        return Err("Path already exists".to_string());
    }
    write_bytes(&p, content.unwrap_or_default().as_bytes())
}

#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.exists() {
        return Err("Path already exists".to_string());
    }
    fs::create_dir_all(&p).map_err(|e| format!("Failed to create dir: {}", e))
}

#[tauri::command]
fn rename_path(from: String, to: String) -> Result<(), String> {
    let src = PathBuf::from(&from);
    let dst = PathBuf::from(&to);
    if !src.exists() {
        return Err("Source does not exist".to_string());
    }
    if dst.exists() {
        return Err("Destination already exists".to_string());
    }
    if let Some(parent) = dst.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent: {}", e))?;
        }
    }
    fs::rename(&src, &dst).map_err(|e| format!("Failed to rename: {}", e))
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("Path does not exist".to_string());
    }
    if p.is_dir() {
        fs::remove_dir_all(&p).map_err(|e| format!("Failed to delete dir: {}", e))
    } else {
        fs::remove_file(&p).map_err(|e| format!("Failed to delete file: {}", e))
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ListedFile {
    pub path: String,
    pub name: String,
    pub extension: String,
}

#[tauri::command]
fn list_files(root: String, max_files: Option<usize>) -> Result<Vec<ListedFile>, String> {
    let limit = max_files.unwrap_or(5000).min(20_000);
    let mut out = Vec::new();
    let mut visited = HashSet::new();
    collect_files(&PathBuf::from(root), 0, limit, &mut out, &mut visited)?;
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

fn collect_files(
    dir: &Path,
    depth: usize,
    limit: usize,
    out: &mut Vec<ListedFile>,
    visited: &mut HashSet<PathBuf>,
) -> Result<(), String> {
    if depth > MAX_DIR_DEPTH || out.len() >= limit {
        return Ok(());
    }
    let canonical = fs::canonicalize(dir).unwrap_or_else(|_| dir.to_path_buf());
    if !visited.insert(canonical) {
        return Ok(());
    }
    let rd = match fs::read_dir(dir) {
        Ok(v) => v,
        Err(_) => return Ok(()),
    };
    for entry in rd.flatten() {
        if out.len() >= limit {
            break;
        }
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if should_skip_name(&name) {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.is_dir() {
            collect_files(&path, depth + 1, limit, out, visited)?;
        } else {
            out.push(ListedFile {
                path: path_to_string(&path),
                name: name.clone(),
                extension: extension_of(&path),
            });
        }
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchMatch {
    pub path: String,
    pub line: usize,
    pub preview: String,
}

#[tauri::command]
fn search_in_files(
    root: String,
    query: String,
    max_results: Option<usize>,
    case_sensitive: Option<bool>,
) -> Result<Vec<SearchMatch>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let limit = max_results.unwrap_or(200).min(1000);
    let case_sensitive = case_sensitive.unwrap_or(false);
    let mut files = Vec::new();
    let mut visited = HashSet::new();
    collect_files(&PathBuf::from(&root), 0, 8000, &mut files, &mut visited)?;

    let needle = if case_sensitive {
        query.clone()
    } else {
        query.to_lowercase()
    };

    let mut out = Vec::new();
    for file in files {
        if out.len() >= limit {
            break;
        }
        // skip likely binary by extension
        let ext = file.extension.as_str();
        if matches!(
            ext,
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "ico" | "pdf" | "zip" | "gz" | "7z" | "exe" | "dll" | "so" | "dylib" | "bin" | "wasm" | "mp3" | "mp4" | "woff" | "woff2" | "ttf" | "otf"
        ) {
            continue;
        }
        let bytes = match fs::read(&file.path) {
            Ok(b) => b,
            Err(_) => continue,
        };
        if looks_binary(&bytes) {
            continue;
        }
        let content = String::from_utf8_lossy(&bytes);
        for (idx, line) in content.lines().enumerate() {
            if out.len() >= limit {
                break;
            }
            let hay = if case_sensitive {
                line.to_string()
            } else {
                line.to_lowercase()
            };
            if hay.contains(&needle) {
                let preview: String = line.chars().take(200).collect();
                out.push(SearchMatch {
                    path: file.path.clone(),
                    line: idx + 1,
                    preview,
                });
            }
        }
    }
    Ok(out)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Err(e) = app.emit("second-instance-open", argv) {
                eprintln!("Failed to emit second-instance-open event: {}", e);
            }
        }))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_initial_open_path,
            read_file,
            write_file,
            write_file_bytes,
            file_meta,
            save_history_snapshot,
            list_history,
            read_history_snapshot,
            read_dir,
            read_dir_recursive,
            file_exists,
            is_directory,
            read_file_bytes,
            create_file,
            create_dir,
            rename_path,
            delete_path,
            list_files,
            search_in_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
