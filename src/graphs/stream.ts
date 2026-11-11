import { createPlotStream } from '@tweakpad/ui/widgets';
import type { StreamFactory } from './graph-model.js';

/** Index streams: one synchronized frame per sample, as `<tp-plot mode="push">` requires. */
export const createIndexStream: StreamFactory = (seriesIds, capacity) =>
  createPlotStream({ seriesIds, capacity, xMode: 'index' });
