'use client';
import { ChevronDown, ChevronRight, Folder, FolderOpen, X } from 'lucide-react';
import { useState } from 'react';
import { MaterialIdentity } from '@/components/workspace/material-identity';
import { navigatorPanelProps, navigatorScroll } from '@/lib/workspace/navigator-geometry';
import { useClassroom } from './classroom-context';

/** Teaching outline: the monitor's hierarchy without attributing progress to a student. */
export function ClassroomOutline() {
  const context = useClassroom();
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  if (!context?.outlineOpen) return null;
  const toggle = (id: string) => setClosed(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <aside {...navigatorPanelProps('lg')} id="classroom-curriculum" aria-label={context.labels.lessons}>
    <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-3 py-3">
      <div className="min-w-0"><p className="truncate text-sm font-bold">{context.classroom.class.name}</p><p className="mt-1 text-xs text-sub">{context.labels.teaching}</p></div>
      <button type="button" aria-label={context.labels.closeOutline} className="rounded p-1 text-sub hover:bg-canvas" onClick={() => context.setOutlineOpen(false)}><X aria-hidden className="size-4" /></button>
    </header>
    <div className={navigatorScroll}>
      {context.classroom.courses.map(course => <section key={course.id} className="py-3">
        <h2 className="px-3 pb-3 text-sm font-bold">{course.title}</h2>
        {course.modules.map(module => <div key={module.id}>
          <button type="button" aria-expanded={!closed.has(module.id)} onClick={() => toggle(module.id)} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm font-semibold hover:bg-canvas">
            {closed.has(module.id) ? <ChevronRight aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}<FolderOpen aria-hidden className="size-4 text-brand" /><span className="min-w-0 truncate">{module.title}</span>
          </button>
          {!closed.has(module.id) ? module.lectures.map(lecture => <div key={lecture.id} className="ml-4 border-l border-border pl-2">
            <button type="button" aria-expanded={!closed.has(lecture.id)} onClick={() => toggle(lecture.id)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs font-semibold hover:bg-canvas">
              {closed.has(lecture.id) ? <ChevronRight aria-hidden className="size-3" /> : <ChevronDown aria-hidden className="size-3" />}<Folder aria-hidden className="size-4 text-brand" /><span className="min-w-0 truncate">{lecture.title}</span>
            </button>
            {!closed.has(lecture.id) ? <ul className="space-y-1 py-1">{lecture.materials.map(material => <li key={material.id}>
              <button data-classroom-material={material.id} type="button" aria-current={context.materialId === material.id ? 'page' : undefined} disabled={context.pending}
                onClick={() => void context.navigate(context.materialHref(material.id))}
                className={`flex min-h-16 w-full items-center rounded-xl px-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50 ${context.materialId === material.id ? 'bg-brand-soft' : 'hover:bg-canvas'}`}>
                <MaterialIdentity compact title={material.title} type={material.type} />
              </button>
            </li>)}</ul> : null}
          </div>) : null}
        </div>)}
      </section>)}
    </div>
    <button data-monitoring-class-exit type="button" className="shrink-0 border-t border-border px-3 py-3 text-left text-xs font-semibold text-sub hover:bg-canvas" disabled={context.pending} onClick={() => void context.navigate(context.exitHref)}>{context.labels.exit}</button>
  </aside>;
}
