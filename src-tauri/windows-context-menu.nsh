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

  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  !undef ANYEDIT_EXE
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\*\shell\AnyEdit"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\AnyEdit"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\AnyEdit"
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
