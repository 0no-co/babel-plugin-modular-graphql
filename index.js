module.exports = function babelPluginModularGraphql({ types: t }, { esm } = { esm: false }) {
  const importMap = require('./import-map.json');
  const importMapOverrides = require('./import-map-overrides.json');
  const PKG_NAME = 'graphql';

  return {
    visitor: {
      ImportDeclaration: {
        exit(path) {
          const { node } = path;
          if (node.source.value !== PKG_NAME || !node.specifiers.length) return;

          const imports = node.specifiers.reduce((acc, specifier) => {
            if (t.isImportSpecifier(specifier)) {
              const imported = specifier.imported.name;

              let declaration = importMap[imported];
              if (importMapOverrides[imported]) {
                declaration = importMapOverrides[imported];
              }

              const from = declaration ? declaration.from : PKG_NAME;
              if (!acc[from]) {
                acc[from] = t.importDeclaration([], t.stringLiteral(from + esm ? '.mjs' : '.js'));
              }

              const localName = specifier.local.name;
              const newImportedName = declaration ? declaration.local : imported;

              acc[from].specifiers.push(
                t.importSpecifier(t.identifier(localName), t.identifier(newImportedName))
              );
            }

            return acc;
          }, {});

          const importFiles = Object.keys(imports);
          if (importFiles.length && (importFiles.length !== 1 || importFiles[0] !== PKG_NAME)) {
            path.replaceWithMultiple(importFiles.map((key) => imports[key]));
          }
        },
      },
    },
  };
};
