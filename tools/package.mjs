import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const info = JSON.parse(fs.readFileSync(path.join(root, 'app/appinfo.json')));
fs.mkdirSync(path.join(root, '.build'), { recursive: true });
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const staging = fs.mkdtempSync(path.join(root, '.build/package-'));
const data = path.join(staging, 'data');
const control = path.join(staging, 'control');
const app = path.join(data, 'usr/palm/applications', info.id);
const pkg = path.join(data, 'usr/palm/packages', info.id);
fs.mkdirSync(app, { recursive: true });
fs.mkdirSync(pkg, { recursive: true });
fs.mkdirSync(control);
fs.cpSync(path.join(root, 'app'), app, { recursive: true });

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, bytes) {
  const type = Buffer.from(name);
  const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([type, bytes])));
  return Buffer.concat([size, type, bytes, checksum]);
}
function icon() {
  const size = 130;
  const pixels = Buffer.alloc((1 + size * 3) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 3); pixels[row] = 0;
    for (let x = 0; x < size; x++) {
      const vertical = ((x >= 29 && x < 38) || (x >= 92 && x < 101)) && y >= 30 && y <= 100;
      const diagonal = y >= 30 && y <= 68 && (Math.abs(x - (30 + (y - 30) * 0.93)) < 6 || Math.abs(x - (99 - (y - 30) * 0.93)) < 6);
      const border = ((x === 10 || x === 119) && y >= 10 && y <= 119) || ((y === 10 || y === 119) && x >= 10 && x <= 119);
      const color = vertical || diagonal ? [184, 213, 199] : border ? [74, 100, 104] : [16, 22, 30];
      pixels.set(color, row + 1 + x * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
fs.writeFileSync(path.join(app, 'icon.png'), icon());
fs.writeFileSync(path.join(pkg, 'packageinfo.json'), JSON.stringify({id:info.id, version:info.version, app:info.id}));
function directorySize(directory) {
  return fs.readdirSync(directory, {withFileTypes:true}).reduce((total, entry) => {
    const target = path.join(directory, entry.name);
    return total + (entry.isDirectory() ? directorySize(target) : fs.statSync(target).size);
  }, 0);
}
fs.writeFileSync(path.join(control, 'control'), [
  'Package: ' + info.id, 'Version: ' + info.version, 'Section: misc', 'Priority: optional',
  'Architecture: all', 'Installed-Size: ' + directorySize(data),
  'Maintainer: Miller', 'Description: Local app launcher for Miller TV',
  'webOS-Package-Format-Version: 2', 'webOS-Packager-Version: miller-local', ''
].join('\n'));
for (const [name, directory] of [['data', data], ['control', control]]) {
  execFileSync('tar', ['--format=ustar', '-czf', path.join(staging, name + '.tar.gz'), '-C', directory, name === 'data' ? 'usr' : 'control']);
}
function arEntry(name, bytes) {
  const header = name.padEnd(16) + '0'.padEnd(12) + '0'.padEnd(6) + '0'.padEnd(6) + '100644'.padEnd(8) + String(bytes.length).padEnd(10) + '`\n';
  if (Buffer.byteLength(header) !== 60) throw new Error('Invalid ar member header');
  return Buffer.concat([Buffer.from(header), bytes, bytes.length % 2 ? Buffer.from('\n') : Buffer.alloc(0)]);
}
const result = Buffer.concat([
  Buffer.from('!<arch>\n'), arEntry('debian-binary', Buffer.from('2.0\n')),
  arEntry('control.tar.gz', fs.readFileSync(path.join(staging, 'control.tar.gz'))),
  arEntry('data.tar.gz', fs.readFileSync(path.join(staging, 'data.tar.gz')))
]);
const output = path.join(root, 'dist', info.id + '_' + info.version + '_all.ipk');
fs.writeFileSync(output, result);
console.log(output + ' (' + result.length + ' bytes)');
