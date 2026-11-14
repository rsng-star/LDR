/**
 * Map Configuration & Tile Styles for Tanpilan
 * Single Source of Truth for both Backend CSP (img-src) and Frontend Leaflet Map.
 */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    const exported = factory();
    root.MAP_STYLES = exported.MAP_STYLES;
    root.MAP_TILE_DOMAINS = exported.MAP_TILE_DOMAINS;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  const MAP_STYLES = [
    {
      name: 'Dark Mode',
      iconName: 'moon',
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
      subdomains: 'abcd',
      maxZoom: 19,
      className: '',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'
    },
    {
      name: 'Satelit Nyata',
      iconName: 'satellite',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      subdomains: 'abc',
      maxZoom: 19,
      className: '',
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    },
    {
      name: 'Peta Terang',
      iconName: 'sun',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: 'abc',
      maxZoom: 19,
      className: '',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }
  ];

  // Ekstrak domain tile unik untuk Content Security Policy (CSP img-src)
  const MAP_TILE_DOMAINS = Array.from(new Set(
    MAP_STYLES.map(style => {
      try {
        const cleanUrl = style.url.replace(/\{s\}\./g, '');
        const host = new URL(cleanUrl).hostname;
        if (style.url.includes('{s}')) {
          return `https://*.${host}`;
        }
        return `https://${host}`;
      } catch (e) {
        return null;
      }
    }).filter(Boolean)
  ));

  return { MAP_STYLES, MAP_TILE_DOMAINS };
}));
