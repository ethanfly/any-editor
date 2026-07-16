import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FileEntry, FileContent } from '../types';

export function useFileSystem() {
  const readFile = useCallback(async (path: string): Promise<FileContent> => {
    return invoke<FileContent>('read_file', { path });
  }, []);

  const writeFile = useCallback(async (path: string, content: string): Promise<void> => {
    return invoke('write_file', { path, content });
  }, []);

  const readDir = useCallback(async (path: string): Promise<FileEntry[]> => {
    return invoke<FileEntry[]>('read_dir', { path });
  }, []);

  const readDirRecursive = useCallback(async (path: string): Promise<FileEntry[]> => {
    return invoke<FileEntry[]>('read_dir_recursive', { path });
  }, []);

  const fileExists = useCallback(async (path: string): Promise<boolean> => {
    return invoke<boolean>('file_exists', { path });
  }, []);

  const isDirectory = useCallback(async (path: string): Promise<boolean> => {
    return invoke<boolean>('is_directory', { path });
  }, []);

  const readFileBytes = useCallback(async (path: string): Promise<number[]> => {
    return invoke<number[]>('read_file_bytes', { path });
  }, []);

  return {
    readFile,
    writeFile,
    readDir,
    readDirRecursive,
    fileExists,
    isDirectory,
    readFileBytes,
  };
}
