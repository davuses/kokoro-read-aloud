; Inno Setup script for the Kokoro TTS server (Windows).
;
; Compiled in CI (.github/workflows/release-installer.yml) on a Windows runner;
; pass the version with /DAppVersion=x.y.z. Produces a small per-user installer
; that copies the server sources, bootstraps uv + dependencies on install, runs
; the server from a system-tray app (no console window), and can auto-start on
; login. Heavy ML dependencies (torch, kokoro) and the model weights are NOT
; bundled — uv installs/downloads them at setup time, keeping the installer tiny.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{4B1D9E7A-3C2F-4A8B-9E6D-1A2B3C4D5E6F}
AppName=Kokoro TTS Server
AppVersion={#AppVersion}
AppPublisher=davuses
DefaultDirName={localappdata}\KokoroTTSServer
DefaultGroupName=Kokoro TTS Server
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputBaseFilename=kokoro-tts-server-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "autostart"; Description: "Start the Kokoro TTS server automatically when I sign in"; GroupDescription: "Startup:"
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Files]
Source: "..\server.py";        DestDir: "{app}"; Flags: ignoreversion
Source: "..\kokoro_model.py";  DestDir: "{app}"; Flags: ignoreversion
Source: "..\tray.py";          DestDir: "{app}"; Flags: ignoreversion
Source: "..\pyproject.toml";   DestDir: "{app}"; Flags: ignoreversion
Source: "..\uv.lock";          DestDir: "{app}"; Flags: ignoreversion
Source: "..\.python-version";  DestDir: "{app}"; Flags: ignoreversion
Source: "..\setup.bat";        DestDir: "{app}"; Flags: ignoreversion
Source: "..\start-tray.vbs";   DestDir: "{app}"; Flags: ignoreversion
Source: "..\start-server.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md";        DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Kokoro TTS Server"; Filename: "wscript.exe"; Parameters: """{app}\start-tray.vbs"""; WorkingDir: "{app}"; Comment: "Start the Kokoro TTS server in the background (tray icon)"
Name: "{group}\Uninstall Kokoro TTS Server"; Filename: "{uninstallexe}"
Name: "{userdesktop}\Kokoro TTS Server"; Filename: "wscript.exe"; Parameters: """{app}\start-tray.vbs"""; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{userstartup}\Kokoro TTS Server"; Filename: "wscript.exe"; Parameters: """{app}\start-tray.vbs"""; WorkingDir: "{app}"; Tasks: autostart

[Run]
; Run setup de-elevated, as the logged-on user. If the installer is elevated and
; the user's AppData is a reparse point (redirected/synced profile), an elevated
; process can't traverse it ("untrusted mount point", os error 448) — but the
; original medium-integrity user can. runasoriginaluser is a no-op when Setup is
; already non-elevated.
Filename: "{app}\setup.bat"; StatusMsg: "Installing the Python toolchain and dependencies (this can take a few minutes)..."; Flags: runasoriginaluser
; Only offer to launch the tray if setup actually built the environment, so a
; failed setup doesn't start a broken app that locks the half-built .venv.
Filename: "wscript.exe"; Parameters: """{app}\start-tray.vbs"""; WorkingDir: "{app}"; Description: "Start the Kokoro TTS server now"; Flags: postinstall nowait runhidden skipifsilent runasoriginaluser; Check: VenvReady

[UninstallDelete]
Type: filesandordirs; Name: "{app}\.venv"
Type: filesandordirs; Name: "{app}\__pycache__"
Type: filesandordirs; Name: "{app}\.pytest_cache"

[Code]
function VenvReady: Boolean;
begin
  Result := FileExists(ExpandConstant('{app}\.venv\Scripts\python.exe'));
end;
