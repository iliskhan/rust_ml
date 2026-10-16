# BCE: уверенность и истинный класс

Оригинальная сцена40с ManimGX0.1.1,720p30, русская синтезированная речь.
Числа из действующих TypeScript-функций; Python только рисует.
B12/R01/R02/R04/R06, U02/U04/U05/U07/U08. Просмотр не даёт зачёта.

Из корня проекта (Node24, существующийPython3.13venv):

```powershell
node learning-lab/animations/export-foundations.ts
learning-lab/animations/synthesize-narration.ps1 -Scenes bce
work/backprop-pilot/venv/Scripts/python.exe learning-lab/animations/assemble-narration.py bce
work/backprop-pilot/venv/Scripts/manimgx.exe inspect learning-lab/animations/bce/bce.py TopicScene -t 4,9,15,22,30,37,end -o work/backprop-pilot/bce-inspect.png
work/backprop-pilot/venv/Scripts/python.exe learning-lab/animations/bce/render-assets.py
```

Poster30с. Прогноз9с, объяснение после12с. Текстовая альтернатива и новый
случай находятся вfixture.lesson и отображаются общимTopicAnimation.
Рендер без аудио и необязательные субтитры: [общий конвейер](../README.md). Математические ограничения
указаны вlesson.note; приёмка/публикация ведутся вPLAN.md иPROGRESS.md.
