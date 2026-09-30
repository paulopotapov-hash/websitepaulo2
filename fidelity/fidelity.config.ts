/**
 * fidelity.config.ts — single source of truth for the fidelity system.
 * Run all commands from the repository root (paths are resolved from process.cwd()).
 */
import path from 'node:path';

export type Target = 'wix' | 'react';

export const SCHEMA_VERSION = 2;
export const METRIC_SCHEMA_VERSION = 2;
export const ROOT = path.resolve(process.cwd(), 'fidelity');

// ---------------------------------------------------------------- viewports
export const VIEWPORTS = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1280', width: 1280, height: 800 },
] as const;
export type Viewport = (typeof VIEWPORTS)[number];

export const DEVICE_SCALE_FACTOR = 1;

// --------------------------------------------------------------------- urls
export const URLS: Record<Target, string> = {
  wix: 'https://romeu848.wixsite.com/website-2',
  // TODO: point to the English home route of the React app if routing is /en (reference copy is English).
  react: process.env.FIDELITY_REACT_URL ?? 'http://localhost:4197/',
};

// -------------------------------------------------------------------- paths
export const PATHS = {
  fixtures: { wix: path.join(ROOT, 'reference'), react: path.join(ROOT, 'current') },
  shots: {
    wix: path.join(ROOT, 'screenshots', 'reference'),
    react: path.join(ROOT, 'screenshots', 'current'),
    diff: path.join(ROOT, 'screenshots', 'diff'),
  },
  snapshots: path.join(ROOT, 'reference', 'snapshots'),
  report: path.join(ROOT, 'fidelity-report.json'),
};

// ------------------------------------------------------------ normalization
export const NORMALIZATION = {
  /** Elements hidden (display:none) before measuring. Their height is recorded in the fixture first. */
  hideSelectors: {
    wix: ['#WIX_ADS'], // UNVERIFIED: Wix free-plan banner container. Check in DevTools.
    react: [] as string[],
  },
  /**
   * Animations are fast-forwarded to their END state (not removed), so elements that start
   * hidden by an entrance animation still end up visible. Playwright's screenshot option
   * animations:'disabled' is applied on top of this.
   */
  css: `*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important;caret-color:transparent!important}`,
  scrollStepRatio: 0.5, // of viewport height, used to trigger lazy loading
  scrollWaitMs: 150,
  saveHtmlSnapshot: { wix: true, react: false },
  chromiumArgs: ['--font-render-hinting=none', '--disable-lcd-text'],
};

export const SERVER_MARKER = {
  selector: 'meta[name="fidelity-build"]',
  content: 'paulowebsite2',
};

// ---------------------------------------------------------------- selectors
export const CHROME_SELECTORS: Record<Target, { navbar: string; footer: string }> = {
  wix: { navbar: 'header#SITE_HEADER, header', footer: 'footer#SITE_FOOTER, footer' }, // UNVERIFIED ids
  react: {
    navbar: '[data-fidelity="navbar"]',
    footer: '[data-fidelity="footer"]'
  },
};

// ------------------------------------------------------------------ anchors
/**
 * Anchors identify content by stable things (visible text, Wix media id, selector) instead of
 * generated class names. Text is matched against rendered text nodes (whitespace-normalized).
 * For React, unspecified `react` matchers fall back to the Wix matcher — fine for text when the
 * copy is identical, but IMAGES need a `react` override (e.g. { selector: 'img[src*="ultrabot"]' }).
 */
export interface Matcher {
  textExact?: string;
  textStartsWith?: string;
  imgSrcIncludes?: string; // matches <img> src/currentSrc, falls back to CSS background-image
  selector?: string;
  scope?: 'main' | 'any'; // 'main' (default) ignores matches inside navbar/footer
}
export interface Anchor {
  kind: 'text' | 'image';
  wix: Matcher;
  react?: Matcher;
}

