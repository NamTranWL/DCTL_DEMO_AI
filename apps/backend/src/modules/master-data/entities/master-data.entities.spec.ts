import { ApprovalStatus } from '@dctl/shared';
import { InvalidStateTransitionException } from '../../../common/exceptions/domain.exceptions';
import { Food } from './food.entity';
import { Recipe } from './recipe.entity';
import { Unit } from './unit.entity';

function foodIn(status: ApprovalStatus, createdByFamilyId: string | null = 'family-a'): Food {
  const food = new Food();
  food.approvalStatus = status;
  food.createdByFamilyId = createdByFamilyId;
  return food;
}

describe('Food approval (PENDING → APPROVED | REJECTED) — BR-08', () => {
  it('approves and rejects from PENDING', () => {
    const approved = foodIn(ApprovalStatus.Pending);
    approved.approve();
    const rejected = foodIn(ApprovalStatus.Pending);
    rejected.reject();

    expect(approved.approvalStatus).toBe(ApprovalStatus.Approved);
    expect(rejected.approvalStatus).toBe(ApprovalStatus.Rejected);
  });

  it.each([ApprovalStatus.Approved, ApprovalStatus.Rejected])('cannot change once %s', (status) => {
    expect(() => foodIn(status).approve()).toThrow(InvalidStateTransitionException);
    expect(() => foodIn(status).reject()).toThrow(InvalidStateTransitionException);
  });
});

describe('Food.isVisibleTo — BR-04', () => {
  it('APPROVED foods are visible to everyone', () => {
    expect(foodIn(ApprovalStatus.Approved, null).isVisibleTo('family-b')).toBe(true);
  });

  it('PENDING foods are visible only to the family that created them', () => {
    const food = foodIn(ApprovalStatus.Pending, 'family-a');

    expect(food.isVisibleTo('family-a')).toBe(true);
    expect(food.isVisibleTo('family-b')).toBe(false);
    expect(food.isVisibleTo(null)).toBe(false);
  });

  it('REJECTED foods are hidden, even from their creator', () => {
    expect(foodIn(ApprovalStatus.Rejected, 'family-a').isVisibleTo('family-a')).toBe(false);
  });
});

describe('Recipe approval — BR-08', () => {
  it('becomes public only after approval', () => {
    const recipe = new Recipe();
    recipe.approvalStatus = ApprovalStatus.Pending;
    expect(recipe.isPublic()).toBe(false);

    recipe.approve();
    expect(recipe.isPublic()).toBe(true);
    expect(() => recipe.reject()).toThrow(InvalidStateTransitionException);
  });
});

describe('Unit groups — BR-04', () => {
  function unit(id: string, baseUnitId: string | null): Unit {
    const u = new Unit();
    u.id = id;
    u.baseUnitId = baseUnitId;
    return u;
  }
  const g = unit('g', null);
  const kg = unit('kg', 'g');
  const ml = unit('ml', null);
  const qua = unit('qua', null);

  it('g ↔ kg are convertible (same group)', () => {
    expect(kg.isConvertibleTo(g)).toBe(true);
    expect(g.isConvertibleTo(kg)).toBe(true);
  });

  it('g ↔ ml and g ↔ quả are not convertible', () => {
    expect(g.isConvertibleTo(ml)).toBe(false);
    expect(kg.isConvertibleTo(qua)).toBe(false);
  });
});
