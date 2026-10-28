// Conventional Commits; scope = NestJS/mobile module name or a use-case code (e.g. UC-SHOP-03).
// Several scopes may be combined with commas: `feat(shopping,UC-SHOP-03): ...`.

/** Module names from PROJECT_CONTEXT.md §10 plus repository-level areas. */
const MODULE_SCOPES = [
  'auth',
  'users',
  'families',
  'master-data',
  'fridge',
  'shopping',
  'meal-plan',
  'ai',
  'notifications',
  'reports',
  'admin',
  // repository-level areas
  'backend',
  'mobile',
  'shared',
  'infra',
  'ci',
  'deps',
  'docs',
  'release',
];

/** Use-case code pattern from PROJECT_CONTEXT.md §6, e.g. UC-AI-01, UC-FRIDGE-05. */
const UC_PATTERN = /^UC-[A-Z]+-\d{2}$/;

const isValidScope = (scope) => MODULE_SCOPES.includes(scope) || UC_PATTERN.test(scope);

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'dctl-scope': ({ scope }) => {
          if (!scope) {
            return [false, 'scope is required, e.g. feat(shopping): ... or fix(UC-SHOP-03): ...'];
          }
          const invalid = scope
            .split(',')
            .map((s) => s.trim())
            .filter((s) => !isValidScope(s));
          return [
            invalid.length === 0,
            `invalid scope(s): ${invalid.join(', ')}. Allowed: ${MODULE_SCOPES.join(', ')} or a use-case code like UC-SHOP-03`,
          ];
        },
      },
    },
  ],
  rules: {
    'scope-empty': [0],
    'scope-case': [0],
    'dctl-scope': [2, 'always'],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
};