export const ANCHORS: Record<string, Anchor> = {
  hero: { kind: 'text', wix: { textStartsWith: 'We work to make the greatest technological advances' } },
  heroImage: {
    kind: 'image',
    wix: { imgSrcIncludes: '11062b_79271b7012564ed497d2774a895ab7fdf000' },
    react: { selector: '.hero-image' }
  },
  subtitle: { kind: 'text', wix: { textStartsWith: 'Robotic disinfection solutions' } },
  reemanImage: {
    kind: 'image',
    wix: { imgSrcIncludes: '7498c2_ebe792615c2b41d3835fc2038a64627f' },
    react: { selector: '.intro-reeman-image' }
  },
  pharmarobot: { kind: 'text', wix: { textExact: 'PharmaRobot' }, react: { selector: '.pharmarobot-title' } },
  pharmaImage: {
    kind: 'image',
    wix: { imgSrcIncludes: '7498c2_5ccaff505c0f4fab806bcda66bc3a164' },
    react: { selector: '.pharmarobot-image' }
  },
  ultrabot: { kind: 'text', wix: { textExact: 'UltraBot' }, react: { selector: '.ultrabot-title' } },
  ultrabotImage: {
    kind: 'image',
    wix: { imgSrcIncludes: '7498c2_de1c1e1290ae46199dc03b7d9211ec0b' },
    react: { selector: '.ultrabot-image' }
  },
  ultrabotIntro: {
    kind: 'text',
    wix: { textStartsWith: 'Introducing the UltraBot' },
    react: { selector: '.ultrabot-intro' }
  },
  wideImage: { kind: 'image', wix: { imgSrcIncludes: '7498c2_9866e3f7762646c6be5f033e69c27c7b' } },
  safety: { kind: 'text', wix: { textExact: 'Safety' } },
  autonomousNavigation: { kind: 'text', wix: { textExact: 'Autonomous Navigation' } },
  criticalZoneCoverage: { kind: 'text', wix: { textExact: 'Critical Zone Coverage' } },
  setAndForget: { kind: 'text', wix: { textExact: 'Set and Forget' } },
  innovation: { kind: 'text', wix: { textExact: 'Innovation' } },
  innovationImage: { kind: 'image', wix: { imgSrcIncludes: '7498c2_45c6ceb8135746fba2ba48a1c3ec2767' } },
  whatWeDo: { kind: 'text', wix: { textExact: 'What We Do' } },
  engineersImage: { kind: 'image', wix: { imgSrcIncludes: '11062b_0b96bc1023ad478aa0e11510b179795e' } },
};

/** Logical sections → anchors they contain. The container is found by climbing from the anchors' common ancestor. */
export const SECTIONS: Record<string, string[]> = {
  hero: ['hero', 'subtitle', 'heroImage'],
  intro: ['reemanImage'],
  pharmarobot: ['pharmarobot', 'pharmaImage'],
  ultrabot: ['ultrabot', 'ultrabotImage', 'ultrabotIntro'],
  wideImage: ['wideImage'],
  features: ['safety', 'autonomousNavigation', 'criticalZoneCoverage', 'setAndForget'],
  innovation: ['innovation', 'innovationImage'],
  whatWeDo: ['whatWeDo', 'engineersImage'],
};

/**
 * Authoritative visual regions. These deliberately avoid Wix common-ancestor inference:
 * navbar uses the manually verified chrome selector; content regions use an anchor's exact box.
 */
export const REGIONS = {
  navbar: { rect: { type: 'navbar' as const }, anchors: [] as string[] },
  hero: { rect: { type: 'anchor' as const, anchor: 'heroImage' }, anchors: ['hero', 'subtitle', 'heroImage'] },
  reeman: { rect: { type: 'anchor' as const, anchor: 'reemanImage' }, anchors: ['reemanImage'] },
  pharmarobot: { rect: { type: 'anchor' as const, anchor: 'pharmaImage' }, anchors: ['pharmarobot', 'pharmaImage'] },
  ultrabot: { rect: { type: 'anchor' as const, anchor: 'ultrabotImage' }, anchors: ['ultrabot', 'ultrabotImage', 'ultrabotIntro'] },
  wideImage: { rect: { type: 'anchor' as const, anchor: 'wideImage' }, anchors: ['wideImage'] },
  features: { rect: { type: 'anchorBounds' as const }, anchors: ['safety', 'autonomousNavigation', 'criticalZoneCoverage', 'setAndForget'] },
  innovation: { rect: { type: 'anchor' as const, anchor: 'innovationImage' }, anchors: ['innovation', 'innovationImage'] },
  whatWeDo: { rect: { type: 'anchor' as const, anchor: 'engineersImage' }, anchors: ['whatWeDo', 'engineersImage'] },
} as const;

