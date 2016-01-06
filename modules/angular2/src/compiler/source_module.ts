import {StringWrapper, isBlank, isPresent, RegExpWrapper, RegExpMatcherWrapper, stringify} from 'angular2/src/facade/lang';
import {BaseException} from 'angular2/src/facade/exceptions';
import {CompileIdentifierMetadata} from './directive_metadata';

var IDENTIFIER_REGEXP = /#IDENT\[([^\]]*)\]/g;

export class IdentifierStore {
  private _nextId = 0;

  private _cacheKeyByRuntime = new Map<any, CompileIdentifierMetadata>();
  private _cacheKeyByModuleUrl = new Map<string, CompileIdentifierMetadata>();
  private _identifiersByCacheKey = new Map<string, CompileIdentifierMetadata>();

  store(identifier:CompileIdentifierMetadata):string {
    var moduleUrl = `${identifier.name}|${identifier.moduleUrl}`;
    var cacheKey;
    if (isPresent(identifier.runtime)) {
      cacheKey = this._cacheKeyByRuntime.get(identifier.runtime);
    }
    if (isBlank(cacheKey)) {
      cacheKey = this._cacheKeyByModuleUrl.get(moduleUrl);
    }
    if (isBlank(cacheKey)) {
      cacheKey = `id_${this._nextId++}`;
      this._identifiersByCacheKey.set(cacheKey, identifier);
      if (isPresent(identifier.runtime)) {
        this._cacheKeyByRuntime.set(identifier.runtime, cacheKey);
      }
      this._cacheKeyByModuleUrl.set(moduleUrl, cacheKey);
    }
    return `#IDENT[${cacheKey}]`;
  }

  jitSourceWithIdentifiers(source: string): JitSource {
    var identifierCount = 0;
    var vars = {};
    var varNameByCacheKey = {};
    var newSource =
        StringWrapper.replaceAllMapped(source, IDENTIFIER_REGEXP, (match) => {
          var cacheKey = match[1];
          var varName = varNameByCacheKey[cacheKey];
          if (isBlank(varName)) {
            var identifier = this._identifiersByCacheKey.get(cacheKey);
            varName = `${stringify(identifier.name)}_${identifierCount++}`;
            vars[varName] = identifier.runtime;
            varNameByCacheKey[cacheKey] = varName;
          }
          return varName;
        });
    return new JitSource(newSource, vars);
  }

  codegenSourceWithIdentifiers(sourceModule: SourceModule): SourceWithImports {
    var moduleAliases = {};
    var imports: string[][] = [];
    var newSource =
        StringWrapper.replaceAllMapped(sourceModule.sourceWithIdentifierRefs, IDENTIFIER_REGEXP, (match) => {
          var cacheKey = match[1];
          var identifier = this._identifiersByCacheKey.get(cacheKey);
          var moduleUrl = identifier.moduleUrl;
          var alias = moduleAliases[moduleUrl];
          if (isBlank(alias)) {
            if (moduleUrl == sourceModule.moduleUrl) {
              alias = '';
            } else {
              alias = `import${imports.length}`;
              imports.push([moduleUrl, alias]);
            }
            moduleAliases[moduleUrl] = alias;
          }
          return alias.length > 0 ? `${alias}.${identifier.name}` : identifier.name;
        });
    return new SourceWithImports(newSource, imports);
  }
}

/**
 * Represents generated source code with module references. Internal to the Angular compiler.
 */
export class SourceModule {
  constructor(public moduleUrl: string, public sourceWithIdentifierRefs: string) {}
}

export class SourceExpression {
  constructor(public declarations: string[], public expression: string) {}
}

export class SourceExpressions {
  constructor(public declarations: string[], public expressions: string[]) {}
}

/**
 * Represents generated source code with imports. Internal to the Angular compiler.
 */
export class SourceWithImports {
  constructor(public source: string, public imports: string[][]) {}
}


export class JitSource {
  constructor(public source: string, public vars: {[key: string]: any}) {}
}