import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync('public/map-tool/js/renderer.js', 'utf8');
const Renderer = runInNewContext(`${source}\nMapRenderer`);
const entries = (type: string, hybrid = false): { text: string; url: string }[] =>
  Renderer.prototype.attributionEntries.call({ _satelliteIsHybrid: hybrid }, type);

describe('map source attribution', () => {
  it('credits Natural Earth for the bundled minimal map', () => {
    expect(entries('minimal').map(e => e.text)).toEqual(['Natural Earth']);
  });
  it('credits OpenStreetMap contributors and OpenMapTiles for vector tiles', () => {
    expect(entries('liberty')).toContainEqual({ text: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' });
    expect(entries('liberty').map(e => e.text)).toContain('© OpenMapTiles');
  });
  it('credits NASA for satellite imagery', () => {
    expect(entries('satellite').map(e => e.text)).toEqual(['NASA Blue Marble / GIBS', 'Natural Earth']);
  });
  it('retains vector data credits when satellite uses vector labels', () => {
    expect(entries('satellite', true).map(e => e.text)).toContain('© OpenStreetMap contributors');
    expect(entries('satellite', true).map(e => e.text)).toContain('NASA Blue Marble / GIBS');
  });
});