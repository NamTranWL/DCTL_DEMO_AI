import { SetMetadata } from '@nestjs/common';

export const SKIP_TRANSFORM_KEY = 'skipTransform';

/**
 * Opt a handler (or whole controller) out of the `{ data }` response envelope,
 * e.g. health checks or file downloads that must keep their own response shape.
 */
export const SkipTransform = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_TRANSFORM_KEY, true);
