' Launch the Kokoro TTS tray app with no console window (used by the Start Menu
' shortcut and by auto-start on login). Runs the venv's windowed Python directly
' so there's no flashing terminal; falls back to uv if the venv isn't built yet.

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = appDir

' Match setup.bat: keep uv's managed Python on a local, non-redirected path
' (Roaming may be OneDrive/network-redirected, which uv can't traverse).
sh.Environment("Process").Item("UV_PYTHON_INSTALL_DIR") = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%\uv\python")

pyw = appDir & "\.venv\Scripts\pythonw.exe"
If fso.FileExists(pyw) Then
  sh.Run """" & pyw & """ tray.py", 0, False
Else
  ' Environment not set up yet — let uv build it (and run setup) first.
  sh.Run "cmd /c uv run --group tray pythonw tray.py", 0, False
End If
