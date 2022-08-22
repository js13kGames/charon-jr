module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
  },
  extends: [
    'eslint:recommended',
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    "sourceType": "module",
  },
  plugins: ["@typescript-eslint"],
  rules: {
    'no-console': 'off',
    'no-debugger': 'off',
    'prefer-destructuring': 'off',
    camelcase: 'off',
    'no-use-before-define': ['warn', { variables: true, functions: false, classes: true }],
    'id-length': 'off',
    'max-classes-per-file': ['error', 1],
    'no-global-assign': ['error', { exceptions: ['Object'] }],
    'no-nested-ternary': 'off',
    'no-useless-escape': 'off',
    'no-unneeded-ternary': 'error',
    'no-sparse-arrays': 'off',
    'import/prefer-default-export': 'off',
    'guard-for-in': 'error',
    'comma-dangle': ['warn', 'always-multiline'],
    'arrow-parens': 'off',
    semi: 'warn',
    'arrow-body-style': 'off',
    'no-multiple-empty-lines': ['error', { max: 2, maxBOF: 1 }],
    'lines-between-class-members': 'off',
    yoda: 'error',
    'no-unused-vars': 'off',
    'no-bitwise': 'off',
    'class-methods-use-this': 'off',
    'linebreak-style': 0,
    'no-param-reassign': 'off',
    'function-paren-newline': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    'no-shadow': 'off',
  },
  overrides: [
    {
      files: [
        '**/__tests__/*.{j,t}s?(x)',
        '**/tests/unit/**/*.spec.{j,t}s?(x)',
      ],
      env: {
        jest: true,
      },
    },
  ],
  settings: {
    'import/resolver': {
      typescript: {},
    },
  },
};
