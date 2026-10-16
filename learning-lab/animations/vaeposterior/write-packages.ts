import { mkdirSync, writeFileSync } from 'node:fs';
import { buildFixture, filmCopy, type FilmSlug } from './catalog.ts';
const screens = {
vaeposterior: ['Центр сдвинется вместе с ε?', 'ε выбирает z; μ и σ заданы энкодером', 'Измените ε; сравните μ и z'],
vaeelbo: ['Один ε — это точный ELBO?', 'Среднее NLL + KL ≥ точное −log p(x)', 'Сравните один ε и точное среднее'],
vaetraining: ['Обновится только decoder?', 'Градиент меняет все шесть параметров', 'Выполните один шаг обучения'],
vaegeneration: ['Нужен вход x для генерации?', 'Prior → decoder → среднее наблюдения', 'Измените prior z и шум наблюдения'],
ganforward: ['Прямой проход меняет веса?', 'Две сети: G создаёт, D оценивает', 'Поменяйте z без обучения'],
ganobjectives: ['Где сильнее сигнал при logit −5?', 'Non-sat даёт больший сигнал у −5', 'Передвиньте logit к нулю'],
gantraining: ['Шаг D меняет веса G?', 'D обновляется отдельно от G', 'Выполните D, затем G'],
gandiversity: ['Один хороший образец — успех?', 'Почти постоянный G пропускает режим', 'Сравните два старта генератора'],
diffusionforward: ['Есть ли шум при t=0?', 'Шум расширяет плотность всех данных', 'Меняйте ε при фиксированном t'],
diffusiontraining: ['Сеть знает реализованный ε?', 'MSE обучает предсказывать ε из xₜ,t', 'Сравните ошибку до и после обучения'],
diffusionreverse: ['z=0 отменит обратный шаг?', 'Следующее x = среднее + шум шага', 'Измените z при прежнем прогнозе'],
diffusionsampling: ['DDIM — это DDPM без шума?', 'Другая формула; можно пропускать t', 'Сравните 64 и 16 вызовов'],
diffusionguidance: ['Что получается при s=1?', 'При s=1 получаем условный прогноз', 'Сравните s=0,1,2'],
gnnadjacency: ['Индекс узла — координата?', 'Признаки отдельно от схемы связей', 'Удалите ребро C—D'],
gnnmessage: ['Нужны степени обоих концов?', 'Каждый сосед даёт взвешенный вклад', 'Выключите self-loop'],
gnntraining: ['Все метки входят в loss?', 'Учебные метки только A,C,D,F', 'Сделайте шаг и проверьте CE'],
gnndepth: ['Переименование меняет ответ?', 'Разброс /√degree уменьшается', 'Сравните 0 и 30 смешиваний'],
gnnvariants: ['Нулевые scores дают равные веса?', 'GAT: softmax; SAGE: concat и mean', 'Обнулите веса attention scores'],
rltransition: ['Команда всегда исполняется точно?', 'Вероятности исходов суммируются в 1', 'Измените slip'],
rlbellman: ['Нужны ли выборочные эпизоды?', 'Ценность цели распространяется назад', 'Сделайте два прохода Беллмана'],
rlqlearning: ['Лимит времени — терминал?', 'Только терминал обнуляет bootstrap', 'Сравните terminal=false и true'],
rlpolicy: ['Baseline изменит точное среднее?', 'Среднее прежнее; разброс изменился', 'Измените baseline и N'],
};
for (const slug of Object.keys(filmCopy) as FilmSlug[]) {
 const base = new URL(`../${slug}/`, import.meta.url); mkdirSync(base, { recursive:true });
 const fixture = { ...buildFixture(slug), screenQuestion:screens[slug][0], screenResult:screens[slug][1], screenTask:screens[slug][2] };
 writeFileSync(new URL('fixture.json',base), JSON.stringify(fixture,null,2)+'\n');
 writeFileSync(new URL('export-fixture.ts',base), `import { writeFileSync } from 'node:fs';\nimport { buildFixture } from '../vaeposterior/catalog.ts';\nconst fixture = { ...buildFixture('${slug}'), screenQuestion: ${JSON.stringify(screens[slug][0])}, screenResult: ${JSON.stringify(screens[slug][1])}, screenTask: ${JSON.stringify(screens[slug][2])} };\nwriteFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\\n');\n`);
 writeFileSync(new URL(`${slug}.py`,base), `"""${fixture.lesson.title}: causal ${fixture.geometry} geometry from the TS trace."""\nimport json\nimport sys\nfrom pathlib import Path\nimport manimgx as m\nsys.path.insert(0, str(Path(__file__).resolve().parents[1]))\nsys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'vaeposterior'))\nfrom scene_geometry import present\n\nclass TopicScene(m.Scene):\n    def construct(self):\n        fixture = json.loads(Path(__file__).with_name('fixture.json').read_text(encoding='utf-8'))\n        present(self, fixture)\n`);
 writeFileSync(new URL('render-assets.py',base), `"""Render narrated 40-second film and poster at 30 seconds."""\nimport sys\nfrom pathlib import Path\nsys.path.insert(0, str(Path(__file__).resolve().parents[1]))\nfrom render_support import render_scene\nfrom ${slug} import TopicScene\n\nif __name__ == '__main__':\n    render_scene(TopicScene, '${slug}', 30)\n`);
 const copy=filmCopy[slug]; const intervals=[[0,5.7],[6,8.8],[12,18],[18.5,25.7],[26,33.5],[34,39.7]];
 const segments=intervals.map(([start,end],i)=>({start,end,text:copy[10+i]}));
 writeFileSync(new URL('narration.ru.json',base),JSON.stringify({duration:40,voice:'Microsoft Irina Desktop - Russian',segments},null,2)+'\n');
 const media = new URL(`../../public/animations/${slug}/`,import.meta.url);mkdirSync(media,{recursive:true});
 const time=(s:number)=>`00:${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toFixed(3).padStart(6,'0')}`;
 const cues=[[0,6,copy[10]],[6,12,copy[1]],[12,18.5,copy[12]],[18.5,26,copy[13]],[26,34,fixture.summary],[34,40,copy[15]]] as const;
 writeFileSync(new URL('captions.ru.vtt',media),'WEBVTT\n\n'+cues.map(([s,e,text])=>`${time(s)} --> ${time(e)}\n${text}`).join('\n\n')+'\n');
 writeFileSync(new URL('README.md',base),`# ${fixture.lesson.title}\n\nB12 / R01,R02,R04,R06 / U02,U04,U05,U07,U08.\n\nФиксированный пример из действующей TS-математики. Числа и ограничения: fixture.json; доступная альтернатива, прогноз и новый случай: fixture.lesson. Общий catalog.ts хранит численный экспорт без второго математического движка.\n\nПричинная геометрия: ${fixture.geometry}; оси: ${fixture.axis.join('; ')}. ${fixture.summary}.\n\n40 секунд: 0–6 условия, 6–12 прогноз, 12–26 раскрытие, 26–34 сравнение, 34–40 лаборатория. Автопауза на 9; ответ после 12; постер 30. Нижняя зона y<−1.8 оставлена для субтитров и управления.\n\nЭкспорт: node animations/${slug}/export-fixture.ts из learning-lab. Затем общий SAPI pipeline и render-assets.py с ManimGX 0.1.1. Рендер/GPU и реальный браузер проверяются отдельно; наличие исходника не считается такой проверкой.\n`);
}
console.log('22 numerical fixtures, authored scene packages, narration and continuous captions created.');
