import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';

/** Upper-case letters and digits without look-alikes (0/O, 1/I/L). */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;

/** Codes typed by users: 8 letters/digits, case-insensitive. */
export const INVITE_CODE_PATTERN = /^[A-Za-z0-9]{8}$/;

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Sinh mã mời gia đình ngẫu nhiên (CSPRNG). 31^8 ≈ 8,5·10^11 khả năng.
 * @uc UC-FAM-01  @fr FR-03
 */
@Injectable()
export class InviteCodeGenerator {
  generate(): string {
    let code = '';
    for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
      code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
    }
    return code;
  }
}
