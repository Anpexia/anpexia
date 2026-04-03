import { Response } from 'express';

export function success(res: Response, data: unknown, meta?: unknown) {
  return res.json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
}

export function created(res: Response, data: unknown) {
  return res.status(201).json({
    success: true,
    data,
  });
}

export function noContent(res: Response) {
  return res.status(204).send();
}
