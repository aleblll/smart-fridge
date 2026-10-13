import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const rootDir = process.cwd();
const stagingDir = path.join(rootDir, 'audit_staging');
const zipOutput = path.join(rootDir, 'SmartFridge_TMA_Full_Audit_Package_v1.1.zip');
const artifactZip = 'C:/Users/A.le_BL/.gemini/antigravity/brain/8c36fc65-ae61-47c6-bca6-92e6291affdf/SmartFridge_TMA_Full_Audit_Package_v1.1.zip';

console.log('📦 Starting audit package creation...');

if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
if (fs.existsSync(zipOutput)) {
  fs.rmSync(zipOutput, { force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

function copyFiltered(src, dest, ignores = []) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    const base = path.basename(src);
    if (ignores.includes(base)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
      copyFiltered(path.join(src, file), path.join(dest, file), ignores);
    }
  } else {
    const base = path.basename(src);
    if (ignores.includes(base) || base.endsWith('.tsbuildinfo')) return;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// 1. Root files
const rootFiles = [
  'AUDIT_PROMPT_FOR_GEMINI.md',
  'BIG-PICTURE.md',
  'package.json',
  'package-lock.json',
  'vitest.config.ts',
  '.gitignore'
];
for (const file of rootFiles) {
  const src = path.join(rootDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(stagingDir, file));
  }
}

// 2. Directories
copyFiltered(path.join(rootDir, '.github'), path.join(stagingDir, '.github'), []);
copyFiltered(path.join(rootDir, 'scripts'), path.join(stagingDir, 'scripts'), ['create-audit-package.mjs']);
copyFiltered(path.join(rootDir, 'src'), path.join(stagingDir, 'src'), ['node_modules']);
copyFiltered(path.join(rootDir, 'worker'), path.join(stagingDir, 'worker'), ['node_modules', '.wrangler']);
copyFiltered(path.join(rootDir, 'frontend'), path.join(stagingDir, 'frontend'), ['node_modules', 'dist']);
copyFiltered(path.join(rootDir, 'Fridge_TMA_SSOT'), path.join(stagingDir, 'Fridge_TMA_SSOT'), ['.obsidian']);

console.log('📁 Staging directory populated.');

// 3. Compress using PowerShell Compress-Archive
console.log('🗜️ Compressing to ZIP...');
const psCommand = `powershell -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipOutput}' -CompressionLevel Optimal"`;
execSync(psCommand, { stdio: 'inherit' });

// Copy to brain artifact directory
try {
  fs.copyFileSync(zipOutput, artifactZip);
  console.log(`📋 Copied to artifact directory: ${artifactZip}`);
} catch (e) {
  console.warn('Artifact copy notice:', e.message);
}

// 4. Cleanup staging
fs.rmSync(stagingDir, { recursive: true, force: true });

const stats = fs.statSync(zipOutput);
console.log(`✅ Success! Package created at: ${zipOutput} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
