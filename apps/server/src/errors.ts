import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { PricingError } from '@dprinting/core';
import { ImageError } from './png';

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new HttpError(400, code, message, details);
export const notFound = (message = 'Ressource introuvable.') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION',
        message: 'Données invalides.',
        details: err.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }
  if (err instanceof PricingError) {
    res.status(409).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof ImageError) {
    res.status(400).json({ error: { code: err.code, message: err.message } });
    return;
  }
  const typed = err as { type?: string; code?: string; message?: string };
  if (typed?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Corps JSON invalide.' } });
    return;
  }
  if (typed?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'Fichier trop volumineux pour ce type d’envoi.' } });
    return;
  }
  if (typed?.code === 'LIMIT_UNEXPECTED_FILE' || typed?.code === 'LIMIT_FILE_COUNT') {
    res.status(400).json({ error: { code: 'UPLOAD', message: 'Envoi de fichier invalide.' } });
    return;
  }
  const message = err instanceof Error ? err.message : 'Erreur interne.';
  if (process.env.NODE_ENV !== 'production') console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: process.env.NODE_ENV === 'production' ? 'Erreur interne.' : message } });
}
