/**
 * Which SlideX this is. package.json holds the number and nothing else does.
 */
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

export const NAME = 'SlideX';
export const VERSION = pkg.version;
