; Inno Setup script for the Windows installer. See BUILDING.md.
;
; Installs for the person running it and asks for no administrator: into
; %LOCALAPPDATA%\Programs\SlideX, with Start-menu and desktop shortcuts, then
; starts the program. Decks live in %USERPROFILE%\SlideX, which
; uninstalling never touches.
;
;   iscc /DVersion=0.3.0 desktop\windows\slidex.iss
#ifndef Version
  #define Version "0.0.0"
#endif

[Setup]
AppId={{6E7A2B1C-3D4F-4E5A-9B8C-1D2E3F4A5B6C}
AppName=SlideX
AppVersion={#Version}
AppPublisher=Arseniy A. Ilinich
AppPublisherURL=https://github.com/Ailinic1/Slidex
DefaultDirName={localappdata}\Programs\SlideX
DefaultGroupName=SlideX
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\..\dist
OutputBaseFilename=SlideX-Setup-{#Version}
SetupIconFile=..\icons\icon.ico
UninstallDisplayIcon={app}\SlideX.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
LicenseFile=..\..\LICENSE

[Files]
Source: "..\..\dist\pyinstaller\SlideX\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{userprograms}\SlideX"; Filename: "{app}\SlideX.exe"
Name: "{userdesktop}\SlideX"; Filename: "{app}\SlideX.exe"

[Run]
Filename: "{app}\SlideX.exe"; Description: "Open SlideX"; Flags: nowait postinstall skipifsilent
