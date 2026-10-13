import { createRoot } from 'react-dom/client';
import { LearningProvider } from '../../src/learning-context';
import { PracticePanel } from '../../src/practice/PracticePanel';
import { practiceTopics } from '../../src/practice/all-catalog';
import '../../src/styles.css';
createRoot(document.getElementById('root')!).render(<LearningProvider><PracticePanel lessonId={practiceTopics[0].lessonId} ownerId="local-integration-language-20261013" /></LearningProvider>);
