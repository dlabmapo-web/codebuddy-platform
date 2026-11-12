// @vitest-environment happy-dom
import {afterEach, expect, it} from 'vitest';
import {installHorizontalScrollBoundary} from './horizontal-scroll-boundary';
let dispose: (()=>void)|undefined;
afterEach(()=>{dispose?.();dispose=undefined;document.body.replaceChildren();});
const wheel=(element:Element,deltaX:number,deltaY=0,ctrlKey=false)=>{
  const event=new WheelEvent('wheel',{deltaX,deltaY,ctrlKey,bubbles:true,cancelable:true});Object.defineProperty(event,'ctrlKey',{value:ctrlKey});element.dispatchEvent(event);return event.defaultPrevented;
};
it('consumes horizontal viewport overscroll, preserving vertical input and zoom',()=>{
  dispose=installHorizontalScrollBoundary(document);
  expect(wheel(document.body,150)).toBe(true);expect(wheel(document.body,-150)).toBe(true);
  expect(wheel(document.body,3,100)).toBe(false);expect(wheel(document.body,150,0,true)).toBe(false);
  expect(document.documentElement.style.overscrollBehaviorX).toBe('none');
});
it('allows a local table to scroll in either direction and blocks only at its boundaries',()=>{
  const table=document.createElement('div'),cell=document.createElement('span');table.style.overflowX='auto';table.append(cell);document.body.append(table);
  Object.defineProperties(table,{scrollWidth:{value:600},clientWidth:{value:200}});
  dispose=installHorizontalScrollBoundary(document);
  expect(wheel(cell,100)).toBe(false);expect(wheel(cell,-100)).toBe(true);
  table.scrollLeft=400;expect(wheel(cell,100)).toBe(true);expect(wheel(cell,-100)).toBe(false);
  table.scrollLeft=200;expect(wheel(cell,100)).toBe(false);expect(wheel(cell,-100)).toBe(false);
});
it('preserves editor-owned events and removes the guard when leaving the app',()=>{
  const editor=document.createElement('div');document.body.append(editor);
  editor.addEventListener('wheel',event=>event.preventDefault());dispose=installHorizontalScrollBoundary(document);
  expect(wheel(editor,100)).toBe(true);
  dispose();dispose=undefined;
  expect(document.documentElement.hasAttribute('data-cove-scroll-boundary')).toBe(false);
  expect(wheel(document.body,100)).toBe(false);
});
it('uses the RTL scroll direction and lets an available ancestor continue scrolling',()=>{
  const outer=document.createElement('div'),inner=document.createElement('div');outer.style.overflowX='auto';outer.style.direction='rtl';inner.style.overflowX='auto';outer.append(inner);document.body.append(outer);
  Object.defineProperties(outer,{scrollWidth:{value:600},clientWidth:{value:200}});
  Object.defineProperties(inner,{scrollWidth:{value:200},clientWidth:{value:200}});
  dispose=installHorizontalScrollBoundary(document);
  expect(wheel(inner,-100)).toBe(false);expect(wheel(inner,100)).toBe(true);
  outer.scrollLeft=-400;expect(wheel(inner,-100)).toBe(true);expect(wheel(inner,100)).toBe(false);
});

it('tolerates the transient rootless document exposed while srcDoc loads',()=>{
  const loading=document.implementation.createDocument('', '', null);
  expect(()=>installHorizontalScrollBoundary(loading)()).not.toThrow();
});
