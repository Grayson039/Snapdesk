; Snapdesk per-user installer. Build: NSISDIR=<nsis> makensis tools/installer.nsi   (see tools/build-installer.sh)
Unicode true
!define APP "Snapdesk"
!define VERSION "2.1.1"
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Snapdesk"

SetCompressor /SOLID lzma
Name "${APP}"
OutFile "../dist/Snapdesk-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\Snapdesk"
InstallDirRegKey HKCU "Software\Snapdesk" "InstallDir"
RequestExecutionLevel user
BrandingText "Snapdesk ${VERSION}"

!include MUI2.nsh
!define MUI_ICON "../assets/icon.ico"
!define MUI_UNICON "../assets/icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Welcome to Snapdesk"
!define MUI_WELCOMEPAGE_TEXT "Snapdesk captures and annotates screenshots, completely offline.$\r$\n$\r$\nPress Ctrl+Shift+X anywhere to capture a region.$\r$\n$\r$\nNo administrator rights are needed. This installs only for your Windows account."
!define MUI_FINISHPAGE_RUN "$INSTDIR\Snapdesk.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Start Snapdesk now"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "Snapdesk"
VIAddVersionKey "FileDescription" "Snapdesk installer"
VIAddVersionKey "CompanyName" "Will Grayson"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Will Grayson"

Section "Install"
  nsExec::Exec 'taskkill /F /IM Snapdesk.exe'
  Pop $0
  SetOutPath "$INSTDIR"
  File /r "../dist/win-unpacked/*.*"
  File "../assets/icon.ico"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Snapdesk"
  CreateShortcut "$SMPROGRAMS\Snapdesk\Snapdesk.lnk" "$INSTDIR\Snapdesk.exe" "" "$INSTDIR\icon.ico"
  CreateShortcut "$SMPROGRAMS\Snapdesk\Uninstall Snapdesk.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\Snapdesk.lnk" "$INSTDIR\Snapdesk.exe" "" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "Software\Snapdesk" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "Snapdesk"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "Will Grayson"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM Snapdesk.exe'
  Pop $0
  Delete "$SMPROGRAMS\Snapdesk\Snapdesk.lnk"
  Delete "$SMPROGRAMS\Snapdesk\Uninstall Snapdesk.lnk"
  RMDir "$SMPROGRAMS\Snapdesk"
  Delete "$DESKTOP\Snapdesk.lnk"
  ; only wipe the folder if it really is a Snapdesk install, never a folder someone pointed us at by mistake
  IfFileExists "$INSTDIR\Snapdesk.exe" 0 skip
  IfFileExists "$INSTDIR\resources\app.asar" 0 skip
    RMDir /r "$INSTDIR"
  skip:
  DeleteRegKey HKCU "${UNKEY}"
  DeleteRegKey HKCU "Software\Snapdesk"
SectionEnd
