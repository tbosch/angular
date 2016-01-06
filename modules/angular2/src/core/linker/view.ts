import {
  ListWrapper,
  MapWrapper,
  Map,
  StringMapWrapper,
} from 'angular2/src/facade/collection';
import {
  ChangeDetector,
  ChangeDispatcher,
  DirectiveIndex,
  BindingTarget,
  Locals,
  ChangeDetectorRef
} from 'angular2/src/core/change_detection/change_detection';
import {DebugContext} from 'angular2/src/core/change_detection/interfaces';

import {IInjector} from 'angular2/src/core/di';
import {AppElement} from './element';
import {
  isPresent,
  isBlank,
  Type,
  isArray,
  isNumber,
  CONST,
  CONST_EXPR
} from 'angular2/src/facade/lang';
import {BaseException, WrappedException} from 'angular2/src/facade/exceptions';
import {Renderer, RootRenderer} from 'angular2/src/core/render/api';
import {ViewRef_, HostViewFactoryRef} from './view_ref';
import {ProtoPipes} from 'angular2/src/core/pipes/pipes';
import {camelCaseToDashCase} from 'angular2/src/core/render/util';
import {ElementRef, ElementRef_} from './element_ref';
import {TemplateRef} from './template_ref';
import {ViewContainerRef} from './view_container_ref';

export {DebugContext} from 'angular2/src/core/change_detection/interfaces';
import {AppViewManager_, AppViewManager} from './view_manager';
import {ViewType} from './view_type';

const REFLECT_PREFIX: string = 'ng-reflect-';

const EMPTY_CONTEXT = CONST_EXPR(new Object());

/**
 * Cost of making objects: http://jsperf.com/instantiate-size-of-object
 *
 */
export abstract class AppView implements ChangeDispatcher {
  ref: ViewRef_;
  rootNodesOrAppElements: any[];
  allNodes: any[];
  disposables: Function[];
  appElements: AppElement[];

  /**
   * The context against which data-binding expressions in this view are evaluated against.
   * This is always a component instance.
   */
  context: any = null;

  /**
   * Variables, local to this view, that can be used in binding expressions (in addition to the
   * context). This is used for thing like `<video #player>` or
   * `<li template="for #item of items">`, where "player" and "item" are locals, respectively.
   */
  locals: Locals;

  destroyed: boolean = false;

  constructor(public type: ViewType, public templateVariableBindings: {[key: string]: string},
              public renderer: Renderer,
              public viewManager: AppViewManager_,
              public parentInjector: IInjector,
              public projectableNodes: Array<any | any[]>,
              public containerAppElement: AppElement,
              public changeDetector: ChangeDetector) {
    this.ref = new ViewRef_(this);
    // TODO: pass in all AppProtoElements here!
    // TODO: create all injectors here!
    // TODO: per injector, add the builtins as tokens as well!
    var context;
    switch (this.type) {
      case ViewType.COMPONENT:
        context = this.containerAppElement.getComponent();
        break;
      case ViewType.EMBEDDED:
        context = this.containerAppElement.parentView.context;
        break;
      case ViewType.HOST:
        context = EMPTY_CONTEXT;
        break;
    }
    this.context = context;
    this.dirtyParentQueriesInternal();
  }

  init(rootNodesOrAppElements: any[], allNodes: any[], disposables: Function[],
       appElements: AppElement[], variables: {[key: string]: any}) {
    this.rootNodesOrAppElements = rootNodesOrAppElements;
    this.allNodes = allNodes;
    this.disposables = disposables;
    this.appElements = appElements;

    var localsMap = new Map<string, any>();
    StringMapWrapper.forEach(variables, (value, key) => {
      localsMap.set(key, value);
    });
    var parentLocals = null;
    if (this.type !== ViewType.COMPONENT) {
      parentLocals =
          isPresent(this.containerAppElement) ? this.containerAppElement.parentView.locals : null;
    }
    if (this.type === ViewType.COMPONENT) {
      // Note: the render nodes have been attached to their host element
      // in the ViewFactory already.
      this.containerAppElement.attachComponentView(this);
      this.containerAppElement.parentView.changeDetector.addViewChild(this.changeDetector);
    }
    this.locals = new Locals(parentLocals, localsMap);
    this.changeDetector.hydrate(this.context, this.locals, this, null);
    this.viewManager.onViewCreated(this);
  }

  getVariable(boundElementIndex:number, varName: string):any {
    // TODO needed for Query
  }

  abstract injectInternal(token: any, boundElementIndex: number):any;

  inject(token: any, boundElementIndex:number):any {
    return this.injectInternal(token, boundElementIndex);
  }

  abstract injectPrivateInternal(token: any, boundElementIndex: number): any;

  injectPrivate(token: any, boundElementIndex: number):any {
    return this.injectPrivateInternal(token, boundElementIndex);
  }

  destroy() {
    if (this.destroyed) {
      throw new BaseException('This view has already been destroyed!');
    }
    this.changeDetector.destroyRecursive();
  }

  notifyOnDestroy() {
    this.destroyed = true;
    var hostElement =
        this.type === ViewType.COMPONENT ? this.containerAppElement.nativeElement : null;
    this.renderer.destroyView(hostElement, this.allNodes);
    for (var i = 0; i < this.disposables.length; i++) {
      this.disposables[i]();
    }
    this.viewManager.onViewDestroyed(this);
    this.dirtyParentQueriesInternal();
  }

