import { type CallHandler, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { SKIP_TRANSFORM_KEY } from '../decorators/skip-transform.decorator';
import { Paged, TransformInterceptor } from './transform.interceptor';

function createContext(skip: boolean): { context: ExecutionContext; reflector: Reflector } {
  const handler = (): void => undefined;
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: unknown) => (key === SKIP_TRANSFORM_KEY ? skip : undefined));
  const context = {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => class Dummy {},
  } as unknown as ExecutionContext;
  return { context, reflector };
}

const handlerReturning = (value: unknown): CallHandler => ({ handle: () => of(value) });

describe('TransformInterceptor', () => {
  it('wraps the handler result as { data }', async () => {
    const { context, reflector } = createContext(false);
    const interceptor = new TransformInterceptor(reflector);

    const result = await firstValueFrom(
      interceptor.intercept(context, handlerReturning({ id: 1 })),
    );

    expect(result).toEqual({ data: { id: 1 } });
  });

  it('turns undefined into { data: null }', async () => {
    const { context, reflector } = createContext(false);
    const interceptor = new TransformInterceptor(reflector);

    const result = await firstValueFrom(
      interceptor.intercept(context, handlerReturning(undefined)),
    );

    expect(result).toEqual({ data: null });
  });

  it('splits Paged into data + meta', async () => {
    const { context, reflector } = createContext(false);
    const interceptor = new TransformInterceptor(reflector);
    const paged = new Paged([1, 2], { total: 10, page: 1, pageSize: 2 });

    const result = await firstValueFrom(interceptor.intercept(context, handlerReturning(paged)));

    expect(result).toEqual({ data: [1, 2], meta: { total: 10, page: 1, pageSize: 2 } });
  });

  it('returns the raw body when @SkipTransform() is set', async () => {
    const { context, reflector } = createContext(true);
    const interceptor = new TransformInterceptor(reflector);

    const result = await firstValueFrom(
      interceptor.intercept(context, handlerReturning({ status: 'ok' })),
    );

    expect(result).toEqual({ status: 'ok' });
  });
});
