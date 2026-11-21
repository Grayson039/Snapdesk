// Generates assets/icon.png (256) and assets/tray.png (32) from an SVG. Run: node tools/make-icons.js
const sharp = require('sharp'); const path = require('path');
const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6a3d"/><stop offset="1" stop-color="#ff3d77"/></linearGradient></defs>
<rect x="8" y="8" width="240" height="240" rx="58" fill="url(#g)"/>
<g fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"><path d="M66 104V82a16 16 0 0116-16h22M152 66h22a16 16 0 0116 16v22M190 152v22a16 16 0 01-16 16h-22M104 190H82a16 16 0 01-16-16v-22"/><circle cx="128" cy="128" r="22"/></g></svg>`;
(async () => {
  await sharp(Buffer.from(svg(256))).png().toFile(path.join(__dirname, '..', 'assets', 'icon.png'));
  await sharp(Buffer.from(svg(256))).resize(32, 32).png().toFile(path.join(__dirname, '..', 'assets', 'tray.png'));
  console.log('icons written');
})();
