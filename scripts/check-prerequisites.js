#!/usr/bin/env node

/**
 * Pre-install check for OblivionEngine.
 * Verifies that native build tools are available before npm tries to compile node-pty.
 * Runs automatically via the "preinstall" script in package.json.
 */

const { execSync } = require('child_process');
const os = require('os');
const path = require('path');

const isWindows = os.platform() === 'win32';
const isMac = os.platform() === 'darwin';
const isLinux = os.platform() === 'linux';

let errors = [];
let warnings = [];

// ── Node version check ──
const nodeVersion = parseInt(process.version.slice(1), 10);
if (nodeVersion < 18) {
  errors.push(
    `Node.js v18+ is required (you have ${process.version}).\n` +
    `  Download the latest LTS from: https://nodejs.org`
  );
}

// ── Python check ──
function hasPython() {
  for (const cmd of ['python3', 'python']) {
    try {
      const version = execSync(`${cmd} --version 2>&1`, { encoding: 'utf8' }).trim();
      if (version.includes('Python 3')) return true;
    } catch {}
  }
  return false;
}

if (!hasPython()) {
  if (isWindows) {
    errors.push(
      `Python 3 is required but was not found.\n` +
      `  Install it from: https://www.python.org/downloads/\n` +
      `  IMPORTANT: Check "Add Python to PATH" during installation.`
    );
  } else {
    errors.push(
      `Python 3 is required but was not found.\n` +
      `  macOS:  It should be included with Xcode Command Line Tools.\n` +
      `  Linux:  sudo apt install python3`
    );
  }
}

// ── C++ compiler check ──
if (isWindows) {
  // Check for cl.exe (MSVC) or the VsDevCmd environment
  let hasCompiler = false;

  // Check if MSBuild or cl.exe is findable
  try {
    execSync('where cl.exe 2>nul', { encoding: 'utf8' });
    hasCompiler = true;
  } catch {}

  if (!hasCompiler) {
    // Check for Visual Studio installation via vswhere
    try {
      const vswhere = path.join(
        process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
        'Microsoft Visual Studio', 'Installer', 'vswhere.exe'
      );
      const result = execSync(`"${vswhere}" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>nul`, {
        encoding: 'utf8'
      }).trim();
      if (result) hasCompiler = true;
    } catch {}
  }

  if (!hasCompiler) {
    errors.push(
      `C++ build tools are required but were not found.\n` +
      `  This is needed to compile node-pty (the terminal backend).\n` +
      `\n` +
      `  To fix this:\n` +
      `  1. Download Visual Studio Build Tools:\n` +
      `     https://visualstudio.microsoft.com/visual-cpp-build-tools/\n` +
      `  2. Run the installer\n` +
      `  3. Check the box for "Desktop development with C++"\n` +
      `  4. Click Install and wait for it to finish\n` +
      `  5. RESTART your terminal after installing\n` +
      `\n` +
      `  If you already have Visual Studio 2019+, make sure the\n` +
      `  "Desktop development with C++" workload is installed.`
    );
  }
} else if (isMac) {
  try {
    execSync('xcode-select -p 2>/dev/null', { encoding: 'utf8' });
  } catch {
    errors.push(
      `Xcode Command Line Tools are required.\n` +
      `  Run: xcode-select --install`
    );
  }
} else if (isLinux) {
  try {
    execSync('which gcc 2>/dev/null', { encoding: 'utf8' });
  } catch {
    try {
      execSync('which cc 2>/dev/null', { encoding: 'utf8' });
    } catch {
      errors.push(
        `A C++ compiler is required.\n` +
        `  Run: sudo apt install build-essential`
      );
    }
  }
}

// ── Path space warning (Windows) ──
if (isWindows && process.cwd().includes(' ')) {
  warnings.push(
    `Your project path contains spaces: ${process.cwd()}\n` +
    `  This can sometimes cause build failures with native modules.\n` +
    `  If you have issues, try cloning to a path without spaces\n` +
    `  (e.g., C:\\OblivionEngine).`
  );
}

// ── Output ──
if (warnings.length > 0) {
  console.log('\n\x1b[33m⚠  OblivionEngine Setup Warnings:\x1b[0m\n');
  warnings.forEach((w, i) => {
    console.log(`  ${i + 1}. ${w}\n`);
  });
}

if (errors.length > 0) {
  console.error('\n\x1b[31m✖  OblivionEngine cannot install — missing prerequisites:\x1b[0m\n');
  errors.forEach((e, i) => {
    console.error(`  ${i + 1}. ${e}\n`);
  });
  console.error(
    '\x1b[31m  Fix the above issues and run "npm install" again.\x1b[0m\n' +
    '  For more help, see the README: https://github.com/swosu/House_Aaron#common-problems\n'
  );
  process.exit(1);
} else {
  console.log('\x1b[32m✔  Prerequisites check passed.\x1b[0m');
}
