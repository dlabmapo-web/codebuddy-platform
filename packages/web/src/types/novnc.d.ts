declare module '@novnc/novnc/lib/rfb' {
 export default class RFB extends EventTarget {
  constructor(target:HTMLElement,channel:WebSocket);
  viewOnly:boolean;scaleViewport:boolean;resizeSession:boolean;background:string;
  disconnect():void;blur():void;sendKey(keysym:number,code:string,down?:boolean):void;
 }
}
