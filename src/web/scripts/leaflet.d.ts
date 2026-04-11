/**
 * Minimal Leaflet type declarations for CDN usage.
 */

declare module "leaflet" {
  export interface LatLngExpression {
    lat: number;
    lng: number;
  }

  export interface MapOptions {
    center?: [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    maxBounds?: [[number, number], [number, number]];
    maxBoundsViscosity?: number;
  }

  export interface TileLayerOptions {
    attribution?: string;
  }

  export interface DivIconOptions {
    className?: string;
    html?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
  }

  export interface TooltipOptions {
    permanent?: boolean;
    direction?: string;
    offset?: [number, number];
  }

  export interface PopupOptions {
    maxWidth?: number;
  }

  export interface Map {
    setView(center: [number, number], zoom: number): Map;
    fitBounds(bounds: LatLngBounds, options?: object): Map;
    addLayer(layer: Layer): Map;
    removeLayer(layer: Layer): Map;
  }

  export interface Layer {
    addTo(map: Map): Layer;
    remove(): Layer;
  }

  export interface Marker extends Layer {
    bindPopup(content: string, options?: PopupOptions): Marker;
    bindTooltip(content: string, options?: TooltipOptions): Marker;
    openPopup(): Marker;
    on(event: string, handler: () => void): Marker;
  }

  export interface TileLayer extends Layer {}

  export interface LatLngBounds {
    pad(bufferRatio: number): LatLngBounds;
  }

  export interface FeatureGroup extends Layer {
    getBounds(): LatLngBounds;
  }

  export interface DivIcon {}

  export function map(element: string | HTMLElement, options?: MapOptions): Map;
  export function tileLayer(urlTemplate: string, options?: TileLayerOptions): TileLayer;
  export function marker(latlng: [number, number], options?: { icon?: DivIcon }): Marker;
  export function divIcon(options: DivIconOptions): DivIcon;
  export function featureGroup(layers: Layer[]): FeatureGroup;
}

declare global {
  const L: typeof import("leaflet");
}
