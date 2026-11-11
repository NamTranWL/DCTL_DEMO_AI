import { type ValidationError } from '@nestjs/common';
import { IsInt, IsString, Min } from 'class-validator';
import { AppException } from '../exceptions/app.exception';
import { ErrorCode } from '../exceptions/error-code.enum';
import { createValidationPipe, flattenValidationErrors } from './validation.pipe';

class ProbeDto {
  @IsString({ message: 'Tên phải là chuỗi.' })
  name!: string;

  @IsInt()
  @Min(1, { message: 'Số lượng phải lớn hơn 0.' })
  quantity!: number;
}

describe('flattenValidationErrors', () => {
  it('flattens nested errors into dotted paths', () => {
    const errors: ValidationError[] = [
      {
        property: 'items',
        children: [
          {
            property: '0',
            children: [{ property: 'quantity', constraints: { min: 'too small' }, children: [] }],
          },
        ],
      },
    ];

    expect(flattenValidationErrors(errors)).toEqual([
      { field: 'items.0.quantity', constraints: { min: 'too small' } },
    ]);
  });
});

describe('createValidationPipe', () => {
  const pipe = createValidationPipe();
  const metadata = { type: 'body' as const, metatype: ProbeDto };

  it('transforms a valid payload into a DTO instance', async () => {
    const result: unknown = await pipe.transform({ name: 'Cà chua', quantity: 2 }, metadata);

    expect(result).toBeInstanceOf(ProbeDto);
  });

  it('throws VALIDATION_ERROR listing invalid fields (BVA: quantity 0)', async () => {
    const error: unknown = await pipe
      .transform({ name: 'Cà chua', quantity: 0 }, metadata)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getResponse()).toMatchObject({
      code: ErrorCode.ValidationError,
      details: [{ field: 'quantity', constraints: { min: 'Số lượng phải lớn hơn 0.' } }],
    });
  });

  it('rejects unknown properties such as familyId (BR-06)', async () => {
    const error: unknown = await pipe
      .transform({ name: 'Cà chua', quantity: 1, familyId: 'other-family' }, metadata)
      .catch((e: unknown) => e);

    expect((error as AppException).getResponse()).toMatchObject({
      code: ErrorCode.ValidationError,
      details: [{ field: 'familyId' }],
    });
  });
});
