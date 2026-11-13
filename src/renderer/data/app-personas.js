// AI 应用的数字人形象：每个内置应用一套固定外形（插画风占位，之后可换真实头像图）。
// 字段：skin 肤色 / hair 发型 / hairColor / outfit 衣服色 / accent 头像底色 / glasses / accessory 小配饰
export const PERSONAS = {
  'image-generation':     { skin: '#f6d2b8', hair: 'long',   hairColor: '#3b2416', outfit: '#c2412d', accent: '#dbeafe', glasses: 'sun',   accessory: 'scarf' },
  'ppt-maker':            { skin: '#efc5a4', hair: 'side',   hairColor: '#3b2416', outfit: '#1d4ed8', accent: '#dbeafe', glasses: 'round', accessory: false },
  'manual-writer':        { skin: '#f6d2b8', hair: 'bun',    hairColor: '#3b2416', outfit: '#0369a1', accent: '#e0f2fe', glasses: 'rect',  accessory: false },
  'prototype-maker':      { skin: '#e9b995', hair: 'short',  hairColor: '#2b1b12', outfit: '#2563eb', accent: '#dbeafe', glasses: 'rect',  accessory: false },
  'product-intro':        { skin: '#efc5a4', hair: 'bob',    hairColor: '#3b2416', outfit: '#1d4ed8', accent: '#dbeafe', glasses: false,   accessory: false },
  'whitepaper-writer':    { skin: '#f3ccb0', hair: 'long',   hairColor: '#2b1b12', outfit: '#1e40af', accent: '#e0e7ff', glasses: 'round', accessory: false },
  'promo-film':           { skin: '#f6d2b8', hair: 'short',  hairColor: '#1f1a17', outfit: '#0e7490', accent: '#cffafe', glasses: 'rect',  accessory: 'headset' },
  'medical-expert':       { skin: '#f3ccb0', hair: 'bob',    hairColor: '#2b1b12', outfit: '#f8fafc', accent: '#ccfbf1', glasses: 'rect',  accessory: 'stethoscope' },
  'clinical-expert':      { skin: '#efc5a4', hair: 'short',  hairColor: '#1f1a17', outfit: '#f8fafc', accent: '#ffe4e6', glasses: 'round', accessory: 'stethoscope' },
};

const SKINS = ['#f6d2b8', '#efc5a4', '#f3ccb0', '#e9b995'];
const HAIRS = ['long', 'short', 'bob', 'side', 'bun'];
const HAIR_COLORS = ['#3b2416', '#1f1a17', '#4a2c1d', '#5b3a25'];
const GLASSES = [false, 'round', 'rect', false];

function hash(text) {
  let h = 0;
  for (const c of String(text || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

// 没有预设的应用（本地开发的）按 id 稳定地生成一套，主题色用作衣服颜色
export function personaFor(app) {
  if (!app) return PERSONAS['image-generation'];
  if (PERSONAS[app.id]) return PERSONAS[app.id];
  const h = hash(app.id || app.name);
  const outfit = /^#[0-9a-f]{6}$/i.test(app.color || '') ? app.color : '#2563eb';
  return {
    skin: SKINS[h % SKINS.length],
    hair: HAIRS[(h >> 3) % HAIRS.length],
    hairColor: HAIR_COLORS[(h >> 6) % HAIR_COLORS.length],
    outfit,
    accent: `color-mix(in srgb, ${outfit} 14%, #fff)`,
    glasses: GLASSES[(h >> 9) % GLASSES.length],
    accessory: false,
  };
}