  get changeDetectorRef(): ChangeDetectorRef { return this.changeDetector.ref; }

  get flatRootNodes(): any[] { return flattenNestedViewRenderNodes(this.rootNodesOrAppElements); }

  hasLocal(contextName: string): boolean {
    return StringMapWrapper.contains(this.templateVariableBindings, contextName);
  }

  setLocal(contextName: string, value: any): void {
    if (!this.hasLocal(contextName)) {
      return;
    }
    var templateName = this.templateVariableBindings[contextName];
    this.locals.set(templateName, value);
  }

  // dispatch to element injector or text nodes based on context
  notifyOnBinding(b: BindingTarget, currentValue: any): void {
    var nativeNode = this.allNodes[b.nodeIndex];
    if (b.isTextNode()) {
      this.renderer.setText(nativeNode, currentValue);
    } else {
      if (b.isElementProperty()) {
        this.renderer.setElementProperty(nativeNode, b.name, currentValue);
      } else if (b.isElementAttribute()) {
        this.renderer.setElementAttribute(nativeNode, b.name,
                                          isPresent(currentValue) ? `${currentValue}` : null);
      } else if (b.isElementClass()) {
        this.renderer.setElementClass(nativeNode, b.name, currentValue);
      } else if (b.isElementStyle()) {
        var unit = isPresent(b.unit) ? b.unit : '';
        this.renderer.setElementStyle(nativeNode, b.name,
                                      isPresent(currentValue) ? `${currentValue}${unit}` : null);
      } else {
        throw new BaseException('Unsupported directive record');
      }
    }
  }

  logBindingUpdate(b: BindingTarget, value: any): void {
    if (b.isDirective() || b.isElementProperty()) {
      var nativeElement = this.appElements[b.nodeIndex].nativeElement;
      this.renderer.setBindingDebugInfo(
          nativeElement, `${REFLECT_PREFIX}${camelCaseToDashCase(b.name)}`, `${value}`);
    }
  }

  notifyAfterContentChecked(): void {
    this.updateContentQueriesInternal();
  }

  abstract updateContentQueriesInternal(): void;

  notifyAfterViewChecked(): void {
    this.updateViewQueriesInternal();
  }

  abstract updateViewQueriesInternal(): void;

  notifyAfterMove(): void {
    this.dirtyParentQueriesInternal();
  }

  abstract dirtyParentQueriesInternal(): void;

  getDebugContext(appElement: AppElement, elementIndex: number,
                  directiveIndex: number): DebugContext {
    try {
      if (isBlank(appElement) && elementIndex < this.appElements.length) {
        appElement = this.appElements[elementIndex];
      }
      var container = this.containerAppElement;

      var element = isPresent(appElement) ? appElement.nativeElement : null;
      var injector = isPresent(appElement) ? appElement.getDefaultInjector() : null;
      var componentElement = isPresent(container) ? container.nativeElement : null;

      return new DebugContext(element, componentElement, this.context,
                              _localsToStringMap(this.locals), injector);

    } catch (e) {
      // TODO: vsavkin log the exception once we have a good way to log errors and warnings
      // if an error happens during getting the debug context, we return null.
      return null;
    }
  }

  getDetectorFor(directive: DirectiveIndex): any {
    var componentView = this.appElements[directive.elementIndex].componentView;
    return isPresent(componentView) ? componentView.changeDetector : null;
  }

  /**
   * Triggers the event handlers for the element and the directives.
   *
   * This method is intended to be called from directive EventEmitters.
   *
   * @param {string} eventName
   * @param {*} eventObj
   * @param {number} boundElementIndex
   * @return false if preventDefault must be applied to the DOM event
   */
  triggerEventHandlers(eventName: string, eventObj: Event, boundElementIndex: number): boolean {
    return this.changeDetector.handleEvent(eventName, boundElementIndex, eventObj);
  }
}

function _localsToStringMap(locals: Locals): {[key: string]: any} {
  var res = {};
  var c = locals;
  while (isPresent(c)) {
    res = StringMapWrapper.merge(res, MapWrapper.toStringMap(c.current));
    c = c.parent;
  }
  return res;
}

@CONST()
export class HostViewFactory {
  constructor(public selector: string, public viewFactory: Function) {}
}

export function flattenNestedViewRenderNodes(nodes: any[]): any[] {
  return _flattenNestedViewRenderNodes(nodes, []);
}

function _flattenNestedViewRenderNodes(nodes: any[], renderNodes: any[]): any[] {
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (node instanceof AppElement) {
      var appEl = <AppElement>node;
      renderNodes.push(appEl.nativeElement);
      if (isPresent(appEl.nestedViews)) {
        for (var k = 0; k < appEl.nestedViews.length; k++) {
          _flattenNestedViewRenderNodes(appEl.nestedViews[k].rootNodesOrAppElements, renderNodes);
        }
      }
    } else {
      renderNodes.push(node);
    }
  }
  return renderNodes;
}

export function checkSlotCount(componentName: string, expectedSlotCount: number,
                               projectableNodes: any[][]): void {
  var givenSlotCount = isPresent(projectableNodes) ? projectableNodes.length : 0;
  if (givenSlotCount < expectedSlotCount) {
    throw new BaseException(
        `The component ${componentName} has ${expectedSlotCount} <ng-content> elements,` +
        ` but only ${givenSlotCount} slots were provided.`);
  }
}
