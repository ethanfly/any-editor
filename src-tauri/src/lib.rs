use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;

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
}

#[derive(Debug, Serialize)]
pub struct InitialOpenPath {
    pub path: String,
    pub is_dir: bool,
    pub parent_path: Option<String>,
}

#[tauri::command]
fn get_initial_open_path() -> Option<InitialOpenPath> {
    env::args_os().skip(1).find_map(|arg| {
        let path = PathBuf::from(arg);

        if path.exists() {
            let is_dir = path.is_dir();
            let parent_path = if is_dir {
                None
            } else {
                path.parent()
                    .map(|parent| parent.to_string_lossy().to_string())
            };

            Some(InitialOpenPath {
                path: path.to_string_lossy().to_string(),
                is_dir,
                parent_path,
            })
        } else {
            None
        }
    })
}

#[tauri::command]
fn read_file(path: String) -> Result<FileContent, String> {
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let path_buf = PathBuf::from(&path);
    let extension = path_buf
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    Ok(FileContent {
        path,
        content,
        extension,
    })
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[tauri::command]
fn read_dir_recursive(path: String) -> Result<Vec<FileEntry>, String> {
    let entries = read_dir_entries(&PathBuf::from(&path))?;
    Ok(entries)
}

fn read_dir_entries(dir_path: &PathBuf) -> Result<Vec<FileEntry>, String> {
    let mut entries: Vec<FileEntry> = Vec::new();

    let dir_entries = fs::read_dir(dir_path).map_err(|e| format!("Failed to read dir: {}", e))?;

    for entry in dir_entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let name = entry
            .file_name()
            .to_str()
            .unwrap_or("unknown")
            .to_string();

        // Skip hidden files/folders (starting with .)
        if name.starts_with('.') && name != ".env" {
            continue;
        }

        // Skip node_modules and target directories
        if name == "node_modules" || name == "target" || name == "dist" {
            continue;
        }

        let is_dir = path.is_dir();
        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let children = if is_dir {
            match read_dir_entries(&path) {
                Ok(children) => Some(children),
                Err(_) => None,
            }
        } else {
            None
        };

        entries.push(FileEntry {
            name,
            path: path.to_str().unwrap_or("").to_string(),
            is_dir,
            children,
            extension,
        });
    }

    // Sort: directories first, then files, alphabetically
    entries.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    PathBuf::from(&path).exists()
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
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
            read_dir_recursive,
            file_exists,
            read_file_bytes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
