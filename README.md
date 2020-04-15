# babel-plugin-modular-graphql

A small transform plugin to cherry-pick GraphQL modules so you don’t have to.
Basically [babel-plugin-lodash](https://github.com/lodash/babel-plugin-lodash) for [graphql](https://github.com/graphql/graphql-js).

## Getting Started

```sh
npm install --save-dev babel-plugin-modular-graphql
# or
yarn add --dev babel-plugin-modular-graphql
```

And add the plugin to your Babel config; it doesn't take any options.

## Example

Imports like these:

```js
import { parse, Kind } from 'graphql';
```

Become:

```js
import { parse } from "graphql/language/parser";
import { Kind } from "graphql/language/kinds";
```

## Limitations

- The plugin currently does not support `require()`
- The plugin automatically generates an import-map that drills down into `graphql`'s files. This may break if files at a depth of 1–2 change their names.
