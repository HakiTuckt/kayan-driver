import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const rootFiles = ['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'tailwind.config.ts', 'postcss.config.js', 'components.json', 'eslint.config.js', 'GPS_ANDROID_TESTING.md'];
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buffer => { let c = 0xffffffff; for (const b of buffer) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
async function entries(directory, prefix = '') {
  const result = [];
  for (const item of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix + item.name;
    if (item.isDirectory()) result.push(...await entries(path.join(directory, item.name), relative + '/'));
    else if (item.isFile()) result.push({ name: relative, data: await fs.readFile(path.join(directory, item.name)) });
  }
  return result;
}
function zip(files) {
  const locals = [], central = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const compressed = deflateRawSync(file.data);
    if (!inflateRawSync(compressed).equals(file.data)) throw new Error('Archive compression verification failed');
    const crc = crc32(file.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(file.data.length, 22); header.writeUInt16LE(name.length, 26);
    locals.push(header, name, compressed);
    const index = Buffer.alloc(46);
    index.writeUInt32LE(0x02014b50); index.writeUInt16LE(20, 4); index.writeUInt16LE(20, 6); index.writeUInt16LE(0x800, 8); index.writeUInt16LE(8, 10); index.writeUInt16LE(33, 14);
    index.writeUInt32LE(crc, 16); index.writeUInt32LE(compressed.length, 20); index.writeUInt32LE(file.data.length, 24); index.writeUInt16LE(name.length, 28); index.writeUInt32LE(offset, 42);
    central.push(index, name);
    offset += header.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
function appSource(driver) {
  return `import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import Home from './pages/${driver ? 'Driver' : 'Index'}';
${driver ? '' : "import Website from './pages/Website';"}
import NotFound from './pages/NotFound';
const client = new QueryClient();
export default function App() {
  return <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="${driver ? 'kayan-driver-theme' : 'kayan-theme'}"><QueryClientProvider client={client}><TooltipProvider><Toaster/><Sonner/><BrowserRouter><Routes><Route path="/" element={<Home/>}/>${driver ? '' : '<Route path="/website" element={<Website/>}/>'}<Route path="*" element={<NotFound/>}/></Routes></BrowserRouter></TooltipProvider></QueryClientProvider></ThemeProvider>;
}
`;
}
function workflow(label) {
  return `name: Build KAYAN ${label} APK
on:
  workflow_dispatch:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  build-apk:
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with:
          version: '10.11.0'
      - uses: actions/setup-node@v5
        with:
          node-version: '22'
          cache: pnpm
      - uses: actions/setup-java@v5
        with:
          distribution: temurin
          java-version: '21'
      - uses: android-actions/setup-android@v4
      - name: Install locked web and location dependencies
        run: pnpm install --frozen-lockfile
      - name: Type check and build web app
        run: |
          pnpm exec tsc --noEmit -p tsconfig.app.json
          pnpm exec tsc --noEmit -p tsconfig.node.json
          pnpm run build
      - name: Install Android packaging tools in separate directory
        run: npm install --prefix .apk-tools --no-package-lock @capacitor/cli@7 @capacitor/android@7
      - name: Make Android package visible to Capacitor
        run: ln -s "$GITHUB_WORKSPACE/.apk-tools/node_modules/@capacitor/android" node_modules/@capacitor/android
      - name: Generate and sync native app
        run: |
          node .apk-tools/node_modules/@capacitor/cli/bin/capacitor add android
          node .apk-tools/node_modules/@capacitor/cli/bin/capacitor sync android
          node src/android/prepare-android.mjs
      - name: Compile debug APK
        working-directory: android
        run: bash gradlew assembleDebug --no-daemon
      - uses: actions/upload-artifact@v4
        with:
          name: KAYAN-${label}-Demo-APK
          path: android/app/build/outputs/apk/debug/app-debug.apk
          if-no-files-found: error
          retention-days: 14
`;
}

export async function generateProjects(outputDirectory, verify = false) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'kayan-projects-'));
  const manifest = [];
  try {
    await fs.mkdir(outputDirectory, { recursive: true });
    for (const variant of ['passenger', 'driver']) {
      const driver = variant === 'driver';
      const label = driver ? 'Driver' : 'Passenger';
      const project = path.join(temporary, `kayan-${variant}`);
      await fs.mkdir(project, { recursive: true });
      for (const file of rootFiles) await fs.copyFile(file, path.join(project, file));
      await fs.cp('src', path.join(project, 'src'), { recursive: true, filter: source => !source.startsWith(path.join('src', 'project-export')) && source !== path.join('src', 'pages', 'Projects.tsx') });
      await fs.cp('public', path.join(project, 'public'), { recursive: true, filter: source => source !== path.join('public', 'downloads') });
      const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
      pkg.name = `kayan-${variant}-demo`;
      pkg.packageManager = 'pnpm@10.11.0';
      pkg.scripts = { dev: 'vite', build: 'vite build', preview: 'vite preview', lint: 'eslint .' };
      await fs.writeFile(path.join(project, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
      const config = JSON.parse(await fs.readFile(driver ? 'capacitor.driver.config.json' : 'capacitor.config.json', 'utf8'));
      config.webDir = 'dist';
      await fs.writeFile(path.join(project, 'capacitor.config.json'), JSON.stringify(config, null, 2) + '\n');
      await fs.writeFile(path.join(project, 'src/App.tsx'), appSource(driver));
      await fs.writeFile(path.join(project, 'vite.config.ts'), `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react-swc';\nimport path from 'node:path';\nexport default defineConfig({ plugins: [react()], define: { 'import.meta.env.VITE_APP_VARIANT': JSON.stringify('${variant}') }, resolve: { alias: { '@': path.resolve(__dirname, './src') } } });\n`);
      let html = await fs.readFile('index.html', 'utf8');
      html = html.replace('KAYAN Passenger Demo', `KAYAN ${label} Demo`);
      await fs.writeFile(path.join(project, 'index.html'), html);
      for (const page of ['Index.tsx', 'Website.tsx']) {
        const file = path.join(project, 'src/pages', page);
        let content = await fs.readFile(file, 'utf8');
        content = content.replaceAll('/assets/kayan-driver.png', '/assets/kayan-eagle.png').replaceAll('Illustrative professional KAYAN service', 'KAYAN eagle logo').replaceAll('Illustrative clean taxi and professional driver in Lusaka', 'KAYAN eagle logo').replaceAll('Illustrative professional driver and clean taxi in Lusaka', 'KAYAN eagle logo');
        content = content.split('\n').filter(line => !line.includes('to="/driver"') && !line.includes('to="/projects"')).join('\n');
        if (page === 'Website.tsx') content = content.replace(/<a href="\/kayan-demo\.html"[^]*?<\/a>/, '');
        await fs.writeFile(file, content);
      }
      await fs.writeFile(path.join(project, '.gitignore'), 'node_modules/\ndist/\nandroid/\n.apk-tools/\n.env*\n*.local\n*.log\n');
      await fs.mkdir(path.join(project, '.github/workflows'), { recursive: true });
      await fs.writeFile(path.join(project, '.github/workflows/build-apk.yml'), workflow(label));
      await fs.writeFile(path.join(project, 'README.md'), `# KAYAN ${label} — independent GitHub APK project\n\nAndroid package: **${config.appId}**. App label: **${config.appName}**. This project opens only the ${variant} experience at the root route. No dependency on the other repository.\n\n## Compile on GitHub (no terminal required)\n\n1. Create a separate GitHub repository named kayan-${variant}.\n2. Extract this ZIP. Upload the CONTENTS of its kayan-${variant} folder into the repository root, not the ZIP itself or a nested folder. Include the hidden .github folder and .gitignore. Confirm .github/workflows/build-apk.yml, package.json, pnpm-lock.yaml, src, public, and capacitor.config.json appear in GitHub.\n3. Commit to main. Actions runs automatically; alternatively select Actions → Build KAYAN ${label} APK → Run workflow on the default branch. Enable Actions if prompted.\n4. Open the successful run and download KAYAN-${label}-Demo-APK under Artifacts. Extract app-debug.apk and install on your trusted test Android device. Do not bypass Play Protect.\n\nBoth projects use different package IDs and can be installed side by side. Updates may require uninstalling an earlier debug build if CI signing keys differ; this clears local preferences.\n\n## Included\n\nReact/TypeScript source, locked pnpm web dependencies, native foreground location plugins, real Leaflet/OpenStreetMap map, eagle launcher icon generation, Capacitor config, and a complete GitHub Actions debug APK workflow. Web source dependencies use a frozen lockfile; Android CLI/framework packaging tools resolve within Capacitor major 7 in an isolated tools directory. Node 22, Java 21 and Android SDK are set up by CI. No signing secrets or map API key are required.\n\n${driver ? 'First-launch fictional driver pre-registration, manual ride requests/trips, scripted chat/call, illustrative earnings and history.' : 'Passenger booking and registration previews, manual trip simulation and scripted chat/call.'}\n\nReal device location is opt-in, foreground-only and separate from simulated trips. No real dispatch, payments, uploads or approval. Subscription pricing and rewards remain unfinalized. See GPS_ANDROID_TESTING.md for privacy and MuMu/physical-device checks.\n\n## Verification and limits\n\nThese archives are generated from the current application source. Their standalone web builds are checked during export. An APK is produced only after the GitHub workflow succeeds. Native compilation, launcher rendering, GPS permissions and physical GPS accuracy still require device testing; emulator location does not prove physical accuracy. Debug builds are not signed store releases.\n`);
      if (verify) {
        await fs.symlink(path.resolve('node_modules'), path.join(project, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
        execFileSync(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'build'], { cwd: project, stdio: 'pipe', timeout: 120000 });
        await fs.rm(path.join(project, 'node_modules'));
        await fs.rm(path.join(project, 'dist'), { recursive: true, force: true });
      }
      const files = await entries(project, `kayan-${variant}/`);
      for (const required of ['package.json', 'pnpm-lock.yaml', 'capacitor.config.json', '.github/workflows/build-apk.yml', 'src/App.tsx', 'src/android/prepare-android.mjs', 'public/assets/kayan-eagle.png']) {
        if (!files.some(file => file.name === `kayan-${variant}/${required}`)) throw new Error('Missing export file ' + required);
      }
      const buffer = zip(files);
      const filename = `kayan-${variant}-github-project.zip`;
      await fs.writeFile(path.join(outputDirectory, filename), buffer);
      manifest.push({ variant, filename, packageId: config.appId, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), files: files.length, standaloneWebBuildVerified: verify });
    }
    await fs.writeFile(path.join(outputDirectory, 'projects.json'), JSON.stringify({ generatedAt: new Date().toISOString(), projects: manifest }, null, 2));
    console.log('Generated two independent KAYAN GitHub project ZIPs' + (verify ? ' with verified standalone web builds.' : '.'));
    return manifest;
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
