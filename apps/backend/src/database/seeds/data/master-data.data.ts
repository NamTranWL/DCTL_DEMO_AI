/**
 * Reference data (master data) for development and demo.
 * Food names are already normalized (trimmed, single spaces, sentence case) — BR-04.
 * Shelf-life defaults are conservative household guidelines, editable by Admin (FR-25).
 */

export interface CategorySeed {
  name: string;
  storageAdvice: string;
  defaultShelfLifeDays: number;
}

export interface UnitSeed {
  symbol: string;
  name: string;
  /** Symbol of the base unit of the same group; omitted for base units. */
  base?: string;
  factorToBase?: number;
}

export interface FoodSeed {
  name: string;
  category: string;
}

export interface RecipeIngredientSeed {
  food: string;
  quantity: number;
  unit: string;
}

export interface RecipeSeed {
  name: string;
  servings: number;
  steps: string[];
  ingredients: RecipeIngredientSeed[];
}

export const CATEGORY_SEEDS: readonly CategorySeed[] = [
  {
    name: 'Rau lá',
    storageAdvice: 'Nhặt bỏ lá úa, bọc giấy thấm hoặc túi có lỗ, để ngăn mát; dùng trong 2–3 ngày.',
    defaultShelfLifeDays: 3,
  },
  {
    name: 'Củ quả',
    storageAdvice: 'Để nơi khô thoáng hoặc ngăn rau củ; cà chua chín, ớt, hành lá nên để ngăn mát.',
    defaultShelfLifeDays: 7,
  },
  {
    name: 'Trái cây',
    storageAdvice:
      'Trái cây đã chín để ngăn mát; chuối, xoài chưa chín để ngoài cho chín tự nhiên.',
    defaultShelfLifeDays: 5,
  },
  {
    name: 'Thịt',
    storageAdvice:
      'Chia phần vừa nấu, bọc kín. Ngăn mát dùng trong 1–2 ngày; ngăn đá dùng được đến 3 tháng.',
    defaultShelfLifeDays: 2,
  },
  {
    name: 'Hải sản',
    storageAdvice:
      'Rửa sạch, để ráo, bọc kín. Ngăn mát nên dùng trong ngày; ngăn đá dùng được đến 2 tháng.',
    defaultShelfLifeDays: 1,
  },
  {
    name: 'Trứng',
    storageAdvice: 'Để ngăn mát, đầu tròn hướng lên; không rửa trứng trước khi cất.',
    defaultShelfLifeDays: 21,
  },
  {
    name: 'Sữa và chế phẩm',
    storageAdvice: 'Luôn để ngăn mát, đóng kín sau khi mở; ưu tiên hạn in trên bao bì.',
    defaultShelfLifeDays: 7,
  },
  {
    name: 'Đậu phụ và nấm',
    storageAdvice: 'Đậu phụ ngâm nước sạch, thay nước hằng ngày; nấm bọc giấy, để ngăn mát.',
    defaultShelfLifeDays: 3,
  },
  {
    name: 'Ngũ cốc và đồ khô',
    storageAdvice: 'Đựng hộp kín, để nơi khô ráo, tránh ẩm mốc và côn trùng.',
    defaultShelfLifeDays: 180,
  },
  {
    name: 'Gia vị',
    storageAdvice: 'Đậy kín sau khi dùng, để nơi khô mát, tránh ánh nắng trực tiếp.',
    defaultShelfLifeDays: 365,
  },
  {
    name: 'Đồ hộp và đóng gói',
    storageAdvice: 'Để nơi khô mát; sau khi mở chuyển sang hộp kín, để ngăn mát và dùng sớm.',
    defaultShelfLifeDays: 365,
  },
  {
    name: 'Đồ uống',
    storageAdvice: 'Để nơi thoáng mát; sau khi mở nắp để ngăn mát và dùng trong 1–2 ngày.',
    defaultShelfLifeDays: 30,
  },
];

