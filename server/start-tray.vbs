' Launch the Kokoro TTS tray app (used by the Start Menu shortcut and auto-start
' on login). If the environment isn't built yet, run setup first — here, in the
' user's shell/Explorer context, where redirected-profile paths are traversable.
' (The installer's own process tree enforces a reparse-point mitigation that
' fails with "untrusted mount point" / os error 448, so setup can't run there.)
' Then start the server via the venv's windowed Python — no flashing terminal.

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = appDir

' Match setup.bat: keep uv's managed Python on a local, non-redirected path.
sh.Environment("Process").Item("UV_PYTHON_INSTALL_DIR") = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%\uv\python")

pyw = appDir & "\.venv\Scripts\pythonw.exe"

' First run (or the installer couldn't build the env in its restricted context):
' run setup visibly and wait, so the user sees the one-time download.
If Not fso.FileExists(pyw) Then
  sh.Run "cmd /c """ & appDir & "\setup.bat""", 1, True
End If

' Start the tray app hidden if the environment is now ready.
If fso.FileExists(pyw) Then
  sh.Run """" & pyw & """ tray.py", 0, False
End If
