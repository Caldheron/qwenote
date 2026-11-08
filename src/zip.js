// Petit écrivain ZIP (sans compression, noms UTF-8) : pas de dépendance, fonctionne hors ligne.
const te = new TextEncoder();
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function makeZip(files, date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dday = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const entries = files.map((f) => {
    const name = te.encode(f.name);
    const data = typeof f.data === 'string' ? te.encode(f.data) : f.data;
    return { name, data, crc: crc32(data) };
  });
  let size = 22;
  entries.forEach((e) => { size += 30 + e.name.length + e.data.length + 46 + e.name.length; });
  const out = new Uint8Array(size); const v = new DataView(out.buffer);
  let p = 0; const offs = [];
  const u16 = (x) => { v.setUint16(p, x, true); p += 2; };
  const u32 = (x) => { v.setUint32(p, x, true); p += 4; };
  entries.forEach((e) => {
    offs.push(p);
    u32(0x04034b50); u16(20); u16(0x0800); u16(0); u16(time); u16(dday);
    u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.name.length); u16(0);
    out.set(e.name, p); p += e.name.length; out.set(e.data, p); p += e.data.length;
  });
  const cd = p;
  entries.forEach((e, i) => {
    u32(0x02014b50); u16(20); u16(20); u16(0x0800); u16(0); u16(time); u16(dday);
    u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(offs[i]);
    out.set(e.name, p); p += e.name.length;
  });
  const cdSize = p - cd;
  u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length); u32(cdSize); u32(cd); u16(0);
  return out;
}