export const UNIT_SEEDS: readonly UnitSeed[] = [
  // Khối lượng (gốc: g)
  { symbol: 'g', name: 'gam' },
  { symbol: 'kg', name: 'ki-lô-gam', base: 'g', factorToBase: 1000 },
  // Thể tích (gốc: ml)
  { symbol: 'ml', name: 'mi-li-lít' },
  { symbol: 'l', name: 'lít', base: 'ml', factorToBase: 1000 },
  { symbol: 'thìa canh', name: 'thìa canh (15 ml)', base: 'ml', factorToBase: 15 },
  { symbol: 'thìa cà phê', name: 'thìa cà phê (5 ml)', base: 'ml', factorToBase: 5 },
  // Đếm — mỗi đơn vị là một nhóm riêng, không quy đổi chéo (BR-04)
  { symbol: 'quả', name: 'quả' },
  { symbol: 'củ', name: 'củ' },
  { symbol: 'bó', name: 'bó' },
  { symbol: 'cây', name: 'cây' },
  { symbol: 'tép', name: 'tép' },
  { symbol: 'con', name: 'con' },
  { symbol: 'miếng', name: 'miếng' },
  { symbol: 'hộp', name: 'hộp' },
  { symbol: 'gói', name: 'gói' },
  { symbol: 'chai', name: 'chai' },
  { symbol: 'lon', name: 'lon' },
  { symbol: 'vỉ', name: 'vỉ' },
];

const foods = (category: string, names: string[]): FoodSeed[] =>
  names.map((name) => ({ name, category }));

export const FOOD_SEEDS: readonly FoodSeed[] = [
  ...foods('Rau lá', [
    'Rau muống',
    'Cải ngọt',
    'Cải thảo',
    'Bắp cải',
    'Xà lách',
    'Rau mồng tơi',
    'Rau ngót',
    'Hành lá',
    'Rau mùi',
    'Rau răm',
    'Thì là',
    'Húng quế',
    'Giá đỗ',
  ]),
  ...foods('Củ quả', [
    'Cà chua',
    'Khoai tây',
    'Cà rốt',
    'Hành tây',
    'Bí đỏ',
    'Bí xanh',
    'Mướp',
    'Dưa chuột',
    'Cà tím',
    'Su su',
    'Đậu cô ve',
    'Ngô ngọt',
    'Ớt',
    'Tỏi',
    'Gừng',
    'Sả',
    'Hành tím',
  ]),
  ...foods('Trái cây', ['Chuối', 'Cam', 'Táo', 'Dưa hấu', 'Chanh', 'Xoài', 'Dứa']),
  ...foods('Thịt', ['Thịt ba chỉ', 'Thịt nạc vai', 'Thịt bằm', 'Sườn heo', 'Thịt bò', 'Thịt gà']),
  ...foods('Hải sản', ['Cá lóc', 'Cá thu', 'Cá basa', 'Tôm', 'Mực', 'Nghêu']),
  ...foods('Trứng', ['Trứng gà', 'Trứng vịt']),
  ...foods('Sữa và chế phẩm', ['Sữa tươi', 'Sữa chua', 'Phô mai']),
  ...foods('Đậu phụ và nấm', ['Đậu phụ', 'Nấm rơm', 'Nấm kim châm']),
  ...foods('Ngũ cốc và đồ khô', ['Gạo', 'Miến', 'Bột mì', 'Đậu xanh', 'Lạc']),
  ...foods('Gia vị', [
    'Muối',
    'Đường',
    'Nước mắm',
    'Nước tương',
    'Dầu ăn',
    'Hạt nêm',
    'Hạt tiêu',
    'Me',
  ]),
  ...foods('Đồ hộp và đóng gói', ['Mì gói', 'Cá hộp', 'Bánh phở khô']),
  ...foods('Đồ uống', ['Nước dừa']),
];

