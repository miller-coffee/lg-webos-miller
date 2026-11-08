// Inspect Git objects, never ignored local credentials or personal media.
import {execFileSync} from 'node:child_process';
const git=(...args)=>execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),...args],{maxBuffer:64*1024*1024});
const staged=process.argv.includes('--staged');
const paths=git('ls-files','-z').toString().split('\0').filter(Boolean);
const forbidden=/^(?:\.local\/|diagnostics\/|downloads\/|output\/|dist\/|\.build\/|node_modules\/|usb-root\/|tv\/device\.json$|app\/assets\/(?:background\.local\.|family-desert\.|intro\/(?:.*\.mp4|manifest\.json$)))|(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|bundle)$/i;
const rules=[
  ['private IPv4',/\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/],
  ['hardware address',/\b(?:[a-f\d]{2}:){5}[a-f\d]{2}\b/i],
  ['host fingerprint',/SHA256:[A-Za-z0-9+/]{20,}/],
  ['private key',/-----BEGIN (?:OPENSSH |RSA |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['GitHub token',/\b(?:gh[pousr]_[A-Za-z\d]{20,}|github_pat_[A-Za-z\d_]{20,})\b/],
  ['cloud key',/\bAKIA[A-Z\d]{16}\b/],
  ['API secret',/\bsk-[A-Za-z\d_-]{30,}\b/],
  ['personal home path',/(?:[A-Z]:[\\/](?:Users|Documents and Settings)[\\/][^\s'"/\\]+|\/Users\/[^\s'"/]+)/i]
];
let failures=0,checked=0;
function inspect(label,bytes){
  checked++;const source=bytes.toString('latin1');
  for(const [name,pattern] of rules)if(pattern.test(source)){console.error(name+': '+label);failures++;}
  if(bytes.length>8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
    for(let offset=8;offset+12<=bytes.length;){
      const length=bytes.readUInt32BE(offset),type=bytes.subarray(offset+4,offset+8).toString();
      if(['eXIf','tEXt','iTXt','zTXt','tIME'].includes(type)){console.error('Image metadata '+type+': '+label);failures++;}
      offset+=length+12;
    }
  }
}
for(const path of paths)if(forbidden.test(path)){console.error('Private file is tracked: '+path);failures++;}
if(staged){for(const path of paths)inspect(path,git('show',':'+path));}
else{
  const objects=git('rev-list','--objects','--all').toString().trim().split('\n');
  for(const entry of objects){
    const split=entry.indexOf(' '),sha=split<0?entry:entry.slice(0,split),name=split<0?sha:entry.slice(split+1);
    if(forbidden.test(name)){console.error('Private file in history: '+name);failures++;}
    const type=git('cat-file','-t',sha).toString().trim();
    if(type==='blob'||type==='commit')inspect(name,git('cat-file',type,sha));
  }
}
if(failures){console.error('Public audit failed: '+failures+' finding(s).');process.exitCode=1;}
else console.log('Public audit passed: '+paths.length+' tracked files, '+checked+' Git objects inspected'+(staged?' in index.':' across all refs.'));
