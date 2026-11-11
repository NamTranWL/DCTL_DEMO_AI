import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_CODE_PATTERN,
  InviteCodeGenerator,
  normalizeInviteCode,
} from './invite-code.generator';

describe('InviteCodeGenerator', () => {
  const generator = new InviteCodeGenerator();

  it('generates 8 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generator.generate();
      expect(code).toHaveLength(INVITE_CODE_LENGTH);
      expect([...code].every((ch) => INVITE_CODE_ALPHABET.includes(ch))).toBe(true);
      expect(code).toMatch(INVITE_CODE_PATTERN);
    }
  });

  it('never uses look-alike characters 0, O, 1, I, L', () => {
    expect(INVITE_CODE_ALPHABET).not.toMatch(/[0O1IL]/);
  });

  it('normalizes user input (trim + upper case)', () => {
    expect(normalizeInviteCode('  demo2026 ')).toBe('DEMO2026');
  });
});
