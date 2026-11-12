// The runtime of a devkit documentation preview. A preview's `code` is the host markup and its
// `script` builds the pane as an application would, importing from `@tweakpad/devkit`. The page
// runs a copy of the script where each import reads the module from the page's own bundle through
// the registry @tweakpad/ui's renderings share (`window.__tpPreviewModules`); the copyable code keeps
// the imports as written.
//
// The registry, the copyable source and the import grammar are @tweakpad/ui's. What differs is the
// list of specifiers a devkit preview may import, and that disposing a preview disposes the panes
// its script built, so their frame loops stop with it.
import {
  installPreviewModules as installUiPreviewModules,
  previewImports,
  previewSource,
  unsupportedImports,
} from '@tweakpad/ui/docs';

export { previewImports, previewSource, unsupportedImports };

/** Packages a devkit preview script may import, besides `@tweakpad/ui/icons/<name>` modules. */
export const PREVIEW_SPECIFIERS = ['@tweakpad/devkit', 'lit'];
const ICON_SPECIFIER = /^@tweakpad\/ui\/icons\/[\w-]+$/;

/** Whether a preview script may import `specifier`. */
export function isPreviewSpecifier(specifier) {
  return PREVIEW_SPECIFIERS.includes(specifier) || ICON_SPECIFIER.test(specifier);
}

const NAMED_IMPORT = /^import\s*\{([^}]*)\}\s*from\s*(['"])([^'"]+)\2;?[ \t]*$/gm;
const NAMESPACE_IMPORT = /^import\s*\*\s*as\s+([\w$]+)\s+from\s*(['"])([^'"]+)\2;?[ \t]*$/gm;
const load = (specifier) =>
  `await (await window.__tpPreviewModules.ready)(${JSON.stringify(specifier)})`;

/** The runnable copy of a preview script: each allowed import reads the page's registry. */
export function rewritePreviewImports(script) {
  return script
    .replace(NAMED_IMPORT, (statement, names, _quote, specifier) => {
      if (!isPreviewSpecifier(specifier)) return statement;
      const bindings = names
        .split(',')
        .map((name) => name.trim().replace(/\s+as\s+/, ': '))
        .filter(Boolean)
        .join(', ');
      return `const { ${bindings} } = ${load(specifier)};`;
    })
    .replace(NAMESPACE_IMPORT, (statement, name, _quote, specifier) =>
      isPreviewSpecifier(specifier) ? `const ${name} = ${load(specifier)};` : statement,
    );
}

/** Fills the page's module registry: a loader per specifier, and one for icons by name. */
export function installPreviewModules(modules, icons) {
  installUiPreviewModules(modules, icons);
}

/**
 * Previews being torn down, by code: a preview script finds its markup by id, so a new mount of
 * the same preview waits until the previous one has run and released its panes. Otherwise the
 * previous script, still loading, would find the new markup and build its pane there.
 */
const settling = new Map();

/**
 * Renders a preview into `host`: the markup, then the script as a module reading its imports from
 * the page's registry. `dispose()` waits for the script, calls `release(host)` so the rendering can
 * dispose the panes the script built, then removes the markup.
 * @param {HTMLElement} host
 * @param {{ code: string, script?: string }} preview
 * @param {(host: HTMLElement) => void} [release]
 */
export function mountPreview(host, preview, release) {
  const key = preview.code;
  let disposed = false;
  let url;
  const ran = (settling.get(key) ?? Promise.resolve()).then(async () => {
    if (disposed) return;
    host.innerHTML = preview.code;
    if (!preview.script) return;
    const runnable = rewritePreviewImports(preview.script.trim());
    url = URL.createObjectURL(new Blob([runnable], { type: 'text/javascript' }));
    await import(/* @vite-ignore */ url);
  });
  return {
    ran,
    dispose() {
      if (disposed) return;
      disposed = true;
      const done = ran
        .catch(() => {})
        .then(() => {
          release?.(host);
          host.replaceChildren();
          if (url) URL.revokeObjectURL(url);
        });
      settling.set(key, done);
      void done.then(() => {
        if (settling.get(key) === done) settling.delete(key);
      });
    },
  };
}
