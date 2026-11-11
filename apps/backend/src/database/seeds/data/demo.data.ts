import { PeriodType, StorageLocation, UserRole } from '@dctl/shared';

/**
 * Demo accounts and family data — DEVELOPMENT ONLY.
 * The seed runner refuses to run in production, so these known passwords never ship.
 */

export interface UserSeed {
  username: string;
  email: string;
  password: string;
  role: UserRole;
}

export const ADMIN_SEED: UserSeed = {
  username: 'admin',
  email: 'admin@dctl.local',
  password: 'Admin@123',
  role: UserRole.Admin,
};

export const HOMEMAKER_SEED: UserSeed = {
  username: 'noitro',
  email: 'noitro@dctl.local',
  password: 'Demo@123',
  role: UserRole.Homemaker,
};

export const MEMBER_SEEDS: readonly UserSeed[] = [
  {
    username: 'thanhvien1',
    email: 'thanhvien1@dctl.local',
    password: 'Demo@123',
    role: UserRole.Member,
  },
  {
    username: 'thanhvien2',
    email: 'thanhvien2@dctl.local',
    password: 'Demo@123',
    role: UserRole.Member,
  },
];

export const DEMO_FAMILY_NAME = 'Gia đình Demo';

/** Fixed invite code of the demo family so testers can try "join family". */
export const DEMO_FAMILY_INVITE_CODE = 'DEMO2026';

export interface DietaryProfileSeed {
  username: string;
  /** Food names (resolved to foodId) the user is allergic to — BR-07 test data. */
  allergies: string[];
  tastePreferences: string[];
  nutritionGoal: string | null;
}

export const DIETARY_PROFILE_SEEDS: readonly DietaryProfileSeed[] = [
  {
    username: 'noitro',
    allergies: [],
    tastePreferences: ['ít cay'],
    nutritionGoal: 'Cân bằng dinh dưỡng',
  },
  {
    username: 'thanhvien1',
    allergies: ['Tôm'],
    tastePreferences: [],
    nutritionGoal: null,
  },
  {
    username: 'thanhvien2',
    allergies: [],
    tastePreferences: ['ít ngọt'],
    nutritionGoal: 'Giảm tinh bột',
  },
];

export interface FridgeItemSeed {
  /** Stable key used to derive the seed id. */
  key: string;
  food: string;
  quantity: number;
  unit: string;
  /** Days from today to expiry_date (negative = already expired). */
  expiresInDays: number;
  location: StorageLocation;
  price?: number;
}

/**
 * Demo fridge. The first five rows cover the BR-01 boundary table (§13):
 * 4 days → no reminder; 3 and 1 → expiring soon; 0 and −1 → expired.
 */
