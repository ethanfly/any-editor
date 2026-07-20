/** Path identity helpers — Windows-aware, POSIX-safe. */

function isWindowsPath(filePath: string): boolean {
  if (!filePath) return false;
  // Drive letter, UNC, extended-length, or already using backslashes.
  return (
    /^[a-zA-Z]:[\\/]/.test(filePath) ||
    filePath.startsWith('\\\\') ||
    filePath.startsWith('//') ||
    filePath.startsWith('\\\\?\\') ||
    filePath.startsWith('//?/') ||
    filePath.includes('\\')
  );
}

export function normalizePath(filePath: string): string {
  if (!filePath) return filePath;
  if (filePath.startsWith('untitled:')) return filePath;

  let s = filePath.trim();
  if (!s) return s;

  // Win32 extended-length prefix from canonicalize
  if (s.startsWith('\\\\?\\')) s = s.slice(4);
  if (s.startsWith('//?/')) s = s.slice(4);

  const win = isWindowsPath(s);

  if (win) {
    const isUnc = s.startsWith('\\\\') || s.startsWith('//');
    s = s.replace(/\//g, '\\');
    if (isUnc) {
      s = `\\\\${s.replace(/^\\+/, '')}`;
    } else {
      s = s.replace(/\\{2,}/g, '\\');
    }
    if (/^[a-zA-Z]:/.test(s)) {
      s = `${s[0].toUpperCase()}${s.slice(1)}`;
    }
    // Drop trailing separator except drive root "C:\"
    if (s.length > 3 && s.endsWith('\\')) {
      s = s.replace(/\\+$/, '');
    }
    return s;
  }

  // POSIX: keep forward slashes, collapse // (but not leading // for rare cases — treat as single)
  s = s.replace(/\/{2,}/g, '/');
  if (s.length > 1 && s.endsWith('/')) {
    s = s.replace(/\/+$/, '');
  }
  return s;
}

export function pathsEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.startsWith('untitled:') || b.startsWith('untitled:')) return a === b;
  const na = normalizePath(a);
  const nb = normalizePath(b);
  if (na === nb) return true;
  // Case-insensitive only for Windows paths
  if (isWindowsPath(na) || isWindowsPath(nb)) {
    return na.toLowerCase() === nb.toLowerCase();
  }
  return false;
}

/** True if `child` is `parent` or a descendant path. */
export function isPathUnder(child: string, parent: string): boolean {
  if (!child || !parent) return false;
  const win = isWindowsPath(child) || isWindowsPath(parent);
  const c = win ? normalizePath(child).toLowerCase() : normalizePath(child);
  const p = win ? normalizePath(parent).toLowerCase() : normalizePath(parent);
  if (c === p) return true;
  const sep = win || c.includes('\\') || p.includes('\\') ? '\\' : '/';
  const prefix = p.endsWith(sep) ? p : `${p}${sep}`;
  return c.startsWith(prefix);
}

/** Remap `path` when `from` was renamed/moved to `to` (file or directory). */
export function remapPath(path: string, from: string, to: string): string | null {
  if (!path || path.startsWith('untitled:')) return null;
  if (pathsEqual(path, from)) return normalizePath(to);
  if (!isPathUnder(path, from)) return null;
  const child = normalizePath(path);
  const parent = normalizePath(from);
  const target = normalizePath(to);
  // Preserve case of the unmatched suffix from the normalized child.
  // For Windows compare was case-insensitive; slice using original normalized lengths carefully.
  const win = isWindowsPath(child) || isWindowsPath(parent);
  if (win) {
    const cl = child.toLowerCase();
    const pl = parent.toLowerCase();
    if (!cl.startsWith(pl)) return null;
    const rest = child.slice(parent.length); // begins with separator
    return `${target}${rest}`;
  }
  const rest = child.slice(parent.length);
  return `${target}${rest}`;
}

export function isAppExecutableArg(arg: string): boolean {
  if (!arg) return true;
  const trimmed = arg.trim();
  if (!trimmed || trimmed.startsWith('-')) return true;
  const base = trimmed.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  return (
    base === 'anyedit.exe' ||
    base === 'any-editor.exe' ||
    base === 'any editor.exe' ||
    base === 'anyedit' ||
    base === 'any-editor' ||
    base.endsWith('anyedit.exe')
  );
}
