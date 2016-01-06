import {isPresent} from 'angular2/src/facade/lang';
import {BaseException} from 'angular2/src/facade/exceptions';
import {ListWrapper, MapWrapper} from 'angular2/src/facade/collection';

export class Locals {
  constructor(public parent: Locals, public current: Map<any, any>) {}

  contains(name: string): boolean {
    if (this.current.has(name)) {
      return true;
    }

    if (isPresent(this.parent)) {
      return this.parent.contains(name);
    }

    return false;
  }

  get(name: string): any {
    if (this.current.has(name)) {
      return this.current.get(name);
    }

    if (isPresent(this.parent)) {
      return this.parent.get(name);
    }

    throw new BaseException(`Cannot find '${name}'`);
  }

  set(name: string, value: any): void {
    this.current.set(name, value);
  }

  clearLocalValues(): void { MapWrapper.clearValues(this.current); }
}
