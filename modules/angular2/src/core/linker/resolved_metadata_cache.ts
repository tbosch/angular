import {Injectable} from '../di';
import {Type, isBlank} from 'angular2/src/facade/lang';
import {DirectiveProvider} from './element';
import {DirectiveResolver, CODEGEN_DIRECTIVE_RESOLVER} from './directive_resolver';
import {PipeProvider} from '../pipes/pipe_provider';
import {PipeResolver, CODEGEN_PIPE_RESOLVER} from './pipe_resolver';
import {
  DirectiveMetadata,
  ComponentMetadata,
  InputMetadata,
  OutputMetadata,
  HostBindingMetadata,
  HostListenerMetadata,
  ContentChildrenMetadata,
  ViewChildrenMetadata,
  ContentChildMetadata,
  ViewChildMetadata,
  PipeMetadata
} from 'angular2/src/core/metadata';

@Injectable()
export class ResolvedMetadataCache {
  private _directiveCache: Map<Type, DirectiveMetadata> = new Map<Type, DirectiveMetadata>();
  private _pipeCache: Map<Type, PipeMetadata> = new Map<Type, PipeMetadata>();

  constructor(private _directiveResolver: DirectiveResolver, private _pipeResolver: PipeResolver) {}

  getResolvedDirectiveMetadata(type: Type): DirectiveMetadata {
    var result = this._directiveCache.get(type);
    if (isBlank(result)) {
      result = this._directiveResolver.resolve(type);
      this._directiveCache.set(type, result);
    }
    return result;
  }

  getResolvedPipeMetadata(type: Type): PipeMetadata {
    var result = this._pipeCache.get(type);
    if (isBlank(result)) {
      result = this._pipeResolver.resolve(type);
      this._pipeCache.set(type, result);
    }
    return result;
  }
}

export var CODEGEN_RESOLVED_METADATA_CACHE =
    new ResolvedMetadataCache(CODEGEN_DIRECTIVE_RESOLVER, CODEGEN_PIPE_RESOLVER);
