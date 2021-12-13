const fs = require('fs');
const path = require('path');

const { rollup } = require('rollup');

/** Generates a map of exports from a given graphql package to list of import locations. */
async function traceImports(moduleName) {
  const basepath = path.resolve(process.cwd(), 'node_modules/', moduleName);
  const exportMap = {};

  const resolveFile = (to, relative = '.') => {
    const dirname = path.join('graphql/', relative, path.dirname(to));
    const filename = path.basename(to, '.mjs');
    return filename !== 'index' ? path.join(dirname, filename) : dirname;
  };

  const bundle = await rollup({
    // This contains all top-level "sub-modules" of graphql too, since not all exports of
    // them may be exposed in the main index.mjs file.
    input: {
      graphql: path.join(basepath, 'index.mjs'),
      'graphql/error': path.join(basepath, 'error/index.mjs'),
      'graphql/execution': path.join(basepath, 'execution/index.mjs'),
      'graphql/language': path.join(basepath, 'language/index.mjs'),
      'graphql/subscription': path.join(basepath, 'subscription/index.mjs'),
      'graphql/type': path.join(basepath, 'type/index.mjs'),
      'graphql/utilities': path.join(basepath, 'utilities/index.mjs'),
      'graphql/validation': path.join(basepath, 'validation/index.mjs'),
    },
    external: (id) => !/^\.{0,2}\//.test(id),
    preserveModules: true,
    plugins: [
      require('@rollup/plugin-node-resolve').nodeResolve(),
      {
        transform(code, id) {
          const relative = path.relative(basepath, id);
          const dirname = path.dirname(relative);
          const exports = {};

          this.parse(code)
            .body.filter((x) => x.type === 'ExportNamedDeclaration')
            .forEach((node) => {
              const from = node.source
                ? resolveFile(node.source.value, dirname)
                : resolveFile(relative);

              node.specifiers.forEach((specifier) => {
                const { name: local } = specifier.exported;
                exports[local] = { local, from };
              });

              if (node.declaration) {
                (node.declaration.declarations || [node.declaration]).forEach((declaration) => {
                  if (declaration && declaration.id) {
                    const { name: local } = declaration.id;
                    exports[local] = { local, from };
                  }
                });
              }
            });

          exportMap[resolveFile(relative)] = exports;
          return null;
        },
      },
    ],
  });

  await bundle.generate({});
  return exportMap;
}

function isDeclarationEqual(a, b) {
  return a.local === b.local && a.from === b.from;
}

function mergeTraces(traces) {
  const trace = {};

  // Iterate over all known filenames in all traces
  const ids = new Set(
    traces.map((trace) => Object.keys(trace)).reduce((acc, names) => acc.concat(names), [])
  );
  for (const id of ids) {
    // Each file must exist in all traces
    if (!traces.every((trace) => !!trace[id])) continue;

    const exports = {};

    // Iterate over all known exports in each trace's set of exports for this file
    const exportNames = new Set(
      traces.map((trace) => Object.keys(trace[id])).reduce((acc, names) => acc.concat(names), [])
    );
    for (const name of exportNames) {
      // Each export must exist in all traces
      if (traces.every((trace) => !!trace[id][name])) {
        // Collect known declarations and deduplicate
        exports[name] = traces
          .map((trace) => trace[id][name])
          .filter((val, index, all) => {
            const firstIndex = all.findIndex((item) => isDeclarationEqual(item, val));
            return firstIndex === index;
          });
      }
    }

    if (Object.keys(exports).length) trace[id] = exports;
  }

  // For a given declaration, find the first deepest one that works for the trace
  // NOTE: This doesn't find the absolute deepest one, since it assumes that each
  // export only has one functional trace
  const resolveDeclaration = (declaration) => {
    const declarations = trace[declaration.from];
    if (!declarations || !declarations[declaration.local]) return null;
    for (const childDeclaration of declarations[declaration.local]) {
      if (childDeclaration.from === declaration.from) continue;
      const resolved = resolveDeclaration(childDeclaration);
      if (resolved && resolved.from !== declaration.from) return resolved;
    }

    return declaration;
  };

  // Resolve all known (and consistent) exports to a common, deepest declaration
  for (const local in trace.graphql)
    exports[local] = resolveDeclaration({ local, from: 'graphql' });
  return exports;
}

(async () => {
  const traces = await Promise.all([
    traceImports('graphql-14'),
    traceImports('graphql-15'),
    traceImports('graphql-16'),
  ]);

  const trace = mergeTraces(traces);

  fs.writeFileSync('import-map.json', JSON.stringify(trace, null, 2));
})().catch((err) => {
  console.error(`${err.name}: ${err.stack}`);
  process.exit(1);
});
