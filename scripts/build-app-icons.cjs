const fs = require('fs');
const path = require('path');
const os = require('os');
const {execFileSync} = require('child_process');
const root = path.resolve(__dirname, '..');
const images = path.join(root, 'src/image');
const source = path.join(images, 'app-icon-source.png');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fde-app-icon-'));
try {
  // Optical sizing for the supplied 1254px artwork: its visible tile is about
  // 956px tall. Trim only the excess transparent frame so the tile occupies
  // about 832px of a 1024px macOS icon canvas (81.25%). Keep the logo intact.
  const normalized = path.join(temporary, 'normalized.png');
  execFileSync('sips', ['-c', '1178', '1178', '--cropOffset', '46', '38', source, '--out', normalized], {stdio:'pipe'});
  execFileSync('sips', ['-z', '1024', '1024', normalized, '--out', path.join(images, 'icon.png')], {stdio:'pipe'});
  const iconset = path.join(temporary, 'icon.iconset');
  fs.mkdirSync(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) execFileSync('sips', ['-z', String(size * scale), String(size * scale), normalized, '--out', path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)], {stdio:'pipe'});
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(images, 'icon.icns')], {stdio:'pipe'});
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const payloads = sizes.map(size => {
    const file = path.join(temporary, `${size}.png`);
    execFileSync('sips', ['-z', String(size), String(size), normalized, '--out', file], {stdio:'pipe'});
    return fs.readFileSync(file);
  });
  const header = Buffer.alloc(6 + sizes.length * 16); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, index) => {
    const position = 6 + index * 16;
    header[position] = header[position + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, position + 4); header.writeUInt16LE(32, position + 6);
    header.writeUInt32LE(payloads[index].length, position + 8); header.writeUInt32LE(offset, position + 12);
    offset += payloads[index].length;
  });
  fs.writeFileSync(path.join(images, 'icon.ico'), Buffer.concat([header, ...payloads]));
  console.log('Updated PNG, macOS ICNS and Windows ICO from the supplied app icon.');
} finally {fs.rmSync(temporary, {recursive:true, force:true});}
