/**
 * MusiSurf - AlbumThemeExtractor
 * Ambient Edge Border Glow Palette Engine (Desktop Web Lyrics View Only)
 * 
 * Features:
 * 1. Fast, offscreen 48x48 canvas color sampling with black/white/grey filtering.
 * 2. Vibrant 4-color palette generation:
 *    - --glow-primary: dominant vibrant hue
 *    - --glow-secondary: complementary / distinct second tone
 *    - --glow-tertiary: rich shadow-accent tone for smooth gradient falloff
 *    - --glow-quaternary: bright accent highlight
 * 3. Saturation boost (+15%) and lightness clamping (45%-68%) so dark covers stay luminous.
 * 4. High-performance caching by artworkUrl and trackId (0ms on repeat lookups).
 * 5. Robust CORS fallback: direct -> server /api/image-proxy -> deterministic hash fallback.
 * 6. Atomic race-condition guard preventing stale color flashes during rapid track skipping.
 */

(function (global) {
  'use strict';

  class AlbumThemeExtractor {
    constructor() {
      this.cache = new Map();
      this.currentTrackId = null;
      this.activeRequestId = 0;
    }

    /**
     * Convert RGB [0-255] to HSL [h: 0-360, s: 0-1, l: 0-1]
     */
    rgbToHsl(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0, s = 0;
      const l = (max + min) / 2;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      return [h * 360, s, l];
    }

    /**
     * Convert HSL to 'rgb(r, g, b)' string
     */
    hslToRgbString(h, s, l) {
      h = (h % 360 + 360) % 360;
      s = Math.max(0, Math.min(1, s));
      l = Math.max(0, Math.min(1, l));

      const c = (1 - Math.abs(2 * l - 1)) * s;
      const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      const m = l - c / 2;
      let r = 0, g = 0, b = 0;

      if (h < 60) { r = c; g = x; }
      else if (h < 120) { r = x; g = c; }
      else if (h < 180) { g = c; b = x; }
      else if (h < 240) { g = x; b = c; }
      else if (h < 300) { r = x; b = c; }
      else { r = c; b = x; }

      const R = Math.round((r + m) * 255);
      const G = Math.round((g + m) * 255);
      const B = Math.round((b + m) * 255);
      return `rgb(${R}, ${G}, ${B})`;
    }

    /**
     * Calculate relative luminance according to WCAG sRGB
     */
    getRelativeLuminance(r, g, b) {
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    }

    /**
     * Deterministic, curated ambient palette seeded from track artist/title hash.
     * Guaranteed warm, vibrant, and tasteful when offline, local, or CORS-restricted.
     */
    getDeterministicPalette(track) {
      const seed = (track && ((track.artist || '') + ' ' + (track.title || track.id || ''))) || 'MusiSurf Ambient Flow';
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
      }
      const baseHue = Math.abs(hash) % 360;
      return {
        primary: this.hslToRgbString(baseHue, 0.88, 0.56),
        secondary: this.hslToRgbString((baseHue + 42) % 360, 0.84, 0.62),
        tertiary: this.hslToRgbString((baseHue + 195) % 360, 0.76, 0.44),
        quaternary: this.hslToRgbString((baseHue + 85) % 360, 0.82, 0.52)
      };
    }

    /**
     * Extract 4 harmonized colors from canvas ImageData buffer
     */
    extractColorsFromPixels(data) {
      if (!data || data.length === 0) return null;

      const buckets = new Map();

      // Sample every 4th pixel (16 bytes)
      for (let i = 0; i < data.length; i += 16) {
        const a = data[i + 3];
        if (a < 128) continue; // transparent pixel

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const lum = this.getRelativeLuminance(r, g, b);
        if (lum < 0.08 || lum > 0.92) continue; // filter pure black & white

        const [h, s, l] = this.rgbToHsl(r, g, b);
        if (s < 0.20) continue; // filter muddy low-saturation greys

        // Quantize hue into 24 bins (15 degrees each)
        const hueBin = Math.round(h / 15) * 15;
        const weight = (s * 1.6) + (1.0 - Math.abs(l - 0.5) * 1.5);

        if (!buckets.has(hueBin)) {
          buckets.set(hueBin, { hue: h, count: 0, totalWeight: 0, satSum: 0, lumSum: 0 });
        }
        const entry = buckets.get(hueBin);
        entry.count++;
        entry.totalWeight += weight;
        entry.satSum += s;
        entry.lumSum += l;
      }

      if (buckets.size === 0) return null;

      // Rank by vibrancy weight
      const sorted = Array.from(buckets.values()).sort((a, b) => b.totalWeight - a.totalWeight);

      // 1. Primary: most dominant vibrant hue
      const p1 = sorted[0];
      const h1 = p1.hue;
      const s1 = Math.min(1.0, (p1.satSum / p1.count) * 1.15 + 0.05);
      const l1 = Math.max(0.45, Math.min(0.68, p1.lumSum / p1.count));

      // 2. Secondary: distinct hue (>= 35 deg distance from primary)
      const p2 = sorted.find(p => {
        const diff = Math.abs(p.hue - h1);
        return Math.min(diff, 360 - diff) >= 35;
      });
      const h2 = p2 ? p2.hue : (h1 + 42) % 360;
      const s2 = p2 ? Math.min(1.0, (p2.satSum / p2.count) * 1.15 + 0.05) : Math.max(0.72, s1);
      const l2 = p2 ? Math.max(0.48, Math.min(0.70, p2.lumSum / p2.count)) : Math.min(0.70, l1 + 0.10);

      // 3. Tertiary: deep rich shadow-accent tone for smooth gradient falloff
      const p3 = sorted.find(p => {
        const d1 = Math.min(Math.abs(p.hue - h1), 360 - Math.abs(p.hue - h1));
        const d2 = Math.min(Math.abs(p.hue - h2), 360 - Math.abs(p.hue - h2));
        return d1 >= 30 && d2 >= 30;
      });
      const h3 = p3 ? p3.hue : (h1 + 185) % 360;
      const s3 = p3 ? Math.min(1.0, (p3.satSum / p3.count) * 1.10) : 0.75;
      const l3 = p3 ? Math.max(0.38, Math.min(0.55, p3.lumSum / p3.count)) : 0.42;

      // 4. Quaternary: bright accent highlight
      const h4 = (h2 + 45) % 360;
      const s4 = Math.min(1.0, s2 * 1.05);
      const l4 = Math.max(0.50, Math.min(0.66, l2));

      return {
        primary: this.hslToRgbString(h1, s1, l1),
        secondary: this.hslToRgbString(h2, s2, l2),
        tertiary: this.hslToRgbString(h3, s3, l3),
        quaternary: this.hslToRgbString(h4, s4, l4)
      };
    }

    /**
     * Decode image on 48x48 offscreen canvas and extract colors
     */
    extractFromImageSource(src) {
      return new Promise((resolve, reject) => {
        if (typeof document === 'undefined') {
          return reject(new Error('Document not available'));
        }

        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.decoding = 'async';

        let resolved = false;
        const timer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            reject(new Error('Image decode timeout'));
          }
        }, 1500);

        img.onload = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 48;
            canvas.height = 48;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return reject(new Error('Canvas context unavailable'));

            ctx.drawImage(img, 0, 0, 48, 48);
            const data = ctx.getImageData(0, 0, 48, 48).data;
            const palette = this.extractColorsFromPixels(data);
            if (palette) resolve(palette);
            else reject(new Error('No valid colors extracted from pixels'));
          } catch (err) {
            reject(err);
          }
        };

        img.onerror = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          reject(new Error('Image load failed'));
        };

        img.src = src;
      });
    }

    /**
     * Extract or retrieve cached palette for track with multi-stage fallback
     */
    async getThemePalette(track) {
      if (!track) return this.getDeterministicPalette(null);

      const trackId = track.id || track.title || 'unknown';
      const artworkUrl = track.image;
      const cacheKey = artworkUrl || trackId;

      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      if (!artworkUrl || typeof document === 'undefined') {
        const fallback = this.getDeterministicPalette(track);
        this.cache.set(cacheKey, fallback);
        return fallback;
      }

      try {
        // Stage 1: Direct CORS image decode
        const palette = await this.extractFromImageSource(artworkUrl);
        this.cache.set(cacheKey, palette);
        return palette;
      } catch (e1) {
        // Stage 2: Proxied image decode if external CDN blocks canvas read
        if (artworkUrl.startsWith('http')) {
          try {
            const proxied = `/api/image-proxy?url=${encodeURIComponent(artworkUrl)}`;
            const palette = await this.extractFromImageSource(proxied);
            this.cache.set(cacheKey, palette);
            return palette;
          } catch (e2) {}
        }

        // Stage 3: Instant deterministic harmonic palette seeded from track
        const fallback = this.getDeterministicPalette(track);
        this.cache.set(cacheKey, fallback);
        return fallback;
      }
    }

    /**
     * Apply palette smoothly to target DOM element CSS variables with race-condition check
     */
    async applyThemeToEdgeGlow(track, targetEl, expectedTrackId) {
      const reqId = ++this.activeRequestId;
      this.currentTrackId = (track && track.id) || null;

      const palette = await this.getThemePalette(track);

      // Stale response guard: ensure track has not changed while palette was decoding
      if (reqId !== this.activeRequestId) return;
      if (expectedTrackId && this.currentTrackId && expectedTrackId !== this.currentTrackId) return;

      const primaryColor = palette.primary;
      const el = targetEl || (typeof document !== 'undefined' ? document.getElementById('lyrics-edge-glow') : null);
      if (el) {
        // Strictly monochromatic to the song's dominant album color
        el.style.setProperty('--glow-primary', primaryColor);
        el.style.setProperty('--glow-secondary', primaryColor);
        el.style.setProperty('--glow-tertiary', primaryColor);
        el.style.setProperty('--glow-quaternary', primaryColor);
      }
      const lyricsViewEl = typeof document !== 'undefined' ? document.getElementById('lyricsView') : null;
      if (lyricsViewEl) {
        lyricsViewEl.style.setProperty('--glow-primary', primaryColor);
        lyricsViewEl.style.setProperty('--glow-secondary', primaryColor);
        lyricsViewEl.style.setProperty('--glow-tertiary', primaryColor);
        lyricsViewEl.style.setProperty('--glow-quaternary', primaryColor);
      }

      return palette;
    }

    clearCache() {
      this.cache.clear();
    }
  }

  // Export for browser global and CommonJS test environment
  const instance = new AlbumThemeExtractor();
  instance.AlbumThemeExtractor = AlbumThemeExtractor;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = instance;
  }
  if (typeof global !== 'undefined') {
    global.albumThemeExtractor = instance;
    global.AlbumThemeExtractor = AlbumThemeExtractor;
  }
})(typeof window !== 'undefined' ? window : globalThis);
