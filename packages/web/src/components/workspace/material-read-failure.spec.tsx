import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import common from '../../../../i18n/src/locales/en/common.json';
import { MaterialReadFailure } from './material-read-failure';
vi.mock('@/i18n',()=>({useLayoutTranslation:()=>({t:(key:string)=>key.split('.').reduce((value:unknown,part):unknown=>value && typeof value === 'object' ? (value as Record<string,unknown>)[part] : undefined,common)??key})}));
describe('material failure presentation',()=>{
  it('offers recovery without rendering private errors',()=>{
    const html=renderToStaticMarkup(<MaterialReadFailure error={new Error('PRIVATE SQL / secret signed URL')} retry={()=>{}} retrying backHref='/academy/mapo/learn/classes'/>);
    expect(html).toContain('This activity could not be loaded');expect(html).toContain('disabled');
    expect(html).toContain('Try again');expect(html).not.toContain('PRIVATE');expect(html).toContain('role="alert"');
  });
  it('keeps unavailable copy neutral and does not offer a retry of access denial',()=>{
    const html=renderToStaticMarkup(<MaterialReadFailure unavailable retry={()=>{}} backHref='/academy/mapo/learn/classes'/>);
    expect(html).toContain('This activity is not available');expect(html).not.toContain('Try again');expect(html).not.toContain('academy is not available');
  });
});
