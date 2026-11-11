import { Injectable } from '@nestjs/common';
import { hashPassword, verifyPassword } from '../../common/utils/password.util';

/**
 * Băm/kiểm tra mật khẩu bằng bcrypt (wrapper injectable để test thay thế được).
 * @uc UC-AUTH-01, UC-AUTH-02  @fr FR-01
 */
@Injectable()
export class PasswordHasher {
  /** A valid bcrypt hash of a random string, compared when the user does not exist. */
  private static readonly DUMMY_HASH =
    '$2b$10$ekPsKtvBglJUmeSwdK85CeDptxZjsrYNqIGuOvv3ODWWIB.8iQKMK';

  hash(plain: string): Promise<string> {
    return hashPassword(plain);
  }

  verify(plain: string, passwordHash: string): Promise<boolean> {
    return verifyPassword(plain, passwordHash);
  }

  /** Spend the same time as a real check so login timing does not reveal unknown usernames. */
  async verifyAgainstDummy(plain: string): Promise<false> {
    await verifyPassword(plain, PasswordHasher.DUMMY_HASH);
    return false;
  }
}
