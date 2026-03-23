import argparse
import filecmp
import platform
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def normalize_arch(machine: str) -> str:
    value = machine.lower()
    if value in {"amd64", "x86_64", "x64"}:
        return "x64"
    if value in {"arm64", "aarch64"}:
        return "arm64"
    return value


def platform_tag() -> str:
    return f"{sys.platform}-{normalize_arch(platform.machine())}"


def run_nuitka(name: str, script_path: Path, output_root: Path, windows_disable_console: bool) -> Path:
    nuitka_launcher = (
        Path(sys.executable).resolve().parent / ("nuitka.cmd" if sys.platform == "win32" else "nuitka")
    )
    
    dist_dir = output_root / f"{script_path.stem}.dist"
    target_dist_dir = output_root / f"{name}.dist"
    command = [
        str(nuitka_launcher),
        "--standalone",
        "--assume-yes-for-downloads",
        "--remove-output",
        "--nofollow-import-to=tkinter",
        "--enable-plugin=pyside2",
        "--include-package=pathsniff",
        f"--output-dir={output_root}",
        f"--output-filename={name}",
    ]
    if sys.platform == "win32":
        command.append(f"--windows-console-mode={'disable' if windows_disable_console else 'force'}")
    if sys.platform == "darwin" and windows_disable_console:
        command.append("--macos-create-app-bundle")
    command.append(str(script_path))
    subprocess.run(command, check=True, cwd=str(ROOT))
    if dist_dir.exists():
        if target_dist_dir.exists():
            shutil.rmtree(target_dist_dir)
        dist_dir.rename(target_dist_dir)
    return target_dist_dir


def merge_dist_into_bundle(source_dir: Path, bundle_dir: Path) -> None:
    for source_path in source_dir.rglob("*"):
        relative_path = source_path.relative_to(source_dir)
        target_path = bundle_dir / relative_path
        if source_path.is_dir():
            target_path.mkdir(parents=True, exist_ok=True)
            continue
 

        target_path.parent.mkdir(parents=True, exist_ok=True)
        if not target_path.exists():
            shutil.copy2(source_path, target_path)
            continue

        if filecmp.cmp(str(source_path), str(target_path), shallow=False):
            continue

        raise RuntimeError(
            f"Bundle merge conflict for {relative_path}: {source_path} differs from {target_path}"
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-root",
        required=True,
        help="Directory that will receive <platform-arch>/ sidecar artifacts.",
    )
    args = parser.parse_args()

    output_root = Path(args.output_root).resolve() / platform_tag()
    if output_root.exists():
        shutil.rmtree(output_root)
    output_root.mkdir(parents=True, exist_ok=True)

    build_root = output_root / "_build"
    build_root.mkdir(parents=True, exist_ok=True)

    gui_dist_dir = run_nuitka("path-sniff", ROOT / "gui_main.py", build_root, windows_disable_console=True)
    cli_dist_dir = run_nuitka("path-sniff-cli", ROOT / "cli_main.py", build_root, windows_disable_console=False)

    bundle_dir = output_root / "path-sniff-bundle"
    bundle_dir.mkdir(parents=True, exist_ok=True)
    merge_dist_into_bundle(gui_dist_dir, bundle_dir)
    merge_dist_into_bundle(cli_dist_dir, bundle_dir)
    shutil.rmtree(build_root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
