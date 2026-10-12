import { practiceTopics as coreTopics } from './catalog.ts';
import { architecturePracticeTopics } from './architecture-catalog.ts';
import { advancedPracticeTopics } from './advanced-catalog.ts';
import { generativePracticeTopics } from './generative-catalog.ts';
import { advancedConceptPracticeTopics } from './concept-advanced-catalog.ts';
import { conceptCoreTopics } from './concept-core-catalog.ts';

export { practiceRelease } from './catalog.ts';
export type { PracticeTopic, PracticeExercise, PracticeLanguage } from './catalog.ts';
export const practiceTopics = [...coreTopics, ...architecturePracticeTopics, ...advancedPracticeTopics, ...generativePracticeTopics, ...conceptCoreTopics, ...advancedConceptPracticeTopics];
