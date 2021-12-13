module.exports = function babelPluginModularGraphql({ types: t }, options = {}) {
  let extension = (options.extension || '').trim();
  if (extension && extension[0] !== '.') {
    extension = '.' + extension;
  }

  const importMap = require('./import-map.json');
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
              if (!declaration) {
                console.warn(
                  `The export "${imported}" could not be found. It may not be known, or may not be available consistently between graphql@14|15|16.\n` +
                    'Try using an alternative method or check whether this method is present in the provided range of graphql major releases.'
                );
              }

              const from = declaration ? declaration.from : PKG_NAME;
              if (!acc[from]) {
                acc[from] = t.importDeclaration(
                  [],
                  t.stringLiteral(from === 'graphql' ? from : from + extension)
                );
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
