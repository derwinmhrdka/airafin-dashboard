/**
 * Vector avatar parts from vue-color-avatar (MIT).
 * Illustrations: Avatar Illustration System by Micah Lanier, CC BY 4.0.
 * https://github.com/Codennnn/vue-color-avatar
 */

const NONE = 'none';

const LAYER: Record<string, number> = {
  face: 10,
  eyes: 50,
  nose: 60,
  eyebrows: 70,
  tops: 80,
  glasses: 90,
  mouth: 100,
  ear: 102,
  earrings: 103,
  beard: 105,
  clothes: 110,
};

const COMMON = [
  '#6BD9E9',
  '#FC909F',
  '#F4D150',
  '#E0DDFF',
  '#D2EFF3',
  '#FFEDEF',
  '#FFEBA4',
  '#506AF4',
  '#F48150',
  '#48A99A',
  '#C09FFF',
  '#FD6F5D',
];

const SKIN = ['#F8D9CE', '#F9C9B6', '#DEB3A3', '#C89583', '#9C6458'];

const BACKGROUNDS = [
  ...COMMON,
  'linear-gradient(45deg, #E3648C, #D97567)',
  'linear-gradient(62deg, #8EC5FC, #E0C3FC)',
  'linear-gradient(90deg, #ffecd2, #fcb69f)',
  'linear-gradient(120deg, #a1c4fd, #c2e9fb)',
  'linear-gradient(-135deg, #fccb90, #d57eeb)',
];

const FEMALE_TOPS = ['danny', 'wave', 'pixie'];
const TOPS = ['fonze', 'funny', 'clean', 'punk', 'danny', 'wave', 'turban', 'pixie', 'beanie'];

const widgetFiles = import.meta.glob('./widgets/**/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

interface WidgetOpt {
  shape: string;
  fillColor?: string;
  zIndex?: number;
}

export interface ColorAvatar {
  background: string;
  svg: string;
}

interface AvatarConfig {
  background: string;
  skin: string;
  hair: string;
  hairColor: string;
  ear: string;
  earrings: string;
  eyebrows: string;
  eyes: string;
  nose: string;
  glasses: string;
  mouth: string;
  beard: string;
  clothes: string;
  clothesColor: string;
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: string): () => number {
  let a = hashSeed(seed) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, arr: readonly T[], usually: readonly T[] = []): T {
  const weighted = usually.flatMap((item) => Array.from({ length: 15 }, () => item));
  const pool = [...arr, ...weighted];
  return pool[Math.floor(rand() * pool.length)] ?? arr[0];
}

function scopeIds(content: string, scope: string): string {
  const ids = [...content.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  let out = content;
  for (const id of ids) {
    const next = `${id}-${scope}`;
    out = out.replaceAll(`id="${id}"`, `id="${next}"`);
    out = out.replaceAll(`url(#${id})`, `url(#${next})`);
  }
  return out;
}

function widgetInner(type: string, shape: string, fill: string | undefined, scope: string): string {
  if (!shape || shape === NONE) return '';
  const raw = widgetFiles[`./widgets/${type}/${shape}.svg`];
  if (!raw) return '';
  const start = raw.indexOf('>', raw.indexOf('<svg'));
  const content = raw
    .slice(start + 1)
    .replace('</svg>', '')
    .replaceAll('$fillColor', fill || 'transparent');
  return `<g id="color-avatar-${type}-${scope}">${scopeIds(content, `${scope}-${type}`)}</g>`;
}

function optionFromSeed(seed: string): AvatarConfig {
  const rand = rng(seed || 'airafin');
  const male = rand() < 0.5;
  const topsPool = male ? TOPS.filter((shape) => !FEMALE_TOPS.includes(shape)) : FEMALE_TOPS;
  const beard = male ? pick(rand, ['scruff'], [NONE]) : NONE;
  return {
    hair: pick(rand, topsPool),
    hairColor: pick(rand, COMMON),
    skin: pick(rand, SKIN),
    ear: pick(rand, ['attached', 'detached']),
    earrings: pick(rand, ['hoop', 'stud'], [NONE]),
    eyebrows: pick(rand, ['up', 'down', 'eyelashesup', 'eyelashesdown']),
    eyes: pick(rand, ['ellipse', 'smiling', 'eyeshadow', 'round']),
    nose: pick(rand, ['curve', 'round', 'pointed']),
    glasses: pick(rand, ['round', 'square'], [NONE]),
    mouth: pick(rand, ['frown', 'laughing', 'nervous', 'pucker', 'sad', 'smile', 'smirk', 'surprised']),
    beard,
    clothes: pick(rand, ['crew', 'collared', 'open']),
    clothesColor: pick(rand, COMMON),
    background: pick(rand, BACKGROUNDS),
  };
}

function renderAvatar(config: AvatarConfig, scopeExtra = ''): ColorAvatar {
  const widgets: Record<string, WidgetOpt> = {
    face: { shape: 'base', fillColor: config.skin },
    tops: { shape: config.hair, fillColor: config.hairColor },
    ear: { shape: config.ear },
    earrings: { shape: config.earrings },
    eyebrows: { shape: config.eyebrows },
    eyes: { shape: config.eyes },
    nose: { shape: config.nose },
    glasses: { shape: config.glasses },
    mouth: { shape: config.mouth },
    beard: {
      shape: config.beard,
      zIndex: config.beard === 'scruff' ? LAYER.mouth - 1 : undefined,
    },
    clothes: { shape: config.clothes, fillColor: config.clothesColor },
  };

  const scope = `${config.hair}${config.eyes}${config.mouth}${scopeExtra}`.replace(/[^a-zA-Z0-9]/g, '') || 'avatar';
  const layers = Object.entries(widgets)
    .map(([type, widget]) => {
      const z = widget.zIndex ?? LAYER[type] ?? 0;
      return { type, widget, z };
    })
    .sort((a, b) => a.z - b.z);

  let skinColor = config.skin;
  const parts = layers.map(({ type, widget }) => {
    let fill = widget.fillColor;
    if (type === 'face' && fill) skinColor = fill;
    if (type === 'ear') fill = skinColor;
    return widgetInner(type, widget.shape, fill, scope);
  });

  const svg = `<svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMax meet" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><g transform="translate(100, 65)">${parts.join('')}</g></svg>`;
  return { background: config.background, svg };
}

export function colorAvatar(seed: string, scopeExtra = ''): ColorAvatar {
  return renderAvatar(optionFromSeed(seed), `${seed}${scopeExtra}`);
}
