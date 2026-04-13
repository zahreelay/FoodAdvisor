/**
 * Minimal Leaflet type declarations for CDN usage.
 */

declare module "leaflet" {
  export interface LatLngExpression {
    lat: number;
    lng: number;
  }

  export type LatLngBoundsExpression =
    | LatLngBounds
    | [[number, number], [number, number]]
    | [number, number][];

  export interface MapOptions {
    center?: [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    maxBounds?: [[number, number], [number, number]];
    maxBoundsViscosity?: number;
    zoomControl?: boolean;
  }

  export interface TileLayerOptions {
    attribution?: string;
    subdomains?: string;
    maxZoom?: number;
  }

  export interface DivIconOptions {
    className?: string;
    html?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
    popupAnchor?: [number, number];
  }

  export interface MarkerOptions {
    icon?: DivIcon;
    zIndexOffset?: number;
  }

  export interface TooltipOptions {
    permanent?: boolean;
    direction?: string;
    offset?: [number, number];
  }

  export interface PopupOptions {
    maxWidth?: number;
  }

  export interface FitBoundsOptions {
    padding?: [number, number];
    maxZoom?: number;
  }

  export interface ZoomControlOptions {
    position?: string;
  }

  export interface Map {
    setView(center: [number, number], zoom: number): Map;
    flyTo(center: [number, number], zoom: number, options?: object): Map;
    fitBounds(bounds: LatLngBoundsExpression, options?: FitBoundsOptions): Map;
    addLayer(layer: Layer): Map;
    removeLayer(layer: Layer): Map;
  }

  export interface Layer {
    addTo(map: Map): this;
    remove(): this;
  }

  export interface Marker extends Layer {
    bindPopup(content: string, options?: PopupOptions): this;
    bindTooltip(content: string, options?: TooltipOptions): this;
    openPopup(): this;
    on(event: string, handler: () => void): this;
  }

  export interface TileLayer extends Layer {}

  export interface LatLngBounds {
    pad(bufferRatio: number): LatLngBounds;
  }

  export interface FeatureGroup extends Layer {
    getBounds(): LatLngBounds;
  }

  export interface DivIcon {}

  export interface Control {
    addTo(map: Map): this;
  }

  export namespace control {
    function zoom(options?: ZoomControlOptions): Control;
  }

  export namespace Control {
    function extend(props: object): new () => Control;
  }

  export namespace DomUtil {
    function create(tagName: string, className?: string): HTMLElement;
  }

  export namespace DomEvent {
    function disableClickPropagation(el: HTMLElement): void;
  }

  export function map(element: string | HTMLElement, options?: MapOptions): Map;
  export function tileLayer(urlTemplate: string, options?: TileLayerOptions): TileLayer;
  export function marker(latlng: [number, number], options?: MarkerOptions): Marker;
  export function divIcon(options: DivIconOptions): DivIcon;
  export function featureGroup(layers: Layer[]): FeatureGroup;
}

declare global {
  const L: typeof import("leaflet");
}
