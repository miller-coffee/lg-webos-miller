import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

execFileSync(process.execPath, ['tools/package.mjs']);
const info = JSON.parse(fs.readFileSync('app/appinfo.json'));
const archive = fs.readFileSync('dist/' + info.id + '_' + info.version + '_all.ipk');
assert.equal(archive.subarray(0, 8).toString(), '!<arch>\n');
const members = {};
for (let offset = 8; offset < archive.length;) {
  const name = archive.subarray(offset, offset + 16).toString().trim().replace(/\/$/, '');
  const length = Number(archive.subarray(offset + 48, offset + 58).toString().trim());
  assert.ok(Number.isFinite(length) && length > 0, 'valid ar member length');
  members[name] = archive.subarray(offset + 60, offset + 60 + length);
  offset += 60 + length + length % 2;
}
const extract = (member, name) => execFileSync('tar', ['-xOzf', '-', name], {input:members[member], maxBuffer:64 * 1024 * 1024});

test('webOS package declares sufficient installed bytes for all resources', () => {
  const control = extract('control.tar.gz', 'control').toString();
  const declared = Number(control.match(/^Installed-Size: (\d+)$/m)?.[1]);
  assert.ok(declared > fs.statSync('app/assets/background.svg').size);
  assert.match(control, new RegExp('Version: ' + info.version.replaceAll('.', '\\.')));
});

test('webOS package contains the public background, optional local override and current stylesheet', () => {
  const base = 'usr/palm/applications/' + info.id + '/';
  const packagedPhoto = extract('data.tar.gz', base + 'assets/background.svg');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(packagedPhoto), hash(fs.readFileSync('app/assets/background.svg')));
  if(fs.existsSync('app/assets/background.local.png')) {
    assert.equal(hash(extract('data.tar.gz',base+'assets/background.local.png')),hash(fs.readFileSync('app/assets/background.local.png')));
  }
  assert.equal(extract('data.tar.gz', base + 'style.css').toString(), fs.readFileSync('app/style.css', 'utf8'));
});

test('webOS package includes an original icon for every app tile', () => {
  const source = fs.readFileSync('app/apps.js', 'utf8');
  const ids = [...source.matchAll(/id: '([^']+)'/g)].map(match => match[1]);
  assert.equal(ids.length, 10);
  for (const id of ids) {
    const path = 'assets/icons/' + id + '.png';
    const original = fs.readFileSync('app/' + path);
    assert.equal(original.subarray(1, 4).toString(), 'PNG');
    assert.deepEqual(extract('data.tar.gz', 'usr/palm/applications/' + info.id + '/' + path), original);
  }
});

test('webOS package includes the 64-frame bunny atlas and its state manifest', () => {
  const base = 'usr/palm/applications/' + info.id + '/assets/bunny/';
  const png = extract('data.tar.gz', base + 'sprites.png');
  assert.equal(png.readUInt32BE(16), 1536);
  assert.equal(png.readUInt32BE(20), 1536);
  assert.deepEqual(png, fs.readFileSync('app/assets/bunny/sprites.png'));
  const manifest = JSON.parse(extract('data.tar.gz', base + 'manifest.json'));
  assert.equal(Object.keys(manifest.states).length, 7);
  assert.equal(manifest.columns * manifest.rows, 64);
  assert.equal(manifest.states.carrot.frames, 16);
  assert.equal(manifest.states.carrot.loop, false);
});

test('app picker catalog, controller and every catalog icon are included in the TV package', () => {
  const base = 'usr/palm/applications/' + info.id + '/';
  const source = extract('data.tar.gz', base + 'catalog.js').toString();
  const catalog = JSON.parse(source.replace(/^window.MILLER_CATALOG = /, '').replace(/;\s*$/, ''));
  assert.ok(catalog.length > 10);
  for (const app of catalog) {
    assert.deepEqual(extract('data.tar.gz', base + app.icon), fs.readFileSync('app/' + app.icon));
  }
  assert.equal(extract('data.tar.gz', base + 'editor.js').toString(), fs.readFileSync('app/editor.js', 'utf8'));
  assert.match(extract('data.tar.gz', base + 'index.html').toString(), /id="app-editor"/);
});

test('startup video is packaged with matching bytes when local media is available', {skip:!fs.existsSync('app/assets/intro/startup.mp4')||!fs.existsSync('app/assets/intro/manifest.json')}, () => {
  const base = 'usr/palm/applications/' + info.id + '/';
  const media = extract('data.tar.gz', base + 'assets/intro/startup.mp4');
  const manifest = JSON.parse(extract('data.tar.gz', base + 'assets/intro/manifest.json'));
  assert.equal(media.subarray(4,8).toString(),'ftyp');
  assert.equal(createHash('sha256').update(media).digest('hex'),manifest.output.sha256);
  assert.equal(manifest.durationSeconds,96);
  assert.notEqual(manifest.video.source,manifest.audio.source);
  assert.deepEqual(manifest.output.streams,['input 0 video stream 0','input 1 audio stream 0']);
  assert.equal(extract('data.tar.gz',base+'intro.js').toString(),fs.readFileSync('app/intro.js','utf8'));
});

test('optional startup controller and local-media instructions are always packaged', () => {
  const base='usr/palm/applications/'+info.id+'/';
  assert.equal(extract('data.tar.gz',base+'intro.js').toString(),fs.readFileSync('app/intro.js','utf8'));
  assert.match(extract('data.tar.gz',base+'assets/intro/README.md').toString(),/Optional startup media/);
});


test('condensed carousel font and its open license are bundled for offline TV rendering', () => {
  const base='usr/palm/applications/'+info.id+'/assets/fonts/';
  const font=extract('data.tar.gz',base+'Anton-Regular.ttf');
  assert.deepEqual(font,fs.readFileSync('app/assets/fonts/Anton-Regular.ttf'));
  assert.equal(font.readUInt32BE(0),0x00010000);
  assert.match(extract('data.tar.gz',base+'OFL.txt').toString(),/SIL OPEN FONT LICENSE/);
});


test('giraffe atlas, animation controller and manifest are included in the TV package',()=>{
  const base='usr/palm/applications/'+info.id+'/';
  const png=extract('data.tar.gz',base+'assets/giraffe/sprites.png');
  assert.deepEqual(png,fs.readFileSync('app/assets/giraffe/sprites.png'));
  assert.equal(png.readUInt32BE(16),1254);assert.equal(png.readUInt32BE(20),1254);
  assert.equal(png[25],6,'RGBA transparency is preserved');
  const manifest=JSON.parse(extract('data.tar.gz',base+'assets/giraffe/manifest.json'));
  assert.equal(manifest.columns*manifest.rows,16);
  assert.equal(manifest.states.walk.frames,12);assert.equal(manifest.states.idle.frames,4);
  assert.equal(extract('data.tar.gz',base+'giraffe.js').toString(),fs.readFileSync('app/giraffe.js','utf8'));
});
