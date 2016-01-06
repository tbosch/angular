import {CompileTypeMetadata, CompileIdentifierMetadata} from './directive_metadata';
import {SourceExpressions, IdentifierStore} from './source_module';
import {
  ChangeDetectorJITGenerator
} from 'angular2/src/core/change_detection/change_detection_jit_generator';
import {AbstractChangeDetector} from 'angular2/src/core/change_detection/abstract_change_detector';
import {ChangeDetectionUtil} from 'angular2/src/core/change_detection/change_detection_util';
import {ChangeDetectorState} from 'angular2/src/core/change_detection/constants';

import {createChangeDetectorDefinitions} from './change_definition_factory';
import {IS_DART, isJsObject, CONST_EXPR} from 'angular2/src/facade/lang';

import {
  ChangeDetectorGenConfig,
  ChangeDetectorDefinition,
  DynamicProtoChangeDetector,
  ChangeDetectionStrategy
} from 'angular2/src/core/change_detection/change_detection';

import {TemplateAst} from './template_ast';
import {Codegen} from 'angular2/src/transform/template_compiler/change_detector_codegen';
import {MODULE_SUFFIX} from './util';
import {Injectable} from 'angular2/src/core/di';

var ABSTRACT_CHANGE_DETECTOR_IDENTIFIER = new CompileIdentifierMetadata({
    name: 'AbstractChangeDetector',
    moduleUrl: `package:angular2/src/core/change_detection/abstract_change_detector${MODULE_SUFFIX}`,
    runtime: AbstractChangeDetector
});
var UTIL_IDENTIFIER = new CompileIdentifierMetadata({
    name: 'ChangeDetectionUtil',
    moduleUrl: `package:angular2/src/core/change_detection/change_detection_util${MODULE_SUFFIX}`,
    runtime: ChangeDetectionUtil
});
var CHANGE_DETECTOR_STATE_IDENTIFIER = new CompileIdentifierMetadata({
  name: 'ChangeDetectorState',
  moduleUrl: `package:angular2/src/core/change_detection/constants${MODULE_SUFFIX}`,
  runtime: ChangeDetectorState
});

@Injectable()
export class ChangeDetectionCompiler {
  constructor(private _genConfig: ChangeDetectorGenConfig) {}

  compileComponentRuntime(componentType: CompileTypeMetadata, strategy: ChangeDetectionStrategy,
                          parsedTemplate: TemplateAst[]): Function[] {
    var changeDetectorDefinitions =
        createChangeDetectorDefinitions(componentType, strategy, this._genConfig, parsedTemplate);
    return changeDetectorDefinitions.map(definition =>
                                             this._createChangeDetectorFactory(definition));
  }

  private _createChangeDetectorFactory(definition: ChangeDetectorDefinition): Function {
    var proto = new DynamicProtoChangeDetector(definition);
    return () => proto.instantiate();
  }

  compileComponentCodeGen(componentType: CompileTypeMetadata, strategy: ChangeDetectionStrategy,
                          parsedTemplate: TemplateAst[], identifierStore: IdentifierStore): SourceExpressions {
    var changeDetectorDefinitions =
        createChangeDetectorDefinitions(componentType, strategy, this._genConfig, parsedTemplate);
    var factories = [];
    var index = 0;
    var sourceParts = changeDetectorDefinitions.map(definition => {
      var codegen: any;
      var sourcePart: string;
      // TODO(tbosch): move the 2 code generators to the same place, one with .dart and one with .ts
      // suffix
      // and have the same API for calling them!
      if (IS_DART) {
        codegen = new Codegen();
        var className = `_${definition.id}`;
        var typeRef = (index === 0 && componentType.isHost) ?
                          'dynamic' :
                          `${identifierStore.store(componentType)}`;
        codegen.generate(typeRef, className, definition);
        factories.push(`${className}.newChangeDetector`);
        sourcePart = codegen.toString();
      } else {
        codegen = new ChangeDetectorJITGenerator(
            definition, `${identifierStore.store(UTIL_IDENTIFIER)}`,
            `${identifierStore.store(ABSTRACT_CHANGE_DETECTOR_IDENTIFIER)}`,
            `${identifierStore.store(CHANGE_DETECTOR_STATE_IDENTIFIER)}`);
        factories.push(`function() { return new ${codegen.typeName}(); }`);
        sourcePart = codegen.generateSource();
      }
      index++;
      return sourcePart;
    });
    return new SourceExpressions(sourceParts, factories);
  }
}
