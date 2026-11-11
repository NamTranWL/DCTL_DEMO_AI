import { SnakeNamingStrategy, toSnakeCase } from './snake-naming.strategy';

describe('toSnakeCase', () => {
  it.each([
    ['familyId', 'family_id'],
    ['expiryDate', 'expiry_date'],
    ['createdByFamilyId', 'created_by_family_id'],
    ['isPurchased', 'is_purchased'],
    ['factorToBase', 'factor_to_base'],
    ['ShoppingListItem', 'shopping_list_item'],
    ['id', 'id'],
  ])('%s → %s', (input, expected) => {
    expect(toSnakeCase(input)).toBe(expected);
  });
});

describe('SnakeNamingStrategy', () => {
  const strategy = new SnakeNamingStrategy();

  it('uses snake_case for columns unless a name is given explicitly', () => {
    expect(strategy.columnName('expiryDate', undefined, [])).toBe('expiry_date');
    expect(strategy.columnName('expiryDate', 'exp', [])).toBe('exp');
  });

  it('builds join column names like shopping_list_id', () => {
    expect(strategy.joinColumnName('shoppingList', 'id')).toBe('shopping_list_id');
  });

  it('keeps an explicit table name', () => {
    expect(strategy.tableName('FridgeItem', 'fridge_items')).toBe('fridge_items');
    expect(strategy.tableName('FridgeItem', undefined)).toBe('fridge_item');
  });
});
