// Runs on staged files before each commit (via .husky/pre-commit).
export default {
  '*.{ts,tsx,js,mjs,cjs}': ['eslint --fix --no-warn-ignored', 'prettier --write'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
};
