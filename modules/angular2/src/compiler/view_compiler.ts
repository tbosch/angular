import {
  isPresent,
  isBlank,
  Type,
  isString,
  StringWrapper,
  IS_DART,
  CONST_EXPR,
  isArray
} from 'angular2/src/facade/lang';
import {  BaseException } from 'angular2/src/facade/exceptions';
import {SetWrapper, StringMapWrapper, ListWrapper, MapWrapper} from 'angular2/src/facade/collection';
import {
  TemplateAst,
  TemplateAstVisitor,
  NgContentAst,
  EmbeddedTemplateAst,
  ElementAst,
  VariableAst,
  BoundEventAst,
  BoundElementPropertyAst,
  AttrAst,
  BoundTextAst,
  TextAst,
  DirectiveAst,
  BoundDirectivePropertyAst,
  templateVisitAll
} from './template_ast';
import {CompileTypeMetadata, CompileDirectiveMetadata, CompilePipeMetadata, CompileIdentifierMetadata, CompileFactoryMetadata, CompileDiDependencyMetadata, CompileProviderMetadata, CompileQueryMetadata} from './directive_metadata';
import {SourceExpressions, SourceExpression, IdentifierStore} from './source_module';
import {
  AppView,
  flattenNestedViewRenderNodes,
  checkSlotCount
} from 'angular2/src/core/linker/view';
import {ViewType} from 'angular2/src/core/linker/view_type';
import {AppViewManager_} from 'angular2/src/core/linker/view_manager';
import {AppElement} from 'angular2/src/core/linker/element';
import {Renderer, ParentRenderer} from 'angular2/src/core/render/api';
import {ViewEncapsulation} from 'angular2/src/core/metadata/view';
import {
  escapeSingleQuoteString,
  codeGenConstConstructorCall,
  codeGenValueFn,
  codeGenFnHeader,
  MODULE_SUFFIX,
  Statement,
  escapeValue,
  codeGenArray,
  codeGenFlatArray,
  Expression,
  CONST_VAR,
  codeGenStringMap,
  addAll
} from './util';
import {ResolvedProvider, Injectable, Injector} from 'angular2/src/core/di';
import {QueryList} from 'angular2/src/core/linker';
import {TemplateRef, TemplateRef_} from 'angular2/src/core/linker/template_ref';
import {
  ChangeDetectorGenConfig,
  ChangeDetectorDefinition,
  DynamicProtoChangeDetector,
  ChangeDetectionStrategy
} from 'angular2/src/core/change_detection/change_detection';
import {CodegenNameUtil} from 'angular2/src/core/change_detection/codegen_name_util';
import {AbstractChangeDetector} from 'angular2/src/core/change_detection/abstract_change_detector';
import {ChangeDetectionUtil} from 'angular2/src/core/change_detection/change_detection_util';
import {ChangeDetectorState} from 'angular2/src/core/change_detection/constants';
import {createPropertyRecords} from 'angular2/src/core/change_detection/proto_change_detector';
import {SelectedPipe} from 'angular2/src/core/change_detection/pipes';
import {createChangeDetectorDefinitions} from './change_definition_factory';
import {
  ChangeDetectorJITGenerator
} from 'angular2/src/core/change_detection/change_detection_jit_generator';
import {Codegen} from 'angular2/src/transform/template_compiler/change_detector_codegen';

// TODO: have a single file that reexports everything needed for
// codegen explicitly
// - helps understanding what codegen works against
// - less imports in codegen code

var VIEW_TYPE_MODULE_URL = 'package:angular2/src/core/linker/view_type' + MODULE_SUFFIX;

export var APP_VIEW_MODULE_URL = 'package:angular2/src/core/linker/view' + MODULE_SUFFIX;
var FLATTEN_NESTED_VIEW_RENDER_NODES = new CompileIdentifierMetadata({
  name: 'flattenNestedViewRenderNodes',
  moduleUrl: APP_VIEW_MODULE_URL,
  runtime: flattenNestedViewRenderNodes
});
var APP_VIEW_IDENTIFIER = new CompileIdentifierMetadata({
  name: 'AppView',
  moduleUrl: APP_VIEW_MODULE_URL,
  runtime: AppView
});
var CHECK_SLOT_COUNT_IDENTIFIER = new CompileIdentifierMetadata({
  name: 'checkSlotCount',
  moduleUrl: APP_VIEW_MODULE_URL,
  runtime: checkSlotCount
});

var APP_EL_IDENTIFIER = new CompileIdentifierMetadata({
  name: 'AppElement',
  moduleUrl: 'package:angular2/src/core/linker/element' + MODULE_SUFFIX,
  runtime: AppElement
});
var QUERY_LIST_IDENTIFIER = new CompileIdentifierMetadata({
  name: 'QueryList',
  moduleUrl: 'package:angular2/src/core/linker/query_list' + MODULE_SUFFIX,
  runtime: QueryList
});
var TEMPLATE_REF_IDENTIFIER = new CompileIdentifierMetadata({
  name: 'TemplateRef',
  moduleUrl: 'package:angular2/src/core/linker/template_ref' + MODULE_SUFFIX,
  runtime: TemplateRef
});
var TEMPLATE_REF_INTERNAL_IDENTIFIER = new CompileTypeMetadata({
  name: 'TemplateRef_',
  moduleUrl: 'package:angular2/src/core/linker/template_ref' + MODULE_SUFFIX,
  runtime: TemplateRef_
});
var SELECTED_PIPE_IDENTIFIER = new CompileTypeMetadata({
  name: 'SelectedPipe',
  moduleUrl: 'package:angular2/src/core/change_detection/pipes' + MODULE_SUFFIX,
  runtime: SelectedPipe
});
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

var METADATA_MODULE_URL = 'package:angular2/src/core/metadata/view' + MODULE_SUFFIX;

const IMPLICIT_TEMPLATE_VAR = '\$implicit';
const CLASS_ATTR = 'class';
const STYLE_ATTR = 'style';

@Injectable()
export class ViewCompiler {
  constructor(private _genConfig: ChangeDetectorGenConfig) {}

  compileComponentCodeGen(component: CompileDirectiveMetadata, template: TemplateAst[],
                          styles: SourceExpression,
                          pipes: CompilePipeMetadata[],
                          componentViewFactory: Function,
                          identifierStore: IdentifierStore): SourceExpression {
    var changeDetectorDefinitions =
        createChangeDetectorDefinitions(component.type, component.changeDetection, this._genConfig, template);
    var changeDetectorFactoryExpressions = this._compileChangeDetectorsCodeGen(component.type, changeDetectorDefinitions, template, identifierStore);
    var viewFactory = new CodeGenViewFactory(
        component, styles, pipes, changeDetectorDefinitions, changeDetectorFactoryExpressions, componentViewFactory, identifierStore);
    var viewFactoryExpression = viewFactory.createViewFactory(template, [], CompileElement.createNull());
    var statements = [];
    addAll(changeDetectorFactoryExpressions.declarations, statements);
    addAll(viewFactory.targetStatements.map(stmt => stmt.statement), statements);

    return new SourceExpression(statements,
                                viewFactoryExpression.viewFactory.expression);
  }

