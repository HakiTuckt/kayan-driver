import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = 'android/app/src/main';
const manifestPath = path.join(root, 'AndroidManifest.xml');
let manifest = await fs.readFile(manifestPath, 'utf8');
const permissions = ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'];
let declarations = '';
for (const permission of permissions) {
  if (!manifest.includes(`android.permission.${permission}`)) declarations += `    <uses-permission android:name="android.permission.${permission}" />\n`;
}
if (!manifest.includes('android.hardware.location.gps')) declarations += '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n';
manifest = manifest.replace(/(<manifest\b[^>]*>)/, `$1\n${declarations}`);
if (manifest.includes('android.permission.ACCESS_BACKGROUND_LOCATION')) throw new Error('Background location is outside the demo permission scope');
const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
if (androidMapsKey) {
  const xmlKey = androidMapsKey.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const metadata = `        <meta-data android:name="com.google.android.geo.API_KEY" android:value="${xmlKey}" />`;
  if (manifest.includes('android:name="com.google.android.geo.API_KEY"')) {
    const updatedManifest = manifest.replace(/^\s*<meta-data android:name="com\.google\.android\.geo\.API_KEY"[^>]*\/>\s*$/m, metadata);
    if (updatedManifest === manifest) throw new Error('Could not update the existing Android Maps API key metadata.');
    manifest = updatedManifest;
  } else {
    const updatedManifest = manifest.replace(/(<application\b[^>]*>)/, `$1\n${metadata}`);
    if (updatedManifest === manifest) throw new Error('Could not find the Android application manifest element for Maps API key metadata.');
    manifest = updatedManifest;
  }
}
await fs.writeFile(manifestPath, manifest);

const res = path.join(root, 'res');
const logo = 'public/assets/kayan-eagle.png';
const forest = '#062d24';
const densities = [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]];
for (const [density, size] of densities) {
  const directory = path.join(res, `mipmap-${density}`);
  await fs.mkdir(directory, { recursive: true });
  // Keep the existing eagle image intact inside the launcher safe area.
  const art = await sharp(logo).resize(Math.round(size * .72), Math.round(size * .72), { fit: 'contain', background: forest }).png().toBuffer();
  const legacy = await sharp({ create: { width: size, height: size, channels: 4, background: forest } }).composite([{ input: art, gravity: 'centre' }]).png().toBuffer();
  await fs.writeFile(path.join(directory, 'ic_launcher.png'), legacy);
  await fs.writeFile(path.join(directory, 'ic_launcher_round.png'), legacy);
  const adaptiveSize = Math.round(size * 108 / 48);
  const safeSize = Math.round(adaptiveSize * .55);
  const foreground = await sharp(logo).resize(safeSize, safeSize, { fit: 'contain', background: forest }).png().toBuffer();
  await sharp({ create: { width: adaptiveSize, height: adaptiveSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: foreground, gravity: 'centre' }]).png().toFile(path.join(directory, 'ic_launcher_foreground.png'));
}
await fs.mkdir(path.join(res, 'drawable'), { recursive: true });
await fs.writeFile(path.join(res, 'drawable/kayan_icon_background.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#062d24" /></shape>\n');
const adaptiveDirectory = path.join(res, 'mipmap-anydpi-v26');
await fs.mkdir(adaptiveDirectory, { recursive: true });
const adaptive = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@drawable/kayan_icon_background" /><foreground android:drawable="@mipmap/ic_launcher_foreground" /></adaptive-icon>\n';
for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) await fs.writeFile(path.join(adaptiveDirectory, name), adaptive);
console.log('Prepared foreground location permissions and KAYAN eagle launcher icons.');
