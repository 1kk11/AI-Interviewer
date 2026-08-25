module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
    browser: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  extends: ['eslint:recommended'],
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
  },
  overrides: [
    {
      files: ['client/**/*.{js,jsx}'],
      env: {
        browser: true,
        node: false,
      },
    },
    {
      files: ['server/**/*.js'],
      env: {
        node: true,
        browser: false,
      },
    },
  ],
};