  private _compileChangeDetectorsCodeGen(componentType: CompileTypeMetadata, changeDetectorDefinitions: ChangeDetectorDefinition[],
                          parsedTemplate: TemplateAst[], identifierStore: IdentifierStore): SourceExpressions {
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

// TODO: Create an own view factory for JS, Dart and TS
// -> don't switch inside of the methods themselves?!
class CodeGenViewFactory {
  private _embeddedTemplateCount: number = 0;
  public targetStatements: Statement[] = [];

  constructor(public component: CompileDirectiveMetadata, public styles: SourceExpression,
              public pipes: CompilePipeMetadata[],
              public changeDetectorDefinitions: ChangeDetectorDefinition[],
              public changeDetectorExpressions: SourceExpressions,
              public componentViewFactory: Function,
              public identifierStore: IdentifierStore) {
  }

  // TODO: Split down into separate methods and generalize as much as possible
  createPipes(view: CompileView) {
    var protoRecords = createPropertyRecords(this.changeDetectorDefinitions[view.embeddedTemplateIndex]);
    var cdNameUtil = new CodegenNameUtil(protoRecords, [], [], null);
    var pipesByName = new Map<string, CompilePipeMetadata>();
    this.pipes.forEach( (pipe) => {
      pipesByName.set(pipe.name, pipe);
    });
    var purePipes = new Map<string, string>();
    var resolvedProviders = [];
    protoRecords.forEach( (protoRecord) => {
      if (protoRecord.isPipeRecord()) {
        var pipe = pipesByName.get(protoRecord.name);
        var pipeProperty = `this.changeDetector.${cdNameUtil.getPipeName(protoRecord.selfIndex).substring(5)}`;
        var existingPurePipeProperty;
        if (pipe.pure) {
          existingPurePipeProperty = purePipes.get(pipe.name);
          if (isBlank(existingPurePipeProperty)) {
            purePipes.set(pipe.name, pipeProperty);
          }
        }
        var pipeInstanceExpr;
        if (isPresent(existingPurePipeProperty)) {
          pipeInstanceExpr = existingPurePipeProperty;
        } else {
          var provider = new CompileProviderMetadata({
            useClass: pipe.type
          });
          var deps = pipe.type.diDeps.map( (diDep) => {
            if (diDep.token instanceof CompileIdentifierMetadata) {
              var diToken = <CompileIdentifierMetadata> diDep.token;
              // TODO: Do a proper class detection
              if (diToken.name == 'ChangeDetectorRef') {
                return new Expression('this.changeDetectorRef');
              }
            }
            return this.injectFromViewParentInjector(diDep.token, false);
          });
          pipeInstanceExpr = `new ${this.identifierStore.store(SELECTED_PIPE_IDENTIFIER)}(${this.instantiateProvider(provider, deps).expression}, ${pipe.pure})`;
        }
        view.constructorMethod.statements.push(new Statement(
          `${pipeProperty} = ${pipeInstanceExpr};`
        ));
      }
    });
  }

  createText(parent: Expression, nodeIndex: number, text: string,
             compileView: CompileView): Expression {
    var varName = `text_${nodeIndex}`;
    var statement =
        `var ${varName} = renderer.createText(${isPresent(parent) ? parent.expression : null}, ${escapeSingleQuoteString(text)});`;
    compileView.constructorMethod.statements.push(new Statement(statement));
    return new Expression(varName);
  }

  createElement(parentRenderNode: Expression, nodeIndex: number, name: string,
                compileView: CompileView): Expression {
    var varName = `el_${nodeIndex}`;
    var valueExpr;
    if (nodeIndex === 0 && compileView.viewType === ViewType.HOST) {
      valueExpr = `rootSelector == null ?
        renderer.createElement(${isPresent(parentRenderNode) ? parentRenderNode.expression : null}, ${escapeSingleQuoteString(name)}) :
        renderer.selectRootElement(rootSelector);`;
    } else {
      valueExpr =
          `renderer.createElement(${isPresent(parentRenderNode) ? parentRenderNode.expression : null}, ${escapeSingleQuoteString(name)})`;
    }
    var statement = `var ${varName} = ${valueExpr};`;
    compileView.constructorMethod.statements.push(new Statement(statement));
    return new Expression(varName);
  }

  createTemplateAnchor(parentRenderNode: Expression,
                       nodeIndex: number, compileView: CompileView): Expression {
    var varName = `anchor_${nodeIndex}`;
    var valueExpr =
        `renderer.createTemplateAnchor(${isPresent(parentRenderNode) ? parentRenderNode.expression : null});`;
    compileView.constructorMethod.statements.push(new Statement(`var ${varName} = ${valueExpr}`));
    return new Expression(varName);
  }

  createGlobalEventListener(boundElementIndex: number,
                            disposableIndex:number, eventAst: BoundEventAst, compileView: CompileView): Expression {
    var disposableVar = `disposable_${disposableIndex}`;
    var eventHandlerExpr = codeGenEventHandler(new Expression('self'), boundElementIndex, eventAst.fullName);
    compileView.constructorMethod.statements.push(new Statement(
        `var ${disposableVar} = renderer.listenGlobal(${escapeValue(eventAst.target)}, ${escapeValue(eventAst.name)}, ${eventHandlerExpr});`));
    return new Expression(disposableVar);
  }

  createElementEventListener(boundElementIndex: number,
                             renderNode: Expression, eventAst: BoundEventAst,
                             compileView: CompileView) {
    var eventHandlerExpr = codeGenEventHandler(new Expression('self'), boundElementIndex, eventAst.fullName);
    compileView.constructorMethod.statements.push(new Statement(
        `renderer.listen(${renderNode.expression}, ${escapeValue(eventAst.name)}, ${eventHandlerExpr});`));
  }

  setElementAttribute(renderNode: Expression, attrName: string,
                      attrValue: string, compileView: CompileView) {
    compileView.constructorMethod.statements.push(new Statement(
        `renderer.setElementAttribute(${renderNode.expression}, ${escapeSingleQuoteString(attrName)}, ${escapeSingleQuoteString(attrValue)});`));
  }

  createAppElement(boundElementIndex:number, renderNode: Expression,
                   parentAppEl: Expression,
                   compileView: CompileView): Expression {
    var appVar = `appEl_${boundElementIndex}`;
    var varValue =
        `new ${this.identifierStore.store(APP_EL_IDENTIFIER)}(${boundElementIndex}, this,
      ${isPresent(parentAppEl) ? parentAppEl.expression : null}, ${renderNode.expression})`;
    compileView.constructorMethod.statements.push(new Statement(`this.${appVar} = ${varValue};`));
    return new Expression(`this.${appVar}`);
  }

  getConstructorViewQueryList(index: number): Expression {
    return new Expression(`this.containerAppElement.componentConstructorViewQueries[${index}]`);
  }

  createAndSetComponentView(appEl: Expression, component: CompileDirectiveMetadata, componentInstance: Expression,
                            componentConstructorViewQueryLists: Expression[], contentNodesByNgContentIndex: Expression[][],
                            compileView: CompileView) {
    var codeGenContentNodes;
    if (this.component.type.isHost) {
      codeGenContentNodes = `projectableNodes`;
    } else {
      codeGenContentNodes =
          `[${contentNodesByNgContentIndex.map( nodes => codeGenFlatArray(nodes) ).join(',')}]`;
    }
    // TODO: make this nicer, not just setting the property...
    compileView.constructorMethod.statements.push(new Statement(`${appEl.expression}.component = ${componentInstance.expression};`));
    compileView.constructorMethod.statements.push(new Statement(`${appEl.expression}.componentConstructorViewQueries = ${codeGenArray(componentConstructorViewQueryLists)};`));

    compileView.constructorMethod.statements.push(new Statement(
        `${this.componentViewFactory(component, this.identifierStore)}(renderer, viewManager, ${this.getComponentViewInjector(appEl).expression}, ${appEl.expression}, ${codeGenContentNodes}, null, null);`));
  }

  setElementVariable(appEl: Expression, varName: string, value: Expression,
                            compileView: CompileView) {
    compileView.constructorMethod.statements.push(new Statement(`variables[${escapeValue(varName)}] = ${escapeValue(value)};`));
  }

  getProjectedNodes(ngContentIndex: number): Expression {
    return new Expression(`projectableNodes[${ngContentIndex}]`, true);
  }

  appendProjectedNodes(parent: Expression, nodes: Expression,
                       compileView: CompileView) {
    compileView.constructorMethod.statements.push(new Statement(
        `renderer.projectNodes(${parent.expression}, ${this.identifierStore.store(FLATTEN_NESTED_VIEW_RENDER_NODES)}(${nodes.expression}));`));
  }

  assignDirectiveToChangeDetector(directive: Expression, boundElementIndex: number, directiveIndex: number, compileView: CompileView) {
    compileView.constructorMethod.statements.push(new Statement(`this.changeDetector.directive_${boundElementIndex}_${directiveIndex} = ${directive.expression};`));
  }

  createInjectInternalCondition(boundElementIndex: number, elementBoundChildrenCount: number, provider: CompileResolvedProvider, providerExpr: Expression, generatedMethod: GeneratedMethod) {
    var indexCondition;
    if (elementBoundChildrenCount > 0) {
      indexCondition = `${boundElementIndex} <= requestElementIndex && requestElementIndex <= ${boundElementIndex + elementBoundChildrenCount}`;
    } else {
      indexCondition = `${boundElementIndex} === requestElementIndex`;
    }
    generatedMethod.statements.push(new Statement(
    `if (token === ${codeGenDiToken(provider.token, this.identifierStore)} && ${indexCondition}) {
      return ${providerExpr.expression};
    }`));
  }

  createInjectInternalMethod(generatedMethod: GeneratedMethod, compileView: CompileView) {
    compileView.classStatements.push(new Statement(`
      ${compileView.className}.prototype.injectInternal = function(token, requestElementIndex) {
        ${generatedMethod.statements.map( (stmt) => stmt.statement).join('\n')}
      }
    `));
  }

  createInjectPrivateInternalMethod(generatedMethod: GeneratedMethod, compileView: CompileView) {
    compileView.classStatements.push(new Statement(`
      ${compileView.className}.prototype.injectPrivateInternal = function(token, requestElementIndex) {
        ${generatedMethod.statements.map( (stmt) => stmt.statement).join('\n')}
      }
    `));
  }

  createUpdateContentQueriesMethod(generatedMethod: GeneratedMethod, compileView: CompileView) {
    compileView.classStatements.push(new Statement(`
      ${compileView.className}.prototype.updateContentQueriesInternal = function() {
        ${generatedMethod.statements.map( (stmt) => stmt.statement).join('\n')}
      }
    `));
  }

  createUpdateViewQueriesMethod(generatedMethod: GeneratedMethod, compileView: CompileView) {
    compileView.classStatements.push(new Statement(`
      ${compileView.className}.prototype.updateViewQueriesInternal = function() {
        ${generatedMethod.statements.map( (stmt) => stmt.statement).join('\n')}
      }
    `));
  }

  createDirtyParentQueriesMethod(generatedMethod: GeneratedMethod, compileView: CompileView) {
    compileView.classStatements.push(new Statement(`
      ${compileView.className}.prototype.dirtyParentQueriesInternal = function() {
        ${generatedMethod.statements.map( (stmt) => stmt.statement).join('\n')}
      }
    `));
  }

  mapNestedViews(containerAppElement:Expression, viewClassName: string, expressions: Expression[]):Expression {
    var adjustedExpressions:Expression[] = expressions.map( (expr) => {
      if (expr.expression.startsWith('this.')) {
        return new Expression(`nestedView.${expr.expression.substring(5)}`);
      }
    });
    return new Expression(`${containerAppElement.expression}.mapNestedViews(${viewClassName}, function(nestedView) {
      return ${codeGenArray(adjustedExpressions)};
    })`);
  }

  getRenderer(appElement: Expression):Expression {
    return new Expression(`renderer`);
  }

  getDefaultInjector(appElement: Expression):Expression {
    return new Expression(`${appElement.expression}.getDefaultInjector()`);
  }

  getComponentViewInjector(appElement: Expression):Expression {
    return new Expression(`${appElement.expression}.getComponentViewInjector()`);
  }

  getComponentInjector(appElement: Expression):Expression {
    return new Expression(`${appElement.expression}.getComponentInjector()`);
  }

  getViewParentProperty(property: Expression): Expression {
    var expr;
    if (property.expression.startsWith('this.')) {
      expr = `this.containerAppElement.parentView.${property.expression.substring(5)}`;
    } else {
      expr = property.expression;
    }
    return new Expression(`${expr}`);
  }

  injectFromViewParentInjector(token: CompileIdentifierMetadata | string, optional: boolean):Expression {
    var method = optional ? 'getOptional' : 'get';
    return new Expression(`this.parentInjector.${method}(${codeGenDiToken(token, this.identifierStore)})`);
  }

  getElementRef(appElement: Expression):Expression {
    return new Expression(`${appElement.expression}.ref`);
  }

  getChangeDetectorRef(appElement: Expression): Expression {
    return new Expression(`${appElement.expression}.getChangeDetectorRef()`);
  }

  getViewContainerRef(appElement: Expression): Expression {
    return new Expression(`${appElement.expression}.getViewContainerRef()`);;
  }

  createTemplateRef(appElement: Expression, viewFactory: Expression): Expression {
    return new Expression(`new ${this.identifierStore.store(TEMPLATE_REF_INTERNAL_IDENTIFIER)}(${appElement.expression}, ${viewFactory.expression})`);
  }

  getNull():Expression {
    return new Expression('null');
  }

  createValueExpression(value: any):Expression {
    return new Expression(escapeValue(value));
  }

  createQueryList(query: CompileQueryMetadata, directiveInstance: Expression, propertyName: string, compileView: CompileView): Expression {
    var value = `this.${propertyName}`;
    compileView.constructorMethod.statements.push(new Statement(`${value} = new ${this.identifierStore.store(QUERY_LIST_IDENTIFIER)}();`));
    if (!query.first && isPresent(directiveInstance)) {
      compileView.constructorMethod.statements.push(new Statement(`${directiveInstance.expression}.${query.propertyName} = ${value};`));
    }
    return new Expression(value);
  }

  updateQueryListIfDirty(query: CompileQueryMetadata, directiveInstance: Expression, queryList: Expression, values: Expression[], generatedMethod: GeneratedMethod) {
    var notifyChangesStmt;
    if (query.first && isPresent(directiveInstance)) {
      notifyChangesStmt = `${directiveInstance.expression}.${query.propertyName} = ${queryList.expression}.first;`;
    } else {
      notifyChangesStmt = `${queryList.expression}.notifyOnChanges();`;
    }
    generatedMethod.statements.push(new Statement(`if (${queryList.expression}.dirty) {
      ${queryList.expression}.reset(${codeGenArray(values)});
      ${notifyChangesStmt}
    }`));
  }

  dirtyParentQueryList(queryList: Expression, view: CompileView) {
    view.dirtyParentQueriesMethod.statements.push(new Statement(`${queryList.expression}.setDirty();`));
  }

  instantiateProvider(provider: CompileProviderMetadata, deps: Expression[]):Expression {
    var providerValueExpr;
    if (isPresent(provider.useValue)) {
      if (provider.useValue instanceof CompileIdentifierMetadata) {
        providerValueExpr = this.identifierStore.store(provider.useValue);
      } else {
        providerValueExpr = escapeValue(provider.useValue);
      }
    } else if (isPresent(provider.useExisting)) {
      providerValueExpr = deps[0].expression;
    } else if (isPresent(provider.useFactory)) {
      providerValueExpr = `${this.identifierStore.store(provider.useFactory)}(${deps.map(escapeValue).join(',')})`;
    } else if (isPresent(provider.useClass)) {
      providerValueExpr = `new ${this.identifierStore.store(provider.useClass)}(${deps.map(escapeValue).join(',')})`;
    }
    return new Expression(providerValueExpr);
  }

  createProviderProperty(propName: string, providerValueExpressions: Expression[], isMulti: boolean, isEager: boolean, compileView: CompileView):Expression {
    var resolvedProviderValueExpr;
    if (isMulti) {
      resolvedProviderValueExpr = `[${providerValueExpressions.map(escapeValue).join(',')}]`;
    } else {
      resolvedProviderValueExpr = providerValueExpressions[0].expression;
    }
    if (isEager) {
      compileView.constructorMethod.statements.push(new Statement(`this.${propName} = ${resolvedProviderValueExpr};`));
    } else {
      compileView.classStatements.push(new Statement(`Object.defineProperty(${compileView.className}.prototype, ${escapeValue(propName)}, {
        get: function() {
          if (!this._${propName}) {
            this._${propName} = ${resolvedProviderValueExpr};
          }
          return this._${propName};
        }
      });`));
    }
    return new Expression(`this.${propName}`);
  }

  createViewFactory(asts: TemplateAst[],
                    templateVariableBindings:string[][], containerElement: CompileElement): CompileView {
    var embeddedTemplateIndex = this._embeddedTemplateCount++;
    var viewType = getViewType(this.component, embeddedTemplateIndex);
    var isHostView = this.component.type.isHost;
    var isComponentView = embeddedTemplateIndex === 0 && !isHostView;
    var viewFactoryName = codeGenViewFactoryName(this.component, embeddedTemplateIndex);
    var viewClassName = codeGenViewClassName(this.component, embeddedTemplateIndex);
    var view = new CompileView(this.component, viewType, embeddedTemplateIndex, viewClassName, containerElement, this);
    view.init(asts);

    var templateVarsExpr = codeGenStringMap(templateVariableBindings);

    var changeDetectorFactory = this.changeDetectorExpressions.expressions[embeddedTemplateIndex];
    var factoryArgs = [
      'parentRenderer',
      'viewManager',
      'parentInjector',
      'containerEl',
      'projectableNodes',
      'rootSelector'
    ];
    var initRenderCompTypeStmt = '';
    var rendererExpr = `parentRenderer`;
    if (embeddedTemplateIndex === 0) {
      var renderCompTypeVar = `renderType_${this.component.type.name}`;
      this.targetStatements.push(new Statement(`var ${renderCompTypeVar} = null;`));
      var stylesVar = `styles_${this.component.type.name}`;
      this.targetStatements.push(
          new Statement(`${CONST_VAR} ${stylesVar} = ${this.styles.expression};`));
      var encapsulation = this.component.template.encapsulation;
      initRenderCompTypeStmt = `if (${renderCompTypeVar} == null) {
        ${renderCompTypeVar} = viewManager.createRenderComponentType(${codeGenViewEncapsulation(encapsulation, this.identifierStore)}, ${stylesVar});
      }`;
      rendererExpr = `parentRenderer.renderComponent(${renderCompTypeVar})`;
    }

    var statement = `
    function ${viewClassName}(${factoryArgs.join(',')}) {
      var self = this;
      ${initRenderCompTypeStmt}
      var renderer = ${rendererExpr};
      ${this.identifierStore.store(APP_VIEW_IDENTIFIER)}.call(this,
        ${codeGenViewType(viewType, this.identifierStore)}, ${templateVarsExpr}, renderer, viewManager,
        parentInjector,
        projectableNodes,
        containerEl,
        ${changeDetectorFactory}()
      );
      ${this.identifierStore.store(CHECK_SLOT_COUNT_IDENTIFIER)}(${escapeValue(this.component.type.name)}, ${this.component.template.ngContentSelectors.length}, projectableNodes);
      ${isComponentView ? 'var parentRenderNode = renderer.createViewRoot(containerEl.nativeElement);' : ''}
      var variables = {};
      ${view.constructorMethod.statements.map(stmt => stmt.statement).join('\n')}

      this.init(${codeGenFlatArray(view.rootNodesOrAppElements)}, ${codeGenArray(view.renderNodes)}, ${codeGenArray(view.appDisposables)},
                ${codeGenArray(view.appElements)}, variables);

    }
    ${viewClassName}.prototype = Object.create(${this.identifierStore.store(APP_VIEW_IDENTIFIER)}.prototype);
    ${view.classStatements.map(stmt => stmt.statement).join('\n')}


    ${codeGenFnHeader(factoryArgs, viewFactoryName)}{
      return new ${viewClassName}(${factoryArgs.join(',')});
    }
`;
    this.targetStatements.push(new Statement(statement));
    view.finish(new Expression(viewFactoryName));
    return view;
  }
}

class ViewBuilderVisitor implements TemplateAstVisitor {
  boundElementCount: number = 0;

  constructor(public view: CompileView) {
  }

  private _isRootNode(parent: CompileElement): boolean {
    return parent.view !== this.view;
  }

  private _addRenderNode(renderNode: Expression, appEl: Expression, ngContentIndex: number,
                         parent: CompileElement) {
    if (this._isRootNode(parent)) {
      // store root nodes only for embedded/host views
      if (this.view.viewType !== ViewType.COMPONENT) {
        this.view.rootNodesOrAppElements.push(isPresent(appEl) ? appEl : renderNode);
      }
    } else if (isPresent(parent.component) && isPresent(ngContentIndex)) {
      parent.addContentNode(ngContentIndex, isPresent(appEl) ? appEl : renderNode);
    }
  }

  private _getParentRenderNode(parent: CompileElement): Expression {
    if (this._isRootNode(parent)) {
      if (this.view.viewType === ViewType.COMPONENT) {
        return new Expression('parentRenderNode');
      } else {
        // root node of an embedded/host view
        return null;
      }
    } else {
      return isPresent(parent.component) &&
                    parent.component.template.encapsulation !== ViewEncapsulation.Native ?
                null :
                parent.renderNode;
    }
  }

  visitBoundText(ast: BoundTextAst, parent: CompileElement): any {
    return this._visitText('', ast.ngContentIndex, parent);
  }
  visitText(ast: TextAst, parent: CompileElement): any {
    return this._visitText(ast.value, ast.ngContentIndex, parent);
  }
  private _visitText(value: string, ngContentIndex: number, parent: CompileElement) {
    var renderNode = this.view.factory.createText(
        this._getParentRenderNode(parent), this.view.renderNodes.length, value, this.view);
    this.view.renderNodes.push(renderNode);
    this._addRenderNode(renderNode, null, ngContentIndex, parent);
    return null;
  }

  visitNgContent(ast: NgContentAst, parent: CompileElement): any {
    var parentRenderNode = this._getParentRenderNode(parent);
    var nodesExpression = this.view.factory.getProjectedNodes(ast.index);
    if (isPresent(parentRenderNode)) {
      this.view.factory.appendProjectedNodes(parentRenderNode, nodesExpression,
                                        this.view);
    } else if (this._isRootNode(parent)) {
      if (this.view.viewType !== ViewType.COMPONENT) {
        // store root nodes only for embedded/host views
        this.view.rootNodesOrAppElements.push(nodesExpression);
      }
    } else {
      if (isPresent(parent.component) && isPresent(ast.ngContentIndex)) {
        parent.addContentNode(ast.ngContentIndex, nodesExpression);
      }
    }
    return null;
  }

  visitElement(ast: ElementAst, parent: CompileElement): any {
    var renderNode = this.view.factory.createElement(
        this._getParentRenderNode(parent), this.view.renderNodes.length, ast.name,
        this.view);
    this.view.renderNodes.push(renderNode);
    var htmlAttrs = visitAndReturnContext(this, ast.attrs, {});

    var component = ast.getComponent();
    var directives = [];
    var appEl = null;
    var variables: {[key:string]:CompileDirectiveMetadata} = {};
    if (ast.isBound()) {
      var boundElementIndex = this.boundElementCount++;
      ast.exportAsVars.forEach((varAst) => { variables[varAst.name] = isPresent(component) ? component: null; });
      var renderEvents: Map<string, BoundEventAst> =
          visitAndReturnContext(this, ast.outputs, new Map<string, BoundEventAst>());
      ListWrapper.forEachWithIndex(ast.directives, (directiveAst: DirectiveAst, index: number) => {
        directiveAst.visit(this, new DirectiveContext(index, boundElementIndex, renderEvents,
                                                      variables, directives));
      });

      renderEvents.forEach((eventAst, _) => {
        if (isPresent(eventAst.target)) {
          var disposable = this.view.factory.createGlobalEventListener(
              boundElementIndex, this.view.appDisposables.length, eventAst, this.view);
          this.view.appDisposables.push(disposable);
        } else {
          this.view.factory.createElementEventListener(boundElementIndex,
                                                  renderNode, eventAst, this.view);
        }
      });
      appEl = this.view.factory.createAppElement(boundElementIndex,renderNode, parent.appElement,
                                            this.view);
      this.view.appElements.push(appEl);
    }
    var attrNameAndValues = this._readAttrNameAndValues(directives, htmlAttrs);
    for (var i = 0; i < attrNameAndValues.length; i++) {
      var attrName = attrNameAndValues[i][0];
      var attrValue = attrNameAndValues[i][1];
      this.view.factory.setElementAttribute(renderNode, attrName, attrValue,
                                       this.view);
    }
    this._addRenderNode(renderNode, appEl, ast.ngContentIndex, parent);
    var compileElement = this._createCompileElement(parent, boundElementIndex, directives, renderNode, appEl, htmlAttrs, variables, component);
    compileElement.beforeChildren(null);
    templateVisitAll(this, ast.children, compileElement);
    var boundChildrenCount = this.boundElementCount - boundElementIndex - 1;
    compileElement.afterChildren(boundChildrenCount);

    StringMapWrapper.keys(variables).forEach( (varName) => {
      var valueExpr = compileElement.getVariableValue(varName, false);
      this.view.factory.setElementVariable(appEl, varName, valueExpr, this.view);
    });

    if (isPresent(component)) {
      this.view.factory.createAndSetComponentView(appEl, component, compileElement.getComponent(),
                                             compileElement.getComponentConstructorViewQueryLists(), compileElement.contentNodesByNgContentIndex,
                                             this.view);
    }
    return null;
  }

  visitEmbeddedTemplate(ast: EmbeddedTemplateAst, parent: CompileElement): any {
    var templateVariableBindings = ast.vars.map(
        varAst => [varAst.value.length > 0 ? varAst.value : IMPLICIT_TEMPLATE_VAR, varAst.name]);
    var renderNode = this.view.factory.createTemplateAnchor(
        this._getParentRenderNode(parent), this.view.renderNodes.length, this.view);
    this.view.renderNodes.push(renderNode);

    var boundElementIndex = this.boundElementCount++;
    var appEl = this.view.factory.createAppElement(boundElementIndex, renderNode,
                                              parent.appElement, this.view);
    this._addRenderNode(renderNode, appEl, ast.ngContentIndex, parent);
    this.view.appElements.push(appEl);

    var directives = [];
    ListWrapper.forEachWithIndex(ast.directives, (directiveAst: DirectiveAst, index: number) => {
      directiveAst.visit(this, new DirectiveContext(index, boundElementIndex, new Map<string, BoundEventAst>(),
                                                    {}, directives));
    });
    var compileElement = this._createCompileElement(parent, boundElementIndex, directives, renderNode, appEl, {}, {}, null);
    var embeddedView = this.view.factory.createViewFactory(ast.children, templateVariableBindings, compileElement);
    compileElement.beforeChildren(embeddedView);
    compileElement.afterChildren(0);

    return null;
  }

  visitAttr(ast: AttrAst, attrNameAndValues: {[key: string]: string}): any {
    attrNameAndValues[ast.name] = ast.value;
    return null;
  }
  visitDirective(ast: DirectiveAst, ctx: DirectiveContext): any {
    ctx.targetDirectives.push(ast.directive);
    templateVisitAll(this, ast.hostEvents, ctx.hostEventTargetAndNames);
    ast.exportAsVars.forEach(
        varAst => { ctx.targetVariableNameAndValues[varAst.name] = ast.directive; });
    return null;
  }
  visitEvent(ast: BoundEventAst, eventTargetAndNames: Map<string, BoundEventAst>): any {
    eventTargetAndNames.set(ast.fullName, ast);
    return null;
  }

  visitVariable(ast: VariableAst, ctx: any): any { return null; }
  visitDirectiveProperty(ast: BoundDirectivePropertyAst, context: any): any { return null; }
  visitElementProperty(ast: BoundElementPropertyAst, context: any): any { return null; }

  private _readAttrNameAndValues(directives: CompileDirectiveMetadata[],
                                 htmlAttrs: {[key:string]:string}): string[][] {
    directives.forEach(directiveMeta => {
      StringMapWrapper.forEach(directiveMeta.hostAttributes, (value, name) => {
        var prevValue = htmlAttrs[name];
        htmlAttrs[name] = isPresent(prevValue) ? mergeAttributeValue(name, prevValue, value) : value;
      });
    });
    return mapToKeyValueArray(htmlAttrs);
  }

  private _createCompileElement(parent: CompileElement,
      boundElementIndex:number, directives: CompileDirectiveMetadata[], renderNode: Expression, appElement: Expression,
      attrNameAndValues: {[key: string]: string},  variables: {[key:string]:CompileDirectiveMetadata}, component: CompileDirectiveMetadata):CompileElement {
    return new CompileElement(parent, this.view, directives, boundElementIndex, renderNode, appElement, attrNameAndValues, variables, component);
  }
}

class DirectiveContext {
  constructor(public index: number, public boundElementIndex: number,
              public hostEventTargetAndNames: Map<string, BoundEventAst>,
              public targetVariableNameAndValues: {[key: string]: CompileDirectiveMetadata},
              public targetDirectives: CompileDirectiveMetadata[]) {}
}

class CompileResolvedProvider {
  constructor(public token: CompileIdentifierMetadata | string,
    public multiProvider: boolean,
    public providers: CompileProviderMetadata[],
    public providerType: ViewProviderType
  ) {}
}

enum ViewProviderType {
  PublicService,
  PrivateService,
  Component,
  Directive,
  Builtin
}

function resolveDirectives(directives:CompileDirectiveMetadata[]):CompileResolvedProvider[] {
  var resolvedProviders = [];
  directives.forEach( (directive) => {
    var dirProvider = new CompileProviderMetadata({
      token: directive.type,
      useClass: directive.type
    });
    var dirResolvedProviders = resolveProviders([dirProvider], directive.isComponent ? ViewProviderType.Component : ViewProviderType.Directive);
    addAll(dirResolvedProviders, resolvedProviders);
  });

  // Note: directive providers need to be prioritized over component providers!
  var sortedDirectives = ListWrapper.clone(directives);
  for (var i=0; i<sortedDirectives.length; i++) {
    var dir = sortedDirectives[i];
    if (dir.isComponent) {
      sortedDirectives.splice(i, 1);
      sortedDirectives.push(dir);
      break;
    }
  }
  directives.forEach( (directive) => {
    addAll(resolveProviders(directive.providers, ViewProviderType.PublicService), resolvedProviders);
    addAll(resolveProviders(directive.viewProviders, ViewProviderType.PrivateService), resolvedProviders);
  });
  return resolvedProviders;
}

function resolveProviders(providers:Array<CompileProviderMetadata | CompileTypeMetadata | any[]>, providerType:ViewProviderType, providersByToken: Map<any, CompileResolvedProvider> = null):CompileResolvedProvider[] {
  if (isBlank(providersByToken)) {
    providersByToken = new Map<any, CompileResolvedProvider>();
  }
  providers.forEach( (provider) => {
    if (isArray(provider)) {
      resolveProviders(<any[]>provider, providerType, providersByToken);
    } else {
      var normalizeProvider;
      if (provider instanceof CompileProviderMetadata) {
        normalizeProvider = provider;
      } else if (provider instanceof CompileTypeMetadata) {
        normalizeProvider = new CompileProviderMetadata({
          token: provider,
          useClass: provider
        });
      } else {
        throw new BaseException(`Unknown provider type ${provider}`);
      }
      var cacheKey = diTokenCacheKey(normalizeProvider.token);
      var resolvedProvider = providersByToken.get(cacheKey);
      if (isPresent(resolvedProvider) && resolvedProvider.multiProvider !== normalizeProvider.multi) {
        // TODO: proper error reporting!
        throw new BaseException('Mixing multi and non multi provider is not possible');
      }
      if (isBlank(resolvedProvider) || !normalizeProvider.multi) {
        resolvedProvider = new CompileResolvedProvider(normalizeProvider.token, normalizeProvider.multi, [normalizeProvider], providerType);
        providersByToken.set(cacheKey, resolvedProvider);
      } else {
        resolvedProvider.providers.push(normalizeProvider);
      }
    }
  });
  return MapWrapper.values(providersByToken);
}

function normalizeProvider(provider:CompileProviderMetadata | CompileTypeMetadata | any[]):CompileProviderMetadata {
  if (provider instanceof CompileProviderMetadata) {
    return provider;
  } else if (provider instanceof CompileTypeMetadata) {
    return new CompileProviderMetadata({
      token: provider,
      useClass: provider
    });
  }
}

class GeneratedMethod {
  statements: Statement[] = [];
  constructor() {}
}

class CompileView {
  public viewFactory: Expression;
  public boundElements: CompileElement[] = [];
  public viewQueries: CompileQuery[];

  public renderNodes: Expression[] = [];
  public appElements: Expression[] = [];
  public appDisposables: Expression[] = [];
  public rootNodesOrAppElements: Expression[] = [];

  public classStatements: Statement[] = [];
  public constructorMethod = new GeneratedMethod();
  public injectMethod = new GeneratedMethod();
  public injectPrivateMethod = new GeneratedMethod();
  public updateContentQueriesMethod = new GeneratedMethod();
  public dirtyParentQueriesMethod = new GeneratedMethod();

  public componentView: CompileView;

  constructor(public component: CompileDirectiveMetadata, public viewType: ViewType, public embeddedTemplateIndex: number, public className: string, public containerElement: CompileElement, public factory: CodeGenViewFactory) {
    if (this.viewType === ViewType.COMPONENT || this.viewType === ViewType.HOST) {
      this.componentView = this;
    } else {
      this.componentView = this.containerElement.view.componentView;
    }
  }

  init(template: TemplateAst[]) {
    var viewQueries = [];
    this.factory.createPipes(this);
    if (this.viewType === ViewType.COMPONENT) {
      // TODO: move to factory!
      var directiveInstance = new Expression('this.context');
      this.component.viewQueries.forEach( (queryMeta) => {
        var propName =  `viewQuery_${tokenName(queryMeta.selectors[0])}_${viewQueries.length}`;
        var queryList = this.factory.createQueryList(queryMeta, directiveInstance, propName, this);
        var query = new CompileQuery(queryMeta, queryList, directiveInstance, this)
        viewQueries.push(query);
      });
      var constructorViewQueryCount = 0;
      this.component.type.diDeps.forEach( (dep) => {
        if (isPresent(dep.viewQuery)) {
          var queryList = this.factory.getConstructorViewQueryList(constructorViewQueryCount++);
          var query = new CompileQuery(dep.viewQuery, queryList, directiveInstance, this)
          viewQueries.push(query);
        }
      });
    }
    this.viewQueries = viewQueries;

    var visitor = new ViewBuilderVisitor(this);
    templateVisitAll(visitor, template, this.containerElement.isNull() ? this.containerElement : this.containerElement.parent);

    var updateViewQueriesMethod = new GeneratedMethod();
    this.viewQueries.forEach( (query) => {
      query.afterChildren(updateViewQueriesMethod);
    });
    this.factory.createUpdateViewQueriesMethod(updateViewQueriesMethod, this);
    this.factory.createUpdateContentQueriesMethod(this.updateContentQueriesMethod, this);
    this.factory.createDirtyParentQueriesMethod(this.dirtyParentQueriesMethod, this);

    this.factory.createInjectInternalMethod(this.injectMethod, this);
    this.factory.createInjectPrivateInternalMethod(this.injectPrivateMethod, this);
  }

  finish(viewFactory: Expression) {
    this.viewFactory = viewFactory;
  }
}

class CompileQueryValue {
  constructor(public value: Expression, public view: CompileView) {}
}

class ViewQueryValues {
  constructor(public view: CompileView, public values: Array<Expression | ViewQueryValues>) {}
}

class CompileQuery {
  private _values: ViewQueryValues;

  constructor(public meta: CompileQueryMetadata, public queryList: Expression, public ownerDirectiveExpression: Expression, public view: CompileView) {
    this._values = new ViewQueryValues(view, []);
  }

  isFull():boolean {
    return this.meta.first && this._values.values.length > 0;
  }

  addValue(value: Expression, view: CompileView) {
    var viewValues = this._values;
    var viewDistance = 0;
    var currentView = view;
    while (isPresent(currentView) && currentView !== this.view) {
      var last = viewValues.values.length > 0 ? viewValues.values[viewValues.values.length-1] : null;
      if (last instanceof ViewQueryValues && last.view === currentView) {
        viewValues = last;
      } else {
        var newViewValues = new ViewQueryValues(currentView, []);
        viewValues.values.push(newViewValues);
        viewValues = newViewValues;
      }
      currentView = currentView.containerElement.embeddedView;
      viewDistance++;
    }
    viewValues.values.push(value);

    if (viewDistance > 0) {
      var queryListForDirtyExpr = this.queryList;
      for (var i=0; i<viewDistance; i++) {
        queryListForDirtyExpr = this.view.factory.getViewParentProperty(queryListForDirtyExpr);
      }
      this.view.factory.dirtyParentQueryList(queryListForDirtyExpr, view);
    }
  }

  afterChildren(generatedMethod:GeneratedMethod) {
    var values = createQueryValues(this._values);
    this.view.factory.updateQueryListIfDirty(this.meta, this.ownerDirectiveExpression, this.queryList, values, generatedMethod);
  }
}

function createQueryValues(viewValues:ViewQueryValues):Expression[] {
  return ListWrapper.flatten(viewValues.values.map( (entry) => {
    if (entry instanceof ViewQueryValues) {
      return entry.view.factory.mapNestedViews(entry.view.containerElement.appElement, entry.view.className, createQueryValues(entry));
    } else {
      return <Expression>entry;
    }
  }));
}

class CompileElement {
  static createNull(): CompileElement {
    return new CompileElement(null, null, [], null, null, null, {}, {}, null);
  }

  private _resolvedProviders: CompileResolvedProvider[];
  private _instances = new Map<any, Expression>();
  private _providerByToken = new Map<any, CompileResolvedProvider>();
  private _queries: CompileQuery[] = [];

  public contentNodesByNgContentIndex: Array<Expression>[];

  public boundChildrenCount: number;
  public embeddedView: CompileView;

  private _componentConstructorViewQueryLists: Expression[] = [];

  constructor(public parent: CompileElement, public view: CompileView,
      private _directives: CompileDirectiveMetadata[], public boundElementIndex:number, public renderNode: Expression, public appElement: Expression,
      public attrNameAndValues: {[key: string]: string},  private _variableDirectives: {[key:string]:CompileDirectiveMetadata}, public component: CompileDirectiveMetadata) {
    if (isPresent(appElement)) {
      this.view.boundElements.push(this);
    }
    if (isBlank(appElement)) {
      appElement = this._findClosestAppElement();
    }
    if (isPresent(component)) {
      this.contentNodesByNgContentIndex =
          ListWrapper.createFixedSize(component.template.ngContentSelectors.length);
      for (var i = 0; i < this.contentNodesByNgContentIndex.length; i++) {
        this.contentNodesByNgContentIndex[i] = [];
      }
    } else {
      this.contentNodesByNgContentIndex = null;
    }
    this._resolvedProviders = resolveDirectives(_directives);
  }

  private _findClosestAppElement():Expression {
    var compileEl:CompileElement = this;
    while (isPresent(compileEl) && isBlank(compileEl.appElement)) {
      compileEl = compileEl.parent;
    }
    return isPresent(compileEl) ? compileEl.appElement : null;
  }

  private _getQueriesFor(token: CompileIdentifierMetadata | string):CompileQuery[] {
    var result = [];
    var currentEl:CompileElement = this;
    var distance = 0;
    while (!currentEl.isNull()) {
      currentEl._queries.forEach( (query) => {
        query.meta.selectors.forEach( (selector) => {
          if (tokenEqual(selector, token) && (query.meta.descendants || distance <= 1 && !query.isFull())) {
            result.push(query);
          }
        });
      });
      currentEl = currentEl.parent;
      distance++;
    }
    this.view.componentView.viewQueries.forEach( (query) => {
      query.meta.selectors.forEach( (selector) => {
        if (tokenEqual(selector, token) && !query.isFull()) {
          result.push(query);
        }
      });
    });
    return result;
  }

  private _addQuery(queryMeta: CompileQueryMetadata, directiveInstance: Expression):CompileQuery {
    var propName =  `query_${tokenName(queryMeta.selectors[0])}_${this.boundElementIndex}_${this._queries.length}`;
    var queryList = this.view.factory.createQueryList(queryMeta, directiveInstance, propName, this.view);
    var query = new CompileQuery(queryMeta, queryList, directiveInstance, this.view);
    this._queries.push(query);
    return query;
  }

  beforeChildren(embeddedView: CompileView) {
    this.embeddedView = embeddedView;
    if (isPresent(embeddedView)) {
      addAll(resolveProviders([new CompileProviderMetadata({
        token: TEMPLATE_REF_IDENTIFIER, useValue: this.view.factory.createTemplateRef(this.appElement, this.embeddedView.viewFactory)
      })], ViewProviderType.Builtin), this._resolvedProviders);
    }
    this._resolvedProviders.forEach((resolvedProvider) => {
      this._providerByToken.set(diTokenCacheKey(resolvedProvider.token), resolvedProvider);
    });
    var directiveInstances = this._directives.map( (directive) => this._getOrCreate(ViewProviderType.Directive, directive.type, true) );
    for (var i=0; i<directiveInstances.length; i++) {
      var directiveInstance = directiveInstances[i];
      var directive = this._directives[i];
      this.view.factory.assignDirectiveToChangeDetector(directiveInstance, this.boundElementIndex, i, this.view);
      directive.queries.forEach( (queryMeta) => {
        this._addQuery(queryMeta, directiveInstance);
      });
    }
    this._resolvedProviders.forEach( (resolvedProvider) => {
      var queriesForProvider = this._getQueriesFor(resolvedProvider.token);
      if (queriesForProvider.length > 0) {
        var providerExpr = this._instances.get(diTokenCacheKey(resolvedProvider.token));
        if (isBlank(providerExpr)) {
          providerExpr = this._getOrCreate(resolvedProvider.providerType, resolvedProvider.token, true);
        }
        queriesForProvider.forEach( (query) => {
          query.addValue(providerExpr, this.view);
        });
      }
    });
    StringMapWrapper.forEach(this._variableDirectives, (_, varName) => {
      var queriesForProvider = this._getQueriesFor(varName);
      var varValue = this.getVariableValue(varName, true);
      queriesForProvider.forEach( (query) => {
        query.addValue(varValue, this.view);
      });
    });
  }

  afterChildren(boundChildrenCount: number) {
    this.boundChildrenCount = boundChildrenCount;

    this._resolvedProviders.forEach( (resolvedProvider) => {
      var providerExpr = this._instances.get(diTokenCacheKey(resolvedProvider.token));
      if (isBlank(providerExpr)) {
        // Create all non instantiated providers as lazy providers
        providerExpr = this._getOrCreate(resolvedProvider.providerType, resolvedProvider.token, false);
      }

      // Note: afterChildren is called after recursing into children.
      // This is good so that an injector match in an element that is closer to a requesting element
      // matches first.
      if (resolvedProvider.providerType !== ViewProviderType.PrivateService) {
        this.view.factory.createInjectInternalCondition(this.boundElementIndex, boundChildrenCount, resolvedProvider, providerExpr, this.view.injectMethod);
      }
      if (resolvedProvider.providerType === ViewProviderType.PrivateService || resolvedProvider.providerType === ViewProviderType.Component) {
        this.view.factory.createInjectInternalCondition(this.boundElementIndex, 0, resolvedProvider, providerExpr, this.view.injectPrivateMethod);
      }
    });

    this._queries.forEach( (query) => {
      query.afterChildren(this.view.updateContentQueriesMethod);
    });
  }

  isNull():boolean {
    return isBlank(this.renderNode);
  }

  isRootElement():boolean {
    return this.view != this.parent.view;
  }

  addContentNode(ngContentIndex: number, nodeExpr: Expression) {
    this.contentNodesByNgContentIndex[ngContentIndex].push(nodeExpr);
  }

  getVariableValue(name: string, forQuery: boolean): Expression {
    var directive = this._variableDirectives[name];
    if (isPresent(directive)) {
      return this._instances.get(diTokenCacheKey(directive.type));
    } else {
      return forQuery ? this.appElement : this.renderNode;
    }
  }

  getComponent():Expression {
    return isPresent(this.component) ? this._instances.get(diTokenCacheKey(this.component.type)) : null;
  }

  getComponentConstructorViewQueryLists():Expression[] {
    return isPresent(this.component) ? this._componentConstructorViewQueryLists : null;
  }

  private _getOrCreate(requestingProviderType: ViewProviderType, token: CompileIdentifierMetadata | string, eager: boolean):Expression {
    var cacheKey = diTokenCacheKey(token);
    var resolvedProvider = this._providerByToken.get(cacheKey);
    if (isBlank(resolvedProvider) ||
        ((requestingProviderType === ViewProviderType.Directive || requestingProviderType === ViewProviderType.PublicService) && resolvedProvider.providerType === ViewProviderType.PrivateService) ||
        (requestingProviderType === ViewProviderType.PrivateService && resolvedProvider.providerType !== ViewProviderType.PrivateService &&  resolvedProvider.providerType !== ViewProviderType.Component) ||
        ((requestingProviderType === ViewProviderType.PrivateService || requestingProviderType === ViewProviderType.PublicService) && resolvedProvider.providerType === ViewProviderType.Builtin)) {
          return null;
        }
    var instance = this._instances.get(cacheKey);
    if (isPresent(instance)) {
      return instance;
    }
    var providerValueExpressions = resolvedProvider.providers.map( (provider) => {
      var depsExpr;
      if (isPresent(provider.useValue)) {
        depsExpr = [];
      } else if (isPresent(provider.useExisting)) {
        depsExpr = [this._getDependency(resolvedProvider.providerType, new CompileDiDependencyMetadata({token: provider.useExisting}), eager)];
      } else if (isPresent(provider.useFactory)) {
        var deps = isPresent(provider.deps) ? provider.deps : provider.useFactory.diDeps;
        depsExpr = deps.map( (dep) => this._getDependency(resolvedProvider.providerType, dep, eager) );
      } else if (isPresent(provider.useClass)) {
        var deps = isPresent(provider.deps) ? provider.deps : provider.useClass.diDeps;
        depsExpr = deps.map( (dep) => this._getDependency(resolvedProvider.providerType, dep, eager) );
      }
      return this.view.factory.instantiateProvider(provider, depsExpr);
    });
    var propName = `inj_${tokenName(resolvedProvider.token)}_${this.boundElementIndex}_${this._instances.size}`;
    instance = this.view.factory.createProviderProperty(propName, providerValueExpressions, resolvedProvider.multiProvider, eager, this.view);
    this._instances.set(cacheKey, instance);
    return instance;
  }

  private _getDependency(requestingProviderType: ViewProviderType, dep:CompileDiDependencyMetadata, eager:boolean = null):Expression {
    var result = null;

    // access attributes
    if (dep.isAttribute) {
      var attrValue = this.attrNameAndValues[<string> dep.token];
      result = isPresent(attrValue) ? this.view.factory.createValueExpression(attrValue) : this.view.factory.getNull();
    }
    // constructor content query
    if (isBlank(result) && isPresent(dep.query)) {
      result = this._addQuery(dep.query, null).queryList;
    }

    // constructor view query
    if (isBlank(result) && isPresent(dep.viewQuery)) {
      var propName = `constrViewQuery_${tokenName(dep.viewQuery.selectors[0])}_${this.boundElementIndex}_${this._componentConstructorViewQueryLists.length}`;
      result = this.view.factory.createQueryList(dep.viewQuery, null, null, this.view);
      this._componentConstructorViewQueryLists.push(result);
    }

    // access providers on this element
    if (isBlank(result) && !dep.isSkipSelf) {
      result = this._getOrCreate(requestingProviderType, dep.token, eager);
    }
    // access the injector
    if (isBlank(result) && dep.token instanceof CompileIdentifierMetadata) {
      var tokenId = <CompileIdentifierMetadata> dep.token;
      // TODO: do a better class check...
      if (tokenId.name == 'IInjector') {
        if (requestingProviderType === ViewProviderType.Component) {
          result = this.view.factory.getComponentInjector(this.appElement);
        } else if (requestingProviderType === ViewProviderType.PrivateService) {
          result = this.view.factory.getComponentViewInjector(this.appElement);
        } else {
          result = this.view.factory.getDefaultInjector(this.appElement);
        }
      }
    }
    // access builtints
    if (isBlank(result) && (requestingProviderType === ViewProviderType.Directive || requestingProviderType === ViewProviderType.Component)) {
      // TODO: do a better class check...
      if (tokenId.name == 'Renderer') {
        result = this.view.factory.getRenderer(this.appElement);
      } else if (tokenId.name == 'ElementRef') {
        result = this.view.factory.getElementRef(this.appElement);
      } else if (tokenId.name == 'ChangeDetectorRef') {
        result = this.view.factory.getChangeDetectorRef(this.appElement);
      } else if (tokenId.name == 'ViewContainerRef') {
        result = this.view.factory.getViewContainerRef(this.appElement);
      }
    }
    // check @Self restriction
    if (isBlank(result) && dep.isSelf) {
      result = this._createNullOrThrow(dep.isOptional, `This element has no token ${dep.token}`);
    }
    // access parents
    if (isBlank(result) && !this.parent.isNull()) {
      result = this.parent._getDependency(ViewProviderType.PublicService, new CompileDiDependencyMetadata({
        isOptional: dep.isOptional,
        isHost: dep.isHost,
        token: dep.token
      }), eager && this.view === this.parent.view);
      if (this.isRootElement()) {
        result = this.view.factory.getViewParentProperty(result);
      }
    }
    // check @Host restriction
    if (isBlank(result) && dep.isHost) {
      var comp = this.view.component;
      var viewProviders = resolveProviders(comp.viewProviders, ViewProviderType.PrivateService, new Map<any, CompileResolvedProvider>());
      var isProvided = tokenEqual(comp.type, dep.token) || viewProviders.some( (provider) => tokenEqual(provider.token, dep.token));
      if (!isProvided) {
        result = this._createNullOrThrow(dep.isOptional, `This component has no provider for ${dep.token}`);
      }
    }
    // access parent view (accross component boundary)
    if (isBlank(result)) {
      result = this.view.factory.injectFromViewParentInjector(dep.token, dep.isOptional);
    }
    return result;
  }

  private _createNullOrThrow(optional: boolean, errorMsg):Expression {
    if (optional) {
      return this.view.factory.getNull();
    } else {
      // TODO: correct error handling
      throw new BaseException(errorMsg);
    }
  }
}

function visitAndReturnContext(visitor: TemplateAstVisitor, asts: TemplateAst[],
                               context: any): any {
  templateVisitAll(visitor, asts, context);
  return context;
}

function mergeAttributeValue(attrName: string, attrValue1: string, attrValue2: string): string {
  if (attrName == CLASS_ATTR || attrName == STYLE_ATTR) {
    return `${attrValue1} ${attrValue2}`;
  } else {
    return attrValue2;
  }
}

function mapToKeyValueArray(data: {[key: string]: string}): string[][] {
  var entryArray = [];
  StringMapWrapper.forEach(data, (value, name) => { entryArray.push([name, value]); });
  // We need to sort to get a defined output order
  // for tests and for caching generated artifacts...
  ListWrapper.sort(entryArray, (entry1, entry2) => StringWrapper.compare(entry1[0], entry2[0]));
  var keyValueArray = [];
  entryArray.forEach((entry) => { keyValueArray.push([entry[0], entry[1]]); });
  return keyValueArray;
}

function codeGenEventHandler(view: Expression, boundElementIndex: number,
                             eventName: string): string {
  return codeGenValueFn(
      ['event'],
      `${view.expression}.triggerEventHandlers(${escapeValue(eventName)}, event, ${boundElementIndex})`);
}

function codeGenViewFactoryName(component: CompileDirectiveMetadata,
                                embeddedTemplateIndex: number): string {
  return `viewFactory_${component.type.name}${embeddedTemplateIndex}`;
}

function codeGenViewClassName(component: CompileDirectiveMetadata,
                                embeddedTemplateIndex: number): string {
  return `View_${component.type.name}${embeddedTemplateIndex}`;
}

function codeGenViewEncapsulation(value: ViewEncapsulation, identifierStore: IdentifierStore): string {
  if (IS_DART) {
    var identifier = new CompileIdentifierMetadata({
      name: `${value}`,
      moduleUrl: METADATA_MODULE_URL,
      runtime: value
    });
    return identifierStore.store(identifier);
  } else {
    return `${value}`;
  }
}

function getViewType(component: CompileDirectiveMetadata, embeddedTemplateIndex: number): ViewType {
  if (embeddedTemplateIndex > 0) {
    return ViewType.EMBEDDED;
  } else if (component.type.isHost) {
    return ViewType.HOST;
  } else {
    return ViewType.COMPONENT;
  }
}

function codeGenViewType(value: ViewType, identifierStore: IdentifierStore): string {
  if (IS_DART) {
    var identifier = new CompileIdentifierMetadata({
      name: `${value}`,
      moduleUrl: VIEW_TYPE_MODULE_URL,
      runtime: value
    });
    return identifierStore.store(identifier);
  } else {
    return `${value}`;
  }
}

function codeGenProviderType(value: ViewProviderType, identifierStore: IdentifierStore): string {
  if (IS_DART) {
    var identifier = new CompileIdentifierMetadata({
      name: `${value}`,
      moduleUrl: VIEW_TYPE_MODULE_URL,
      runtime: value
    });
    return identifierStore.store(identifier);
  } else {
    return `${value}`;
  }
}

function codeGenDiToken(token: CompileIdentifierMetadata | string, identifierStore: IdentifierStore): string {
  if (isString(token)) {
    return escapeValue(token);
  } else {
    return identifierStore.store(<CompileIdentifierMetadata>token);
  }
}

function diTokenCacheKey(token: CompileIdentifierMetadata | string):any {
  if (isString(token)) {
    return token;
  } else {
    var identifier = <CompileIdentifierMetadata> token;
    return isPresent(identifier.runtime) ? identifier.runtime : `${identifier.name}|${identifier.moduleUrl}`;
  }
}

function tokenEqual(token1: CompileIdentifierMetadata | string, token2: CompileIdentifierMetadata | string):boolean {
  return diTokenCacheKey(token1) == diTokenCacheKey(token2);
}

function tokenName(token: CompileIdentifierMetadata | string): string {
  return isString(token) ? <string>token : (<CompileIdentifierMetadata>token).name;
}