export const RECIPE_SEEDS: readonly RecipeSeed[] = [
  {
    name: 'Canh chua cá lóc',
    servings: 4,
    steps: [
      'Cá lóc làm sạch, cắt khúc, ướp với 1 thìa nước mắm trong 15 phút.',
      'Me ngâm nước ấm, dằm lấy nước cốt. Cà chua, dứa cắt miếng; giá rửa sạch.',
      'Đun sôi 1 lít nước với nước me, cho dứa và cà chua vào nấu 3 phút.',
      'Thả cá vào, nấu lửa vừa 7–8 phút, hớt bọt.',
      'Nêm nước mắm, đường cho vừa vị chua ngọt; cho giá, hành lá, ớt rồi tắt bếp.',
    ],
    ingredients: [
      { food: 'Cá lóc', quantity: 500, unit: 'g' },
      { food: 'Cà chua', quantity: 2, unit: 'quả' },
      { food: 'Dứa', quantity: 0.25, unit: 'quả' },
      { food: 'Giá đỗ', quantity: 100, unit: 'g' },
      { food: 'Me', quantity: 30, unit: 'g' },
      { food: 'Hành lá', quantity: 2, unit: 'cây' },
      { food: 'Ớt', quantity: 1, unit: 'quả' },
      { food: 'Nước mắm', quantity: 2, unit: 'thìa canh' },
      { food: 'Đường', quantity: 1, unit: 'thìa canh' },
    ],
  },
  {
    name: 'Thịt kho trứng',
    servings: 4,
    steps: [
      'Trứng vịt luộc chín, bóc vỏ. Thịt ba chỉ cắt miếng vuông, chần qua nước sôi.',
      'Ướp thịt với nước mắm, hành tím, tỏi băm trong 30 phút.',
      'Thắng đường thành nước màu, cho thịt vào đảo săn.',
      'Đổ nước dừa ngập thịt, kho lửa nhỏ 40 phút; cho trứng vào kho thêm 20 phút.',
    ],
    ingredients: [
      { food: 'Thịt ba chỉ', quantity: 500, unit: 'g' },
      { food: 'Trứng vịt', quantity: 4, unit: 'quả' },
      { food: 'Nước dừa', quantity: 400, unit: 'ml' },
      { food: 'Hành tím', quantity: 2, unit: 'củ' },
      { food: 'Tỏi', quantity: 3, unit: 'tép' },
      { food: 'Nước mắm', quantity: 3, unit: 'thìa canh' },
      { food: 'Đường', quantity: 1, unit: 'thìa canh' },
    ],
  },
  {
    name: 'Rau muống xào tỏi',
    servings: 2,
    steps: [
      'Rau muống nhặt, rửa sạch, chần sơ qua nước sôi rồi ngâm nước lạnh, để ráo.',
      'Phi thơm tỏi đập dập với dầu ăn.',
      'Cho rau vào xào lửa lớn 2 phút, nêm hạt nêm, đảo đều rồi tắt bếp.',
    ],
    ingredients: [
      { food: 'Rau muống', quantity: 1, unit: 'bó' },
      { food: 'Tỏi', quantity: 5, unit: 'tép' },
      { food: 'Dầu ăn', quantity: 2, unit: 'thìa canh' },
      { food: 'Hạt nêm', quantity: 1, unit: 'thìa cà phê' },
    ],
  },
  {
    name: 'Cà chua xào trứng',
    servings: 2,
    steps: [
      'Trứng đánh tan với nước mắm. Cà chua cắt múi cau, hành lá cắt khúc.',
      'Xào cà chua với dầu ăn đến khi mềm, ra nước.',
      'Đổ trứng vào, để trứng se mặt rồi đảo nhẹ; cho hành lá, tắt bếp.',
    ],
    ingredients: [
      { food: 'Trứng gà', quantity: 3, unit: 'quả' },
      { food: 'Cà chua', quantity: 2, unit: 'quả' },
      { food: 'Hành lá', quantity: 2, unit: 'cây' },
      { food: 'Nước mắm', quantity: 1, unit: 'thìa canh' },
      { food: 'Dầu ăn', quantity: 1, unit: 'thìa canh' },
    ],
  },
  {
    name: 'Canh bí đỏ thịt bằm',
    servings: 4,
    steps: [
      'Bí đỏ gọt vỏ, cắt miếng vừa ăn. Thịt bằm ướp chút hạt nêm, hạt tiêu.',
      'Xào sơ thịt bằm, đổ 1 lít nước, đun sôi.',
      'Cho bí đỏ vào nấu 10–12 phút đến khi bí mềm; nêm hạt nêm, rắc hành lá.',
    ],
    ingredients: [
      { food: 'Bí đỏ', quantity: 500, unit: 'g' },
      { food: 'Thịt bằm', quantity: 200, unit: 'g' },
      { food: 'Hành lá', quantity: 2, unit: 'cây' },
      { food: 'Hạt nêm', quantity: 1, unit: 'thìa cà phê' },
      { food: 'Hạt tiêu', quantity: 1, unit: 'thìa cà phê' },
    ],
  },
  {
    name: 'Gà xào sả ớt',
    servings: 4,
    steps: [
      'Thịt gà chặt miếng vừa ăn, ướp với nước mắm, đường, một nửa sả băm trong 20 phút.',
      'Phi thơm tỏi, sả và ớt băm với dầu ăn.',
      'Cho gà vào xào lửa lớn đến khi săn, hạ lửa đảo thêm 10 phút cho gà chín và thấm.',
    ],
    ingredients: [
      { food: 'Thịt gà', quantity: 500, unit: 'g' },
      { food: 'Sả', quantity: 3, unit: 'cây' },
      { food: 'Ớt', quantity: 2, unit: 'quả' },
      { food: 'Tỏi', quantity: 3, unit: 'tép' },
      { food: 'Nước mắm', quantity: 2, unit: 'thìa canh' },
      { food: 'Đường', quantity: 1, unit: 'thìa cà phê' },
      { food: 'Dầu ăn', quantity: 2, unit: 'thìa canh' },
    ],
  },
  {
    name: 'Đậu phụ sốt cà chua',
    servings: 3,
    steps: [
      'Đậu phụ cắt miếng, chiên vàng các mặt, vớt ra để ráo dầu.',
      'Cà chua băm nhỏ, xào với chút dầu ăn đến khi nhuyễn thành sốt; nêm nước mắm.',
      'Cho đậu vào rim với sốt 5 phút, rắc hành lá.',
    ],
    ingredients: [
      { food: 'Đậu phụ', quantity: 4, unit: 'miếng' },
      { food: 'Cà chua', quantity: 3, unit: 'quả' },
      { food: 'Hành lá', quantity: 2, unit: 'cây' },
      { food: 'Nước mắm', quantity: 1, unit: 'thìa canh' },
      { food: 'Dầu ăn', quantity: 3, unit: 'thìa canh' },
    ],
  },
  {
    name: 'Bò xào hành tây',
    servings: 3,
    steps: [
      'Thịt bò thái mỏng ngang thớ, ướp nước tương, hạt tiêu, tỏi băm, 1 thìa dầu ăn.',
      'Hành tây cắt múi cau.',
      'Xào bò lửa thật lớn 1–2 phút đến khi tái, trút ra.',
      'Xào hành tây 1 phút, cho bò vào đảo nhanh rồi tắt bếp.',
    ],
    ingredients: [
      { food: 'Thịt bò', quantity: 300, unit: 'g' },
      { food: 'Hành tây', quantity: 1, unit: 'củ' },
      { food: 'Tỏi', quantity: 3, unit: 'tép' },
      { food: 'Nước tương', quantity: 1, unit: 'thìa canh' },
      { food: 'Hạt tiêu', quantity: 1, unit: 'thìa cà phê' },
      { food: 'Dầu ăn', quantity: 2, unit: 'thìa canh' },
    ],
  },
  {
    name: 'Tôm rim mặn ngọt',
    servings: 3,
    steps: [
      'Tôm cắt râu, rửa sạch, để ráo. Hành tím băm.',
      'Phi thơm hành tím với dầu ăn, cho tôm vào đảo đến khi đỏ.',
      'Thêm nước mắm, đường, rim lửa nhỏ đến khi nước sánh lại; rắc hạt tiêu.',
    ],
    ingredients: [
      { food: 'Tôm', quantity: 400, unit: 'g' },
      { food: 'Hành tím', quantity: 2, unit: 'củ' },
      { food: 'Nước mắm', quantity: 2, unit: 'thìa canh' },
      { food: 'Đường', quantity: 1, unit: 'thìa canh' },
      { food: 'Dầu ăn', quantity: 1, unit: 'thìa canh' },
      { food: 'Hạt tiêu', quantity: 1, unit: 'thìa cà phê' },
    ],
  },
  {
    name: 'Canh rau ngót thịt bằm',
    servings: 3,
    steps: [
      'Rau ngót tuốt lá, rửa sạch, vò nhẹ. Hành tím băm.',
      'Phi hành tím, xào thịt bằm cho săn, đổ 800 ml nước, đun sôi.',
      'Cho rau ngót vào nấu 3–4 phút, nêm hạt nêm rồi tắt bếp.',
    ],
    ingredients: [
      { food: 'Rau ngót', quantity: 1, unit: 'bó' },
      { food: 'Thịt bằm', quantity: 150, unit: 'g' },
      { food: 'Hành tím', quantity: 1, unit: 'củ' },
      { food: 'Hạt nêm', quantity: 1, unit: 'thìa cà phê' },
    ],
  },
];
