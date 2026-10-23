import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { explanationAnchor, lessonRoute, topicChapter } from './lesson-routing';
import { focusLessonSection } from './LessonOutline';

/** Apply explicit topic links while keeping ordinary tab changes local. */
export function useCourseSection(lessonId: string, defaultSection = 0) {
  const initial = lessonRoute(window.location.hash);
  const [section, setSection] = useState(() => initial.lessonId === lessonId && topicChapter(lessonId, initial.topicId) >= 0 ? topicChapter(lessonId, initial.topicId) : defaultSection);
  const [request, setRequest] = useState(initial.lessonId === lessonId && initial.topicId ? 1 : 0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const apply = () => {
      const route = lessonRoute(window.location.hash), next = topicChapter(lessonId, route.topicId);
      if (route.lessonId !== lessonId || next < 0) return;
      setSection(next);
      setRequest(value => value + 1);
    };
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, [lessonId]);
  useLayoutEffect(() => {
    if (!request) return;
    const frame = requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [request]);
  return [section, setSection, heading, request] as const;
}

/** Static lessons can arrive after lazy loading; focus their existing anchors when ready. */
export function useExplanationAnchor() {
  useEffect(() => {
    let observer: MutationObserver | undefined;
    let frame = 0;
    function apply() {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      const route = lessonRoute(window.location.hash), anchor = explanationAnchor(route.lessonId, route.topicId);
      if (!anchor) return;
      const focus = () => {
        const target = document.getElementById(anchor);
        if (!target || target.closest('[hidden]')) return false;
        for (let parent: HTMLElement | null = target; parent; parent = parent.parentElement) {
          if (parent instanceof HTMLDetailsElement) parent.open = true;
        }
        observer?.disconnect();
        frame = requestAnimationFrame(() => focusLessonSection(anchor));
        return true;
      };
      if (!focus()) { observer = new MutationObserver(focus); observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] }); }
    }
    apply();
    window.addEventListener('hashchange', apply);
    return () => { observer?.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('hashchange', apply); };
  }, []);
}
