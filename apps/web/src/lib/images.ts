import { useEffect, useSyncExternalStore } from 'react';
import type { DesignDocument } from '@dprinting/core';

type Entry = { url: string; img?: HTMLImageElement; error?: boolean; promise?: Promise<HTMLImageElement | null> };

const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;

const bump = () => { version++; listeners.forEach(l => l()); };
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

/** Enregistre une URL (upload local ou URL signée renvoyée par l'API). */
export function registerAsset(id: string, url: string): void {
  const existing = cache.get(id);
  if (existing?.url === url && existing.img) return;
  cache.set(id, { url });
}

export function peekImage(id: string): HTMLImageElement | undefined {
  return cache.get(id)?.img;
}

export function loadImage(id: string, url?: string): Promise<HTMLImageElement | null> {
  if (url) registerAsset(id, url);
  const entry = cache.get(id);
  if (!entry) return Promise.resolve(null);
  if (entry.img) return Promise.resolve(entry.img);
  if (entry.error) return Promise.resolve(null);
  if (entry.promise) return entry.promise;

  entry.promise = new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => { entry.img = img; bump(); resolve(img); };
    img.onerror = () => { entry.error = true; bump(); resolve(null); };
    img.src = entry.url;
  });
  return entry.promise;
}

export function useImageVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

/** Charge toutes les images référencées par un document et force un rendu quand elles arrivent. */
export function useDesignImages(document: DesignDocument, urls: Record<string, string>): number {
  const ids: string[] = [];
  const urlKey = JSON.stringify(urls);
  for (const zone of Object.values(document.zones)) {
    for (const layer of zone.layers) if (layer.type === 'image' && !ids.includes(layer.assetId)) ids.push(layer.assetId);
  }
  const key = ids.join(',');
  useEffect(() => {
    for (const id of ids) {
      const url = urls[id];
      if (url) registerAsset(id, url);
      void loadImage(id, url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, urlKey]);
  return useImageVersion();
}

/** Force le chargement avant un export (aucun rendu partiel autorisé). */
export async function ensureDesignImages(document: DesignDocument, urls: Record<string, string>): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  for (const zone of Object.values(document.zones)) {
    for (const layer of zone.layers) {
      if (layer.type === 'image') jobs.push(loadImage(layer.assetId, urls[layer.assetId]));
    }
  }
  await Promise.all(jobs);
}
