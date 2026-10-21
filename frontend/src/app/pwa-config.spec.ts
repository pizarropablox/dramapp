import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards for the PWA setup: totals and sales must always come from the network, never from the service
// worker's cache, and the manifest must point at icons that exist.
const FRONTEND = join(process.cwd());

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(FRONTEND, path), 'utf-8')) as T;
}

interface NgswConfig {
  assetGroups: { resources: { files?: string[]; urls?: string[] } }[];
  dataGroups?: unknown[];
  navigationUrls: string[];
}

interface Manifest {
  name: string;
  short_name: string;
  display: string;
  start_url: string;
  icons: { src: string; sizes: string; purpose: string }[];
}

describe('service worker config (ngsw-config.json)', () => {
  const config = readJson<NgswConfig>('ngsw-config.json');

  it('caches no API answer: no dataGroups at all', () => {
    expect(config.dataGroups ?? []).toEqual([]);
  });

  it('never lists /api or /actuator among the cached assets', () => {
    const patterns = config.assetGroups.flatMap((group) => [
      ...(group.resources.files ?? []),
      ...(group.resources.urls ?? []),
    ]);

    expect(patterns.filter((pattern) => /\/(api|actuator)\b/.test(pattern))).toEqual([]);
  });

  it('never answers a navigation to /api or /actuator with the cached index.html', () => {
    expect(config.navigationUrls).toContain('!/api/**');
    expect(config.navigationUrls).toContain('!/actuator/**');
  });
});

describe('web app manifest', () => {
  const manifest = readJson<Manifest>('public/manifest.webmanifest');

  it('installs as DRAMApp, full screen, from the sale screen', () => {
    expect(manifest.name).toBe('DRAMApp');
    expect(manifest.short_name).toBe('DRAMApp');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
  });

  it('has the sizes Android asks for, plus maskable ones', () => {
    const any = manifest.icons.filter((icon) => icon.purpose === 'any').map((icon) => icon.sizes);
    const maskable = manifest.icons
      .filter((icon) => icon.purpose === 'maskable')
      .map((icon) => icon.sizes);

    expect(any).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(maskable).toEqual(['192x192', '512x512']);
  });

  it('points only at icons that exist', () => {
    const missing = manifest.icons
      .map((icon) => join('public', icon.src))
      .filter((path) => !existsSync(join(FRONTEND, path)));

    expect(missing).toEqual([]);
  });

  it('has the iPhone home screen icon that index.html links', () => {
    const index = readFileSync(join(FRONTEND, 'src/index.html'), 'utf-8');

    expect(index).toContain('href="icons/apple-touch-icon.png"');
    expect(existsSync(join(FRONTEND, 'public/icons/apple-touch-icon.png'))).toBe(true);
    expect(index).toContain(
      'name="apple-mobile-web-app-status-bar-style" content="black-translucent"',
    );
  });
});
