import { ApprovalStatus } from '@dctl/shared';
import { type EventEmitter2 } from '@nestjs/event-emitter';
import { QueryFailedError } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { type CategoriesService } from './categories.service';
import { Food } from './entities/food.entity';
import { FOOD_APPROVED, FOOD_REJECTED, FOOD_SUBMITTED } from './events';
import { FoodsService } from './foods.service';
import { type FoodRepository } from './repositories/food.repository';

function food(overrides: Partial<Food>): Food {
  return Object.assign(new Food(), {
    id: 'f1',
    name: 'Rau dền',
    categoryId: 'cat-1',
    approvalStatus: ApprovalStatus.Approved,
    createdByFamilyId: null,
    ...overrides,
  });
}

function setup(existing: Food | null = null) {
  const repo = {
    findByName: jest.fn(() => Promise.resolve(existing)),
    create: (data: Partial<Food>) => Object.assign(new Food(), data),
    save: jest.fn((f: Food) => Promise.resolve(Object.assign(f, { id: f.id ?? 'new-food' }))),
    findOne: jest.fn(() => Promise.resolve(existing)),
    delete: jest.fn(() => Promise.resolve({ affected: 1 })),
    countUsages: jest.fn(() =>
      Promise.resolve({ fridgeItems: 0, shoppingListItems: 0, recipeIngredients: 0 }),
    ),
    searchVisible: jest.fn(() => Promise.resolve([])),
  };
  const categories = { exists: jest.fn(() => Promise.resolve(true)) };
  const events = { emit: jest.fn() };
  const service = new FoodsService(
    repo as unknown as FoodRepository,
    categories as unknown as CategoriesService,
    events as unknown as EventEmitter2,
  );
  return { service, repo, categories, events };
}

const viewerA = { userId: 'u-a', familyId: 'fam-a' };
const dto = { name: 'Rau dền', categoryId: 'cat-1' };

async function expectCode(promise: Promise<unknown>, code: ErrorCode): Promise<void> {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).code).toBe(code);
}

describe('FoodsService.contribute — BR-04, BR-08 (decision B5)', () => {
  it('creates a PENDING food owned by the family and emits FOOD_SUBMITTED', async () => {
    const { service, events } = setup(null);

    const { food: created, created: isNew } = await service.contribute(viewerA, dto);

    expect(isNew).toBe(true);
    expect(created).toMatchObject({
      approvalStatus: ApprovalStatus.Pending,
      createdByFamilyId: 'fam-a',
    });
    expect(events.emit).toHaveBeenCalledWith(FOOD_SUBMITTED, expect.anything());
  });

  it('returns an existing APPROVED food instead of duplicating it', async () => {
    const { service, repo } = setup(food({ approvalStatus: ApprovalStatus.Approved }));

    await expect(service.contribute(viewerA, dto)).resolves.toMatchObject({ created: false });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('returns the family’s own PENDING food', async () => {
    const { service } = setup(
      food({ approvalStatus: ApprovalStatus.Pending, createdByFamilyId: 'fam-a' }),
    );

    await expect(service.contribute(viewerA, dto)).resolves.toMatchObject({ created: false });
  });

  it('PENDING of ANOTHER family → 409 FOOD_PENDING_REVIEW (not visible, BR-08)', async () => {
    const { service } = setup(
      food({ approvalStatus: ApprovalStatus.Pending, createdByFamilyId: 'fam-b' }),
    );

    await expectCode(service.contribute(viewerA, dto), ErrorCode.FoodPendingReview);
  });

  it('REJECTED name → 409 FOOD_REJECTED', async () => {
    const { service } = setup(food({ approvalStatus: ApprovalStatus.Rejected }));

    await expectCode(service.contribute(viewerA, dto), ErrorCode.FoodRejected);
  });

  it('unknown category → VALIDATION_ERROR', async () => {
    const { service, categories } = setup(null);
    categories.exists.mockResolvedValue(false);

    await expectCode(service.contribute(viewerA, dto), ErrorCode.ValidationError);
  });

  it('a concurrent insert of the same name is resolved with the same rules', async () => {
    const { service, repo } = setup(null);
    repo.save.mockRejectedValueOnce(
      new QueryFailedError('INSERT', [], {
        code: '23505',
        constraint: 'uq_foods_name',
      } as unknown as Error),
    );
    repo.findByName
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        food({ approvalStatus: ApprovalStatus.Pending, createdByFamilyId: 'fam-a' }),
      );

    await expect(service.contribute(viewerA, dto)).resolves.toMatchObject({ created: false });
  });
});

describe('FoodsService.search', () => {
  it('does not query for a blank key', async () => {
    const { service, repo } = setup();

    await expect(service.search('fam-a', { q: '   ', limit: 10 })).resolves.toEqual([]);
    expect(repo.searchVisible).not.toHaveBeenCalled();
  });

  it('searches with the accent-free key and the caller’s family', async () => {
    const { service, repo } = setup();

    await service.search('fam-a', { q: 'Thịt BA', limit: 5 });

    expect(repo.searchVisible).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'thit ba', familyId: 'fam-a', limit: 5 }),
    );
  });
});

describe('FoodsService moderation — UC-ADM-03', () => {
  it('approve: PENDING → APPROVED and emits FOOD_APPROVED', async () => {
    const pending = food({ approvalStatus: ApprovalStatus.Pending, createdByFamilyId: 'fam-a' });
    const { service, events } = setup(pending);

    await service.approve('admin', 'f1');

    expect(pending.approvalStatus).toBe(ApprovalStatus.Approved);
    expect(events.emit).toHaveBeenCalledWith(FOOD_APPROVED, expect.anything());
  });

  it('reject keeps the reason in the event', async () => {
    const pending = food({ approvalStatus: ApprovalStatus.Pending });
    const { service, events } = setup(pending);

    await service.reject('admin', 'f1', 'Trùng tên');

    expect(events.emit).toHaveBeenCalledWith(
      FOOD_REJECTED,
      expect.objectContaining({ reason: 'Trùng tên' }),
    );
  });

  it('cannot approve twice', async () => {
    const { service } = setup(food({ approvalStatus: ApprovalStatus.Approved }));

    await expectCode(service.approve('admin', 'f1'), ErrorCode.InvalidStateTransition);
  });
});

describe('FoodsService.remove (decision B5: blocked while in use)', () => {
  it('refuses to delete a food used anywhere, reporting where', async () => {
    const { service, repo } = setup(food({}));
    repo.countUsages.mockResolvedValue({
      fridgeItems: 2,
      shoppingListItems: 0,
      recipeIngredients: 1,
    });

    const error: unknown = await service.remove('f1').catch((e: unknown) => e);

    expect((error as AppException).code).toBe(ErrorCode.FoodInUse);
    expect((error as AppException).details).toMatchObject({ fridgeItems: 2, recipeIngredients: 1 });
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('deletes an unused food', async () => {
    const { service, repo } = setup(food({}));

    await service.remove('f1');

    expect(repo.delete).toHaveBeenCalledWith({ id: 'f1' });
  });
});
