import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards for the text size control: it scales the whole app from the root font-size, which only works
// while sizes are in rem. A font size or a height budget in px would stay fixed at "Grande" and
// "Muy grande".
const SRC = join(process.cwd(), 'src');

const sources = (readdirSync(SRC, { recursive: true }) as string[])
  .filter((path) => /\.(ts|scss)$/.test(path) && !path.endsWith('.spec.ts'))
  .map((path) => ({ path, text: readFileSync(join(SRC, path), 'utf-8') }));

function matches(pattern: RegExp): string[] {
  return sources.flatMap(({ path, text }) =>
    [...text.matchAll(pattern)].map((match) => `${path}: ${match[0]}`),
  );
}

describe('text size units', () => {
  it('reads the app sources', () => {
    expect(sources.some(({ path }) => path.endsWith('styles.scss'))).toBe(true);
  });

  it('sets no font size in px', () => {
    expect(matches(/font-size:\s*[\d.]+px/g)).toEqual([]);
  });

  it('measures no screen-height budget in px (it must grow with the text)', () => {
    expect(matches(/(dvh|vh|%)\s*-\s*[\d.]+px/g)).toEqual([]);
  });

  it('scales the larger sizes in % of the browser default and leaves Normal alone', () => {
    const styles = sources.find(({ path }) => path.endsWith('styles.scss'))!.text;

    expect(styles).toMatch(/:root\[data-font-size='large'\] \{\s*font-size: 112\.5%;/);
    expect(styles).toMatch(/:root\[data-font-size='xlarge'\] \{\s*font-size: 125%;/);
    expect(styles).not.toMatch(/^(html|:root)\s*\{[^}]*font-size/m);
  });
});
