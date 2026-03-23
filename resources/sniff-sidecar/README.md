PATH Sniff sidecar artifacts are packaged per platform under a single shared bundle directory:

- `resources/sniff-sidecar/win32-x64/path-sniff-bundle/path-sniff-cli.exe`
- `resources/sniff-sidecar/win32-x64/path-sniff-bundle/path-sniff.exe`
- `resources/sniff-sidecar/darwin-arm64/path-sniff-bundle/path-sniff-cli`
- `resources/sniff-sidecar/darwin-arm64/path-sniff-bundle/path-sniff`
- `resources/sniff-sidecar/linux-x64/path-sniff-bundle/path-sniff-cli`
- `resources/sniff-sidecar/linux-x64/path-sniff-bundle/path-sniff`

Build command:

```powershell
python .\tools\pathsniff-sidecar\build_sidecar.py --output-root .\resources\sniff-sidecar
```
