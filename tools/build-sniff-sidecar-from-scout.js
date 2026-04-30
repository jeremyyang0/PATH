const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function fail(message) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
}

function resolveScoutRoot() {
    const rawScoutRoot = String(process.env.SCOUT_ROOT || '').trim();
    if (!rawScoutRoot) {
        fail('Missing SCOUT_ROOT. Set SCOUT_ROOT to the scout repository root before running build:sniff-sidecar.');
    }

    const scoutRoot = path.resolve(rawScoutRoot);
    const buildScript = path.join(scoutRoot, 'tools', 'build_sniff_sidecar.py');
    if (!fs.existsSync(buildScript)) {
        fail(`SCOUT_ROOT does not contain tools/build_sniff_sidecar.py: ${buildScript}`);
    }

    return { scoutRoot, buildScript };
}

function resolvePythonExecutable(scoutRoot) {
    const explicitPython = String(process.env.PYTHON || '').trim();
    if (explicitPython) {
        return explicitPython;
    }

    const venvPython = process.platform === 'win32'
        ? path.join(scoutRoot, '.venv', 'Scripts', 'python.exe')
        : path.join(scoutRoot, '.venv', 'bin', 'python');
    if (fs.existsSync(venvPython)) {
        return venvPython;
    }

    return 'python';
}

function main() {
    const extensionRoot = path.resolve(__dirname, '..');
    const outputRoot = path.join(extensionRoot, 'resources', 'sniff-sidecar');
    const { scoutRoot, buildScript } = resolveScoutRoot();
    const pythonExecutable = resolvePythonExecutable(scoutRoot);

    const result = spawnSync(
        pythonExecutable,
        [buildScript, '--output-root', outputRoot],
        {
            cwd: scoutRoot,
            stdio: 'inherit',
            env: process.env,
        }
    );

    if (result.error) {
        fail(result.error.message || 'Failed to launch scout sidecar build script.');
    }
    if (typeof result.status === 'number' && result.status !== 0) {
        process.exit(result.status);
    }
}

main();
