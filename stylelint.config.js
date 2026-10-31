export default {
  ignoreFiles: ['**/*.d.ts', 'dist/**'],
  extends: ['stylelint-config-standard'],
  overrides: [
    {
      files: ['**/*.ts'],
      customSyntax: 'postcss-lit',
      rules: {
        'value-keyword-case': ['lower', { ignoreKeywords: [/^POSTCSS_LIT_\d+$/] }],
      },
    },
  ],
  rules: {
    'selector-class-pattern': null,
    'custom-property-pattern': null,
  },
};
