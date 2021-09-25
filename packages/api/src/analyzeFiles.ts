import * as ts from 'typescript';
import { dirname } from 'path';
import { PropTypes, PropType, PropDiagnostic, FunctionProp } from './types';
import { tsDefaults, DocsOptions, ProgramOptions } from './ts-utils';
import { SymbolParser } from './SymbolParser';

const cleanPropParemts = (
  prop: FunctionProp,
  propsName: 'properties' | 'parameters' | 'types',
  parents: Record<string, PropType>,
) => {
  if (prop[propsName]) {
    if (prop.parent && parents[prop.parent]) {
      delete prop[propsName];
    } else {
      prop[propsName] = consolidateParentProps(
        prop[propsName] as PropType[],
        parents,
      );
    }
  }
};
const consolidateParentProps = (
  props: PropType[],
  parents: Record<string, PropType>,
): PropType[] => {
  return props.map((prop) => {
    const propFn = prop as FunctionProp;
    cleanPropParemts(propFn, 'properties', parents);
    cleanPropParemts(propFn, 'parameters', parents);
    cleanPropParemts(propFn, 'types', parents);
    return propFn;
  });
};

export const analyzeFiles = (
  fileNames: string[],
  options: DocsOptions = {},
  programOptions: ProgramOptions = {},
): PropTypes => {
  const {
    tsOptions: userTsOptions,
    scope = 'exports',
    ...parseOptions
  } = options;
  const tsOptions = { ...tsDefaults, ...userTsOptions };
  const { extract, collectDiagnostics, internalTypes, collectHelpers } =
    parseOptions || {};
  const { program: userProgram, host: userHost } = programOptions;
  const host = userHost || ts.createCompilerHost(tsOptions);
  const program = userProgram || ts.createProgram(fileNames, tsOptions, host);
  const defaultLibraryFileName = host.getDefaultLibFileName(tsOptions);
  const defaultLibraryPath = host.getDefaultLibLocation
    ? host.getDefaultLibLocation()
    : dirname(defaultLibraryFileName);
  const equalityComparer = host.useCaseSensitiveFileNames()
    ? (s1: string, s2: string) => s1 === s2
    : (s1: string, s2: string) => s1.toUpperCase() === s2.toUpperCase();

  const isLibraryFile =
    defaultLibraryPath === '/'
      ? program.isSourceFileDefaultLibrary
      : (file: ts.SourceFile, node: ts.Node) => {
          if (file.hasNoDefaultLib) {
            return true;
          }
          if (typeof parseOptions.isInternal === 'function') {
            const result = parseOptions.isInternal(file, node);
            if (result !== undefined) {
              return result;
            }
          }
          return equalityComparer(dirname(file.fileName), defaultLibraryPath);
        };
  const parser = new SymbolParser(program, isLibraryFile, parseOptions);
  let parsed: PropTypes = {};
  const addSymbol = (symbol?: ts.Symbol): void => {
    if (symbol) {
      const symbolName = symbol.getName();
      if (
        internalTypes?.[symbolName] === undefined &&
        (!extract || extract.includes(symbolName))
      ) {
        const prop = parser.parse(symbol);
        if (prop) {
          parsed[symbolName] = prop;
        }
      }
    }
  };
  for (const fileName of fileNames) {
    const sourceFile = program.getSourceFile(fileName);
    if (sourceFile) {
      if (scope === 'all') {
        ts.forEachChild(sourceFile, (node: ts.Node) => {
          const namedNode = node as ts.ClassDeclaration;
          if (namedNode.name) {
            const symbol = parser.checker.getSymbolAtLocation(namedNode.name);
            addSymbol(symbol);
          } else if (ts.isVariableStatement(node)) {
            node.declarationList.declarations.forEach((d) => {
              if (d.name) {
                const symbol = parser.checker.getSymbolAtLocation(d.name);
                addSymbol(symbol);
              }
            });
          }
        });
      }
      const module = parser.checker.getSymbolAtLocation(sourceFile);
      if (module) {
        const exports = parser.checker.getExportsOfModule(module);
        exports.forEach((symbol) => addSymbol(symbol));
      }
    }
  }
  if (collectHelpers) {
    // only return parents that are not already exported from the same file
    const parents: Record<string, PropType> = Object.keys(parser.parents)
      .filter((name) => parsed[name] === undefined)
      .reduce((acc, name) => ({ ...acc, [name]: parser.parents[name] }), {});
    if (Object.keys(parents).length) {
      parsed = Object.keys(parsed).reduce((acc, key) => {
        return {
          ...acc,
          [key]: consolidateParentProps([parsed[key]], parents)[0],
        };
      }, {});
      parsed.__helpers = Object.keys(parents).reduce((acc, key) => {
        return {
          ...acc,
          [key]: consolidateParentProps([parents[key]], parents)[0],
        };
      }, {});
    }
  }
  if (collectDiagnostics) {
    const allDiagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter(({ file }) => file && fileNames.includes(file.fileName));
    if (allDiagnostics.length) {
      parsed.__diagnostics = allDiagnostics.map(
        ({ category, messageText, file, start }) => {
          const message =
            typeof messageText === 'string'
              ? messageText
              : messageText.messageText;

          const result: PropDiagnostic = {
            category,
            message,
          };
          if (file) {
            result.fileName = file.fileName.split('\\').pop()?.split('/').pop();
            if (typeof start !== 'undefined') {
              const location = file.getLineAndCharacterOfPosition(start);
              result.row = location.line + 1;
              result.column = location.character + 1;
            }
          }
          return result;
        },
      );
    }
  }

  return parsed;
};