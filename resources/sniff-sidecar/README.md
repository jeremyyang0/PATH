PATH Sniff sidecar artifacts are packaged per platform under a single shared bundle directory:

- `resources/sniff-sidecar/win32-x64/path-sniff-bundle/path-sniff-cli.exe`
- `resources/sniff-sidecar/win32-x64/path-sniff-bundle/path-sniff.exe`
- `resources/sniff-sidecar/darwin-arm64/path-sniff-bundle/path-sniff-cli`
- `resources/sniff-sidecar/darwin-arm64/path-sniff-bundle/path-sniff`
- `resources/sniff-sidecar/linux-x64/path-sniff-bundle/path-sniff-cli`
- `resources/sniff-sidecar/linux-x64/path-sniff-bundle/path-sniff`

Build command:

```powershell
$env:SCOUT_ROOT="F:\path\to\scout"
npm run build:sniff-sidecar
```