/** Explicit declaration of regions expected to exist in the current progressive React build. */
export const IMPLEMENTED_REGIONS = ['navbar', 'hero', 'reeman', 'pharmarobot', 'ultrabot'] as const;
export type FidelityMode = 'implemented' | 'strict';

export const REQUIRED_FONTS = [
  { family: 'Poppins', weight: '400', sample: 'We work to make the greatest technological advances' },
  { family: 'Poppins', weight: '700', sample: 'Robotic disinfection solutions for healthcare facilities' },
] as const;

// -------------------------------------------------------------- comparison
/** Roots of the fixture that are compared metric-by-metric. Everything else is reference-only observation. */
export const COMPARED_ROOTS = ['global', 'nav', 'footer', 'sections', 'texts', 'images', 'buttons'];

export interface Rule {
  match: RegExp;
  kind: 'skip' | 'exact' | 'numeric';
  tolerance?: number; // px (numeric rules)
  note?: string;
}

/** First matching rule wins. Anything unmatched: numeric → ±1, non-numeric → exact. No silent loosening. */
export const TOLERANCE_RULES: Rule[] = [
  { match: /\.(src|alt|currentSrc|naturalWidth|naturalHeight|matchCount|wix)(\.|$)/, kind: 'skip', note: 'asset URLs / Wix-only crop info' },
  {
    match: /\.(fontFamily|fontSize|fontWeight|lineHeight|letterSpacing|textAlign|color|textTransform|textShadow|textStroke|opacity|text|objectFit|objectPosition|naturalWidth|naturalHeight|display|position|flexDirection|gridTemplateColumns|justifyContent|alignItems|backgroundColor|backgroundSize|backgroundPosition|lineCount|found)$|^global\.(visibleImageCount|navItemCount|sectionsFound)$/,
    kind: 'exact',
    note: 'typography & discrete values must match exactly',
  },
  { match: /^global\.totalHeight$/, kind: 'numeric', tolerance: 5, note: 'total page height' },
  { match: /^global\.sectionsObservedFound$/, kind: 'skip', note: 'diagnostic LCA observation only' },
  { match: /^sections\.[^.]+\.(height|end)$/, kind: 'numeric', tolerance: 2, note: 'section height' },
  { match: /^texts\.[^.]+\.(x|y|width|height)$/, kind: 'numeric', tolerance: 2, note: 'text position' },
  { match: /\.(x|y|width|height)$/, kind: 'numeric', tolerance: 1 },
  { match: /(margin|padding)(Top|Right|Bottom|Left)$|\.(gap|rowGap|columnGap)$|[rR]adius/, kind: 'numeric', tolerance: 1 },
];

export const PIXEL = {
  threshold: 0.1, // pixelmatch per-pixel colour threshold
  includeAA: true, // count anti-aliased pixels as differences (strict: don't hide layout errors)
  maxMismatchPercent: 1.0, // global; tighten later towards 0.5
  sectionMaxMismatchPercent: 1.0,
};

export const METRIC_DEFINITIONS = {
  coordinates: 'x/y in CSS px relative to the document (rect + scroll offset), device scale factor 1',
  'global.totalHeight': 'document.documentElement.scrollHeight',
  'global.scrollWidth': 'document.documentElement.scrollWidth',
  'sections.<name>': 'bounding box of the container found by climbing from the common ancestor of the section anchors until another section anchor / navbar / footer would be included',
  'texts.<name>': 'Range.getBoundingClientRect() over the matched text node + computed style of its parent element',
  'images.<name>': 'bounding box + computed object-fit/position/radius of the matched <img> (or background element)',
  'nav.items': 'visible links/buttons inside the navbar; gaps = next.x - (prev.x + prev.width)',
  'behaviors / fonts / duplicates / animationsAtLoad': 'reference-only observations, not compared',
};
