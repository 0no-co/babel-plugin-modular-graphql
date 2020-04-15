const fs = require('fs');
const path = require('path');

const { rollup } = require('rollup');

const cwd = process.cwd();
const basepath = path.resolve(cwd, 'node_modules/graphql/');

function generateImportMapPlugin(opts = {}) {
  const maxDepth = opts.maxDepth || 2;
  const filename = opts.filename || 'import-map.json';
  const map = new Map();

  const resolveFile = (from, to) => {
    return path.join(from, to);
  };

  const resolveFromMap = (id, name, depth = 0) => {
    const exports = map.get(id);
    if (!exports || !exports.has(name)) return null;

    const declaration = exports.get(name);
    if (depth >= maxDepth || declaration.from === id) {
      return declaration;
    }

    return resolveFromMap(declaration.from, declaration.local, depth + 1)
      || declaration;
  };

  return {
    name: 'generate-import-map',
    transform(code, id) {
      const relative = path.relative(basepath, id);
      const dirname = path.dirname(relative);
      const exports = new Map();

      this.parse(code).body
        .filter(x => x.type === 'ExportNamedDeclaration')
        .forEach(node => {
          const source = node.source
            ? resolveFile(dirname, node.source.value)
            : relative;

          node.specifiers.forEach(specifier => {
            exports.set(specifier.exported.name, {
              local: specifier.local.name,
              from: source
            });
          });

          if (node.declaration) {
            (node.declaration.declarations || [node.declaration])
              .forEach(declaration => {
                if (declaration && declaration.id) {
                  const { name } = declaration.id;
                  exports.set(declaration.id.name, {
                    local: name,
                    from: source
                  });
                }
              });
          }
        });

      map.set(relative, exports);
      return null;
    },
    renderChunk(_code, chunk) {
      const id = chunk.facadeModuleId;
      const relative = path.relative(basepath, id);

      if (chunk.isEntry) {
        const importMap = chunk.exports.reduce((acc, name) => {
          const declaration = resolveFromMap(relative, name);
          if (declaration) {
            const dirname = path.join('graphql/', path.dirname(declaration.from));
            const filename = path.basename(declaration.from, '.mjs');

            acc[name] = {
              local: declaration.local,
              from: path.join(dirname, filename),
            };
          }

          return acc;
        }, {});

        this.emitFile({
          type: 'asset',
          filename,
          name: filename,
          source: JSON.stringify(importMap, null, 2)
        });
      }
    },
  };
}

(async () => {
  const bundle = await rollup({
    input: path.join(basepath, 'index.mjs'),
    external: (id) => !/^\.{0,2}\//.test(id),
    preserveModules: true,
    plugins: [
      require('@rollup/plugin-node-resolve')(),
      generateImportMapPlugin({
        filename: 'import-map.json'
      })
    ],
  });

  const { output } = await bundle.generate({});

  fs.writeFileSync(
    path.resolve(cwd, 'import-map.json'),
    output.find(asset => asset.type === 'asset').source
  );
})().catch((err) => {
  console.error(`${err.name}: ${err.message}`);
  process.exit(1);
});
