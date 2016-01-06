import {
  isPresent,
  isBlank,
  Type
} from 'angular2/src/facade/lang';

import {IInjector} from 'angular2/src/core/di';
import {BaseException} from 'angular2/src/facade/exceptions';

import {AppView} from './view';
import {ViewType} from './view_type';
import {ElementRef_} from './element_ref';

import {ViewContainerRef} from './view_container_ref';
import {ElementRef} from './element_ref';
import {Renderer} from 'angular2/src/core/render/api';
import {
  ChangeDetector,
  ChangeDetectorRef
} from 'angular2/src/core/change_detection/change_detection';

import {ViewContainerRef_} from "./view_container_ref";
import {QueryList} from './query_list';

class _Context {
  constructor(public element: any, public componentElement: any, public injector: any) {}
}

export class AppElement implements ElementRef {
  public nestedViews: AppView[] = null;
  public componentView: AppView = null;

  public ref: ElementRef_;
  public component: any;
  public componentConstructorViewQueries: QueryList<any>[];

  constructor(public index:number, public parentView: AppView, public parent: AppElement,
              public nativeElement: any) {
    this.ref = new ElementRef_(this);
  }

  attachComponentView(componentView: AppView) { this.componentView = componentView; }

  private _debugContext(): any {
    var c = this.parentView.getDebugContext(this, null, null);
    return isPresent(c) ? new _Context(c.element, c.componentElement, c.injector) : null;
  }

  getComponent(): any { return this.component; }

  getElementRef(): ElementRef { return this.ref; }

  getViewContainerRef(): ViewContainerRef { return new ViewContainerRef_(this); }

  getChangeDetectorRef(): ChangeDetectorRef {
    return new _DelegatingChangeDetectorRef(this);
  }

  getDefaultInjector(): IInjector {
    return new ElementInjector(this, false, true);
  }

  getComponentViewInjector(): IInjector {
    return new ElementInjector(this, true, false);
  }

  getComponentInjector(): IInjector {
    return new ElementInjector(this, true, true);
  }

  getEmbeddedViewInjector(): IInjector {
    return new ElementInjector(this, false, false);
  }

  mapNestedViews(nestedViewClass: Type, callback:Function):any[] {
    var result = [];
    if (isPresent(this.nestedViews)) {
      this.nestedViews.forEach( (nestedView) => {
        if (nestedView instanceof nestedViewClass) {
          result.push(callback(nestedView));
        }
      });
    }
    return result;
  }
}

class _DelegatingChangeDetectorRef extends ChangeDetectorRef {
  constructor(private _appElement: AppElement) { super(); }

  _getView():AppView {
    if (isPresent(this._appElement.componentView)) {
      return this._appElement.componentView;
    } else {
      return this._appElement.parentView;
    }
  }

  markForCheck(): void { this._getView().changeDetector.ref.markForCheck(); }
  detach(): void { this._getView().changeDetector.ref.detach(); }
  detectChanges(): void { this._getView().changeDetector.ref.detectChanges(); }
  checkNoChanges(): void { this._getView().changeDetector.ref.checkNoChanges(); }
  reattach(): void { this._getView().changeDetector.ref.reattach(); }
}

class ElementInjector implements IInjector {
  constructor(private _appElement: AppElement, private _readPrivate: boolean, private _readPublic: boolean) {}
  get(token: any):any {
    var result = this.getOptional(token);
    if (isBlank(result)) {
      // TODO: proper error handling!
      throw new BaseException(`Not found: ${token}}`);
    }
    return result;
  }
  getOptional(token: any): any {
    var result;
    if (this._readPrivate) {
      result = this._appElement.parentView.injectPrivate(token, this._appElement.index);
    }
    if (isBlank(result) && this._readPublic) {
      result = this._appElement.parentView.inject(token, this._appElement.index);
    }
    if (isBlank(result) && !this._readPublic && isPresent(this._appElement.parent)) {
      result = this._appElement.parentView.inject(token, this._appElement.parent.index);
    }
    if (isBlank(result)) {
      return this._appElement.parentView.parentInjector.getOptional(token);
    }
    return result;
  }
}
