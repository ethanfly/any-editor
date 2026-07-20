!macro NSIS_HOOK_PREINSTALL
  ; WebView2Loader is statically linked by MSVC (default in Tauri 2).
  ; No separate DLL copy is needed.
!macroend

; Repair only extensions that older Any Editor builds hijacked.
; Never overwrite a user-chosen default association.
; $R9 = extension key under Software\Classes (e.g. ".bat")
!macro ANYEDIT_RESTORE_ONE_SCRIPT_ASSOC EXTKEY
  ; Always drop our OpenWithProgids residue (does not change default handler).
  DeleteRegValue HKCU "Software\Classes\${EXTKEY}\OpenWithProgids" "Any Editor Document"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\${EXTKEY}\OpenWithProgids" "Any Editor Document"

  ReadRegStr $0 HKCU "Software\Classes\${EXTKEY}" ""
  StrCmp $0 "Any Editor Document" 0 anyedit_assoc_done_${EXTKEY}

  ; Prefer pre-hijack backup if it points somewhere else.
  ReadRegStr $1 HKCU "Software\Classes\${EXTKEY}" "Any Editor Document_backup"
  StrCmp $1 "" anyedit_assoc_clear_${EXTKEY}
  StrCmp $1 "Any Editor Document" anyedit_assoc_clear_${EXTKEY}
  WriteRegStr HKCU "Software\Classes\${EXTKEY}" "" $1
  Goto anyedit_assoc_cleanup_${EXTKEY}

anyedit_assoc_clear_${EXTKEY}:
  ; No usable backup: remove HKCU default so HKLM system default applies.
  DeleteRegValue HKCU "Software\Classes\${EXTKEY}" ""

anyedit_assoc_cleanup_${EXTKEY}:
  DeleteRegValue HKCU "Software\Classes\${EXTKEY}" "Any Editor Document_backup"

anyedit_assoc_done_${EXTKEY}:
!macroend

!macro ANYEDIT_RESTORE_SCRIPT_ASSOCS
  !insertmacro ANYEDIT_RESTORE_ONE_SCRIPT_ASSOC ".bat"
  !insertmacro ANYEDIT_RESTORE_ONE_SCRIPT_ASSOC ".cmd"
  !insertmacro ANYEDIT_RESTORE_ONE_SCRIPT_ASSOC ".ps1"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !define ANYEDIT_EXE "$INSTDIR\AnyEdit.exe"

  WriteRegStr HKCU "Software\Classes\*\shell\AnyEdit" "" "AnyEdit 打开"
  WriteRegStr HKCU "Software\Classes\*\shell\AnyEdit" "Icon" "${ANYEDIT_EXE},0"
  WriteRegStr HKCU "Software\Classes\*\shell\AnyEdit\command" "" "$\"${ANYEDIT_EXE}$\" $\"%1$\""

  WriteRegStr HKCU "Software\Classes\Directory\shell\AnyEdit" "" "AnyEdit 打开"
  WriteRegStr HKCU "Software\Classes\Directory\shell\AnyEdit" "Icon" "${ANYEDIT_EXE},0"
  WriteRegStr HKCU "Software\Classes\Directory\shell\AnyEdit\command" "" "$\"${ANYEDIT_EXE}$\" $\"%1$\""

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\AnyEdit" "" "AnyEdit 打开"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\AnyEdit" "Icon" "${ANYEDIT_EXE},0"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\AnyEdit\command" "" "$\"${ANYEDIT_EXE}$\" $\"%V$\""

  ; Repair only if older installs hijacked script extensions.
  !insertmacro ANYEDIT_RESTORE_SCRIPT_ASSOCS

  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  !undef ANYEDIT_EXE
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\*\shell\AnyEdit"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\AnyEdit"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\AnyEdit"
  !insertmacro ANYEDIT_RESTORE_SCRIPT_ASSOCS
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
