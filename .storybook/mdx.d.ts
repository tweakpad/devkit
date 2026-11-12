// Storybook compiles MDX documentation pages to React components.
declare module '*.mdx' {
  import type { ComponentType } from 'react';

  const Page: ComponentType<{ components?: object }>;
  export default Page;
  /** Named React components a block file exports (the themed Docs container). */
  export const ThemedDocsContainer: ComponentType<{ context: unknown; children?: unknown }>;
}
