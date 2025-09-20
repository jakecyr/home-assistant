module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  overrides: [
    {
      files: ['scripts/*.js'],
      parserOptions: {
        project: null, // No type-aware linting for these
      },
    },
  ],
  extends: [
    'eslint:recommended',
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript',
    'google',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['tsconfig.json', 'tsconfig.dev.json'],
    sourceType: 'module',
  },
  ignorePatterns: [
    '/lib/**/*', // Ignore built files.
    '/generated/**/*', // Ignore generated files.
  ],
  plugins: ['@typescript-eslint', 'import'],
  rules: {
    quotes: ['warn', 'single'],
    'import/no-unresolved': 0,
    'object-curly-spacing': 0,
    camelcase: 0,
    indent: ['warn', 2],
    'quote-props': 0,
    'max-len': ['error', 100],
    '@typescript-eslint/no-var-requires': 0,
  },
};
