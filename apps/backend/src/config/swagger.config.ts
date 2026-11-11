import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/** Swagger UI path (served under the global `api` prefix). */
export const SWAGGER_PATH = 'api/docs';

/** Name of the Bearer security scheme; use with `@ApiBearerAuth(BEARER_AUTH)`. */
export const BEARER_AUTH = 'access-token';

/**
 * Swagger tags, one per NestJS module from PROJECT_CONTEXT.md §10 (+ health).
 * Controllers must use `@ApiTags(ApiTag.X)` so the docs group endpoints by module.
 */
export enum ApiTag {
  Health = 'health',
  Auth = 'auth',
  Users = 'users',
  Families = 'families',
  MasterData = 'master-data',
  Fridge = 'fridge',
  Shopping = 'shopping',
  MealPlan = 'meal-plan',
  Ai = 'ai',
  Notifications = 'notifications',
  Reports = 'reports',
  Admin = 'admin',
}

const TAG_DESCRIPTIONS: Record<ApiTag, string> = {
  [ApiTag.Health]: 'Kiểm tra tình trạng hệ thống (DB, Redis)',
  [ApiTag.Auth]: 'Đăng ký, đăng nhập, đổi mật khẩu — UC-AUTH-01/02',
  [ApiTag.Users]: 'Hồ sơ người dùng và hồ sơ ăn uống — UC-FAM-02',
  [ApiTag.Families]: 'Nhóm gia đình, thành viên — UC-FAM-01',
  [ApiTag.MasterData]: 'Danh mục, thực phẩm chuẩn, đơn vị, công thức — UC-ADM-02, UC-RCP-01',
  [ApiTag.Fridge]: 'Kho thực phẩm — UC-FRIDGE-01..05',
  [ApiTag.Shopping]: 'Danh sách mua sắm — UC-SHOP-01..03',
  [ApiTag.MealPlan]: 'Kế hoạch bữa ăn — UC-MEAL-01/02',
  [ApiTag.Ai]: 'Gợi ý món bằng AI — UC-AI-01',
  [ApiTag.Notifications]: 'Thông báo nhắc hạn — UC-FRIDGE-04',
  [ApiTag.Reports]: 'Báo cáo thống kê — UC-RPT-01',
  [ApiTag.Admin]: 'Quản trị hệ thống — UC-ADM-01..04',
};

export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('Đi chợ Tiện lợi API')
    .setDescription(
      'REST API của hệ thống Đi chợ Tiện lợi. Mọi response thành công có dạng `{ data }`; ' +
        'lỗi có dạng `{ code, message, details }`.',
    )
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, BEARER_AUTH);

  for (const tag of Object.values(ApiTag)) {
    builder.addTag(tag, TAG_DESCRIPTIONS[tag]);
  }

  return SwaggerModule.createDocument(app, builder.build());
}

export function setupSwagger(app: INestApplication): void {
  const document = buildSwaggerDocument(app);
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: `${SWAGGER_PATH}-json`,
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha' },
  });
}