export const FRIDGE_ITEM_SEEDS: readonly FridgeItemSeed[] = [
  {
    key: 'br01-plus-4',
    food: 'Cà chua',
    quantity: 4,
    unit: 'quả',
    expiresInDays: 4,
    location: StorageLocation.Fridge,
    price: 20000,
  },
  {
    key: 'br01-plus-3',
    food: 'Thịt ba chỉ',
    quantity: 500,
    unit: 'g',
    expiresInDays: 3,
    location: StorageLocation.Fridge,
    price: 75000,
  },
  {
    key: 'br01-plus-1',
    food: 'Rau muống',
    quantity: 1,
    unit: 'bó',
    expiresInDays: 1,
    location: StorageLocation.Fridge,
    price: 10000,
  },
  {
    key: 'br01-zero',
    food: 'Sữa tươi',
    quantity: 1000,
    unit: 'ml',
    expiresInDays: 0,
    location: StorageLocation.Fridge,
    price: 32000,
  },
  {
    key: 'br01-minus-1',
    food: 'Đậu phụ',
    quantity: 4,
    unit: 'miếng',
    expiresInDays: -1,
    location: StorageLocation.Fridge,
    price: 12000,
  },
  {
    key: 'eggs',
    food: 'Trứng gà',
    quantity: 10,
    unit: 'quả',
    expiresInDays: 15,
    location: StorageLocation.Fridge,
    price: 35000,
  },
  {
    key: 'beef',
    food: 'Thịt bò',
    quantity: 300,
    unit: 'g',
    expiresInDays: 30,
    location: StorageLocation.Freezer,
    price: 90000,
  },
  {
    key: 'shrimp',
    food: 'Tôm',
    quantity: 400,
    unit: 'g',
    expiresInDays: 20,
    location: StorageLocation.Freezer,
    price: 120000,
  },
  {
    key: 'scallion',
    food: 'Hành lá',
    quantity: 5,
    unit: 'cây',
    expiresInDays: 5,
    location: StorageLocation.Fridge,
  },
  {
    key: 'garlic',
    food: 'Tỏi',
    quantity: 10,
    unit: 'tép',
    expiresInDays: 20,
    location: StorageLocation.Pantry,
  },
  {
    key: 'rice',
    food: 'Gạo',
    quantity: 5,
    unit: 'kg',
    expiresInDays: 180,
    location: StorageLocation.Pantry,
    price: 110000,
  },
  {
    key: 'fish-sauce',
    food: 'Nước mắm',
    quantity: 500,
    unit: 'ml',
    expiresInDays: 300,
    location: StorageLocation.Pantry,
    price: 45000,
  },
  {
    key: 'cooking-oil',
    food: 'Dầu ăn',
    quantity: 1,
    unit: 'l',
    expiresInDays: 300,
    location: StorageLocation.Pantry,
    price: 55000,
  },
];

/**
 * User contributions waiting for moderation (UC-ADM-03, BR-08): a new food name proposed by
 * the demo family and a recipe contributed by thanhvien2 that uses it.
 */
export const DEMO_PENDING_FOOD = { name: 'Rau dền', category: 'Rau lá' } as const;

export const DEMO_PENDING_RECIPE = {
  name: 'Canh rau dền tôm',
  contributor: 'thanhvien2',
  servings: 3,
  steps: [
    'Rau dền nhặt lấy ngọn non, rửa sạch.',
    'Tôm bóc vỏ, băm nhỏ, xào sơ với hành tím.',
    'Đổ 800 ml nước, đun sôi rồi cho rau dền vào nấu 3 phút, nêm hạt nêm.',
  ],
  ingredients: [
    { food: 'Rau dền', quantity: 1, unit: 'bó' },
    { food: 'Tôm', quantity: 150, unit: 'g' },
    { food: 'Hành tím', quantity: 1, unit: 'củ' },
    { food: 'Hạt nêm', quantity: 1, unit: 'thìa cà phê' },
  ],
} as const;

export interface ShoppingItemSeed {
  key: string;
  /** Food name from master data, or null for a free-text item (food_id NULL — §11). */
  food: string | null;
  itemName: string;
  category: string;
  quantity: number;
  unit: string;
  assignee?: string;
}

export const DEMO_SHOPPING_LIST = {
  key: 'demo-list-today',
  periodType: PeriodType.Day,
  items: [
    {
      key: 'fish',
      food: 'Cá lóc',
      itemName: 'Cá lóc',
      category: 'Hải sản',
      quantity: 500,
      unit: 'g',
      assignee: 'thanhvien1',
    },
    {
      key: 'pineapple',
      food: 'Dứa',
      itemName: 'Dứa',
      category: 'Trái cây',
      quantity: 1,
      unit: 'quả',
    },
    {
      key: 'sprouts',
      food: 'Giá đỗ',
      itemName: 'Giá đỗ',
      category: 'Rau lá',
      quantity: 200,
      unit: 'g',
      assignee: 'thanhvien2',
    },
    { key: 'tamarind', food: 'Me', itemName: 'Me', category: 'Gia vị', quantity: 50, unit: 'g' },
    {
      key: 'free-text',
      food: null,
      itemName: 'Bún tươi',
      category: 'Ngũ cốc và đồ khô',
      quantity: 500,
      unit: 'g',
    },
  ] satisfies ShoppingItemSeed[],
};
