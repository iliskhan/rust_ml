# Карта подключения 71 анимации

Срез исходников: 2026-10-16. 63 новые сцены + 8 прежних. Это реестр подключения, а не отчёт об успешном рендере всех файлов или доказательство учебной эффективности. Исторические отчёты не изменены.

Маршруты — hash-id из [App.tsx](../../src/App.tsx). Сначала открывают маршрут, затем нужную вкладку лаборатории; target — DOM-якорь кнопки перехода внутри выбранного урока, **не второй hash-маршрут**. Таблица получена из фактических `slug`, `media`, `useFrontierFilm` и `TopicAnimation` mounts. Столбец источника ведёт к TSX-файлу; указан номер строки текущего среза.

У 21 Core-сцены фактический target равен `fixture.lesson.target + useId().replaceAll(":", "")`; это предотвращает совпадение якорей. В таблице приведён базовый target с пометкой `+ instance`. Frontier создаёт якорь из fixture в `FrontierTopicFilms`; Generative использует явный id рядом с mount. У прежних восьми target определён в TSX-обёртке, потому что их fixture не содержит lesson.

| Сцена / Python-класс | Маршрут | Лаборатория / компонент | Target | Фактическое подключение |
|---|---|---|---|---|
| [activations](../../animations/activations/activations.py) · `TopicScene` (новая) | `#neuron` | `NeuronLesson` | `neuron-activation` | [Foundations.tsx:96](../../src/Foundations.tsx) |
| [attention](../../animations/attention/attention.py) · `AttentionMixture` (прежняя) | `#transformer` | `TransformerCourse.AttentionLesson (раздел 2)` | `attention-controls` | [AttentionAnimation.tsx:22](../../src/AttentionAnimation.tsx) |
| [backprop](../../animations/backprop/backprop.py) · `BackpropSharedNode` (прежняя) | `#backprop` | `Foundations.BackpropLesson` | `backprop-walkthrough` | [BackpropAnimation.tsx:20](../../src/BackpropAnimation.tsx) |
| [bce](../../animations/bce/bce.py) · `TopicScene` (новая) | `#loss` | `LossLesson` | `loss-bce-controls` | [Foundations.tsx:183](../../src/Foundations.tsx) |
| [boundary](../../animations/boundary/boundary.py) · `TopicScene` (новая) | `#network` | `BoundaryPlayground` | `boundary-experiment` | [BoundaryPlayground.tsx:184](../../src/BoundaryPlayground.tsx) |
| [bpe](../../animations/bpe/bpe.py) · `TopicScene` (новая) | `#advanced` | `BpeLab` | `bpe-controls + instance` | [TokenAdaptationLabs.tsx:37](../../src/TokenAdaptationLabs.tsx) |
| [bptt](../../animations/bptt/bptt.py) · `TopicScene` (новая) | `#architectures` | `BpttLab` | `bptt-controls + instance` | [BpttLab.tsx:59](../../src/BpttLab.tsx) |
| [clip](../../animations/clip/clip.py) · `TopicScene` (новая) | `#frontiers` | `ClipLab` | `clip-controls` | [RepresentationFrontierLabs.tsx:45](../../src/RepresentationFrontierLabs.tsx) |
| [cnnforward](../../animations/cnnforward/cnnforward.py) · `TopicScene` (новая) | `#architectures` | `CnnLab` | `cnnforward-controls + instance` | [ArchitectureLesson.tsx:100](../../src/ArchitectureLesson.tsx) |
| [cnntraining](../../animations/cnntraining/cnntraining.py) · `TopicScene` (новая) | `#architectures` | `CnnTrainingLab` | `cnntraining-controls + instance` | [CnnTrainingLab.tsx:91](../../src/CnnTrainingLab.tsx) |
| [crossmask](../../animations/crossmask/crossmask.py) · `TopicScene` (новая) | `#transformer` | `FamiliesLesson` | `crossmask-controls + instance` | [TransformerCourse.tsx:225](../../src/TransformerCourse.tsx) |
| [dense](../../animations/dense/dense.py) · `TopicScene` (новая) | `#architectures` | `DenseLab` | `dense-controls + instance` | [ArchitectureLesson.tsx:51](../../src/ArchitectureLesson.tsx) |
| [descent](../../animations/descent/descent.py) · `GradientDescent` (прежняя) | `#optimizers` | `Experiments.OptimizerLesson` | `optimizer-controls` | [FilmExamples.tsx:17](../../src/FilmExamples.tsx) |
| [diffusionforward](../../animations/diffusionforward/diffusionforward.py) · `TopicScene` (новая) | `#diffusion` | `ForwardLesson` | `diffusionforward-lab` | [DiffusionCourse.tsx:60](../../src/DiffusionCourse.tsx) |
| [diffusionguidance](../../animations/diffusionguidance/diffusionguidance.py) · `TopicScene` (новая) | `#diffusion` | `GuidanceLesson` | `diffusionguidance-lab` | [DiffusionCourse.tsx:210](../../src/DiffusionCourse.tsx) |
| [diffusionreverse](../../animations/diffusionreverse/diffusionreverse.py) · `TopicScene` (новая) | `#diffusion` | `ReverseStepLesson` | `diffusionreverse-lab` | [DiffusionCourse.tsx:134](../../src/DiffusionCourse.tsx) |
| [diffusionsampling](../../animations/diffusionsampling/diffusionsampling.py) · `TopicScene` (новая) | `#diffusion` | `SamplingLesson` | `diffusionsampling-lab` | [DiffusionCourse.tsx:174](../../src/DiffusionCourse.tsx) |
| [diffusiontraining](../../animations/diffusiontraining/diffusiontraining.py) · `TopicScene` (новая) | `#diffusion` | `TrainingLesson` | `diffusiontraining-lab` | [DiffusionCourse.tsx:94](../../src/DiffusionCourse.tsx) |
| [dpo](../../animations/dpo/dpo.py) · `TopicScene` (новая) | `#frontiers` | `PreferenceLab` | `dpo-controls` | [InferenceFrontierLabs.tsx:23](../../src/InferenceFrontierLabs.tsx) |
| [egnn](../../animations/egnn/egnn.py) · `TopicScene` (новая) | `#frontiers` | `EquivariantLab` | `egnn-controls` | [FlowGeometryLabs.tsx:136](../../src/FlowGeometryLabs.tsx) |
| [embeddings](../../animations/embeddings/embeddings.py) · `TopicScene` (новая) | `#transformer` | `EmbeddingLesson` | `embeddings-controls + instance` | [TransformerCourse.tsx:66](../../src/TransformerCourse.tsx) |
| [exactsoftmax](../../animations/exactsoftmax/exactsoftmax.py) · `TopicScene` (новая) | `#advanced` | `OnlineAttentionLab` | `exactsoftmax-controls + instance` | [EfficientSequenceLabs.tsx:38](../../src/EfficientSequenceLabs.tsx) |
| [flowmatching](../../animations/flowmatching/flowmatching.py) · `TopicScene` (новая) | `#frontiers` | `FlowMatchingLab` | `flowmatching-controls` | [FlowGeometryLabs.tsx:90](../../src/FlowGeometryLabs.tsx) |
| [gandiversity](../../animations/gandiversity/gandiversity.py) · `TopicScene` (новая) | `#gan` | `GANCourse` | `gandiversity-lab` | [GANCourse.tsx:171](../../src/GANCourse.tsx) |
| [ganforward](../../animations/ganforward/ganforward.py) · `TopicScene` (новая) | `#gan` | `GANCourse` | `ganforward-lab` | [GANCourse.tsx:97](../../src/GANCourse.tsx) |
| [ganobjectives](../../animations/ganobjectives/ganobjectives.py) · `TopicScene` (новая) | `#gan` | `GANCourse` | `ganobjectives-lab` | [GANCourse.tsx:119](../../src/GANCourse.tsx) |
| [gantraining](../../animations/gantraining/gantraining.py) · `TopicScene` (новая) | `#gan` | `GANCourse` | `gantraining-lab` | [GANCourse.tsx:143](../../src/GANCourse.tsx) |
| [generation](../../animations/generation/generation.py) · `CachedGeneration` (прежняя) | `#transformer` | `TransformerCourse.CacheLesson (раздел 7)` | `cache-controls` | [FilmExamples.tsx:96](../../src/FilmExamples.tsx) |
| [gnnadjacency](../../animations/gnnadjacency/gnnadjacency.py) · `TopicScene` (новая) | `#gnn` | `GraphIdea` | `gnnadjacency-lab` | [GNNCourse.tsx:46](../../src/GNNCourse.tsx) |
| [gnndepth](../../animations/gnndepth/gnndepth.py) · `TopicScene` (новая) | `#gnn` | `DepthLesson` | `gnndepth-lab` | [GNNCourse.tsx:86](../../src/GNNCourse.tsx) |
| [gnnmessage](../../animations/gnnmessage/gnnmessage.py) · `TopicScene` (новая) | `#gnn` | `MessageLesson` | `gnnmessage-lab` | [GNNCourse.tsx:57](../../src/GNNCourse.tsx) |
| [gnntraining](../../animations/gnntraining/gnntraining.py) · `TopicScene` (новая) | `#gnn` | `TrainingLesson` | `gnntraining-lab` | [GNNCourse.tsx:74](../../src/GNNCourse.tsx) |
| [gnnvariants](../../animations/gnnvariants/gnnvariants.py) · `TopicScene` (новая) | `#gnn` | `VariantLesson` | `gnnvariants-lab` | [GNNCourse.tsx:95](../../src/GNNCourse.tsx) |
| [heads](../../animations/heads/heads.py) · `AttentionHeads` (прежняя) | `#transformer` | `TransformerCourse.HeadsLesson (раздел 3)` | `heads-controls` | [FilmExamples.tsx:76](../../src/FilmExamples.tsx) |
| [imagedenoisertraining](../../animations/imagedenoisertraining/imagedenoisertraining.py) · `TopicScene` (новая) | `#frontiers` | `DenoiserBody` | `imagedenoisertraining-controls` | [ArchitectureTrainingLabs.tsx:161](../../src/ArchitectureTrainingLabs.tsx) |
| [jepa](../../animations/jepa/jepa.py) · `TopicScene` (новая) | `#frontiers` | `JepaLab` | `jepa-controls` | [RepresentationFrontierLabs.tsx:150](../../src/RepresentationFrontierLabs.tsx) |
| [kan](../../animations/kan/kan.py) · `TopicScene` (новая) | `#frontiers` | `KanLab` | `kan-controls` | [RepresentationFrontierLabs.tsx:204](../../src/RepresentationFrontierLabs.tsx) |
| [longcontext](../../animations/longcontext/longcontext.py) · `TopicScene` (новая) | `#frontiers` | `LongContextLab` | `longcontext-controls` | [InferenceFrontierLabs.tsx:61](../../src/InferenceFrontierLabs.tsx) |
| [lora](../../animations/lora/lora.py) · `TopicScene` (новая) | `#advanced` | `LoraLab` | `lora-controls + instance` | [TokenAdaptationLabs.tsx:134](../../src/TokenAdaptationLabs.tsx) |
| [maskedtext](../../animations/maskedtext/maskedtext.py) · `TopicScene` (новая) | `#frontiers` | `MaskedTextLab` | `maskedtext-controls` | [InferenceFrontierLabs.tsx:74](../../src/InferenceFrontierLabs.tsx) |
| [mla](../../animations/mla/mla.py) · `TopicScene` (новая) | `#advanced` | `LatentAttentionLab` | `mla-controls + instance` | [EfficientSequenceLabs.tsx:17](../../src/EfficientSequenceLabs.tsx) |
| [moe](../../animations/moe/moe.py) · `TopicScene` (новая) | `#advanced` | `MixtureExpertsLab` | `moe-controls + instance` | [VisionRoutingLabs.tsx:70](../../src/VisionRoutingLabs.tsx) |
| [moetraining](../../animations/moetraining/moetraining.py) · `TopicScene` (новая) | `#frontiers` | `MoeTrainingLab` | `moetraining-controls` | [ArchitectureTrainingLabs.tsx:116](../../src/ArchitectureTrainingLabs.tsx) |
| [mse](../../animations/mse/mse.py) · `TopicScene` (новая) | `#loss` | `LossLesson` | `loss-mse-controls` | [Foundations.tsx:149](../../src/Foundations.tsx) |
| [neuralfield](../../animations/neuralfield/neuralfield.py) · `TopicScene` (новая) | `#frontiers` | `NeuralFieldLab` | `neuralfield-controls` | [FlowGeometryLabs.tsx:189](../../src/FlowGeometryLabs.tsx) |
| [neuron](../../animations/neuron/neuron.py) · `NeuronActivation` (прежняя) | `#neuron` | `Foundations.NeuronLesson` | `neuron-controls` | [NeuronAnimation.tsx:20](../../src/NeuronAnimation.tsx) |
| [outputtraining](../../animations/outputtraining/outputtraining.py) · `TopicScene` (новая) | `#transformer` | `TransformerHeadLab` | `outputtraining-controls + instance` | [TransformerHeadLab.tsx:46](../../src/TransformerHeadLab.tsx) |
| [qlora](../../animations/qlora/qlora.py) · `TopicScene` (новая) | `#frontiers` | `QuantizationLab` | `qlora-controls` | [InferenceFrontierLabs.tsx:36](../../src/InferenceFrontierLabs.tsx) |
| [recurrent](../../animations/recurrent/recurrent.py) · `TopicScene` (новая) | `#architectures` | `RecurrentLab` | `recurrent-controls + instance` | [ArchitectureLesson.tsx:137](../../src/ArchitectureLesson.tsx) |
| [rlbellman](../../animations/rlbellman/rlbellman.py) · `TopicScene` (новая) | `#rl` | `BellmanLesson` | `rlbellman-lab` | [RLCourse.tsx:43](../../src/RLCourse.tsx) |
| [rlpolicy](../../animations/rlpolicy/rlpolicy.py) · `TopicScene` (новая) | `#rl` | `PolicyLesson` | `rlpolicy-lab` | [RLCourse.tsx:75](../../src/RLCourse.tsx) |
| [rlqlearning](../../animations/rlqlearning/rlqlearning.py) · `TopicScene` (новая) | `#rl` | `QLearningLesson` | `rlqlearning-lab` | [RLCourse.tsx:60](../../src/RLCourse.tsx) |
| [rltransition](../../animations/rltransition/rltransition.py) · `TopicScene` (новая) | `#rl` | `EnvironmentLesson` | `rltransition-lab` | [RLCourse.tsx:32](../../src/RLCourse.tsx) |
| [rope](../../animations/rope/rope.py) · `RopeRotation` (прежняя) | `#transformer` | `TransformerCourse.RopeLesson (раздел 4)` | `rope-controls` | [FilmExamples.tsx:57](../../src/FilmExamples.tsx) |
| [sampling](../../animations/sampling/sampling.py) · `TopicScene` (новая) | `#transformer` | `GenerationLesson` | `sampling-controls + instance` | [TransformerCourse.tsx:272](../../src/TransformerCourse.tsx) |
| [speculative](../../animations/speculative/speculative.py) · `TopicScene` (новая) | `#frontiers` | `SpeculativeLab` | `speculative-controls` | [InferenceFrontierLabs.tsx:48](../../src/InferenceFrontierLabs.tsx) |
| [ssm](../../animations/ssm/ssm.py) · `TopicScene` (новая) | `#advanced` | `StateSpaceLab` | `ssm-controls + instance` | [EfficientSequenceLabs.tsx:62](../../src/EfficientSequenceLabs.tsx) |
| [ssmtraining](../../animations/ssmtraining/ssmtraining.py) · `TopicScene` (новая) | `#frontiers` | `SsmTrainingLab` | `ssmtraining-controls` | [ArchitectureTrainingLabs.tsx:137](../../src/ArchitectureTrainingLabs.tsx) |
| [superposition](../../animations/superposition/superposition.py) · `TopicScene` (новая) | `#frontiers` | `InterpretabilityLab` | `superposition-controls` | [RepresentationFrontierLabs.tsx:95](../../src/RepresentationFrontierLabs.tsx) |
| [swiglu](../../animations/swiglu/swiglu.py) · `TopicScene` (новая) | `#advanced` | `GatedFfnLab` | `swiglu-controls + instance` | [TokenAdaptationLabs.tsx:86](../../src/TokenAdaptationLabs.tsx) |
| [tinytraining](../../animations/tinytraining/tinytraining.py) · `TopicScene` (новая) | `#advanced` | `TinyTransformerLab` | `tinytraining-controls + instance` | [TinyTransformerLab.tsx:56](../../src/TinyTransformerLab.tsx) |
| [transformerblock](../../animations/transformerblock/transformerblock.py) · `TopicScene` (новая) | `#transformer` | `BlockLesson` | `transformerblock-controls + instance` | [TransformerCourse.tsx:204](../../src/TransformerCourse.tsx) |
| [transformerforward](../../animations/transformerforward/transformerforward.py) · `TopicScene` (новая) | `#architectures` | `TransformerLab` | `transformerforward-controls + instance` | [ArchitectureLesson.tsx:158](../../src/ArchitectureLesson.tsx) |
| [unetdit](../../animations/unetdit/unetdit.py) · `TopicScene` (новая) | `#advanced` | `ImageDenoiserLab` | `unetdit-controls + instance` | [VisionRoutingLabs.tsx:108](../../src/VisionRoutingLabs.tsx) |
| [vaeelbo](../../animations/vaeelbo/vaeelbo.py) · `TopicScene` (новая) | `#vae` | `VAECourse` | `vaeelbo-lab` | [VAECourse.tsx:127](../../src/VAECourse.tsx) |
| [vaegeneration](../../animations/vaegeneration/vaegeneration.py) · `TopicScene` (новая) | `#vae` | `VAECourse` | `vaegeneration-lab` | [VAECourse.tsx:184](../../src/VAECourse.tsx) |
| [vaeposterior](../../animations/vaeposterior/vaeposterior.py) · `TopicScene` (новая) | `#vae` | `VAECourse` | `vaeposterior-lab` | [VAECourse.tsx:103](../../src/VAECourse.tsx) |
| [vaetraining](../../animations/vaetraining/vaetraining.py) · `TopicScene` (новая) | `#vae` | `VAECourse` | `vaetraining-lab` | [VAECourse.tsx:158](../../src/VAECourse.tsx) |
| [vit](../../animations/vit/vit.py) · `TopicScene` (новая) | `#advanced` | `VisionTransformerLab` | `vit-controls + instance` | [VisionRoutingLabs.tsx:38](../../src/VisionRoutingLabs.tsx) |
| [vittraining](../../animations/vittraining/vittraining.py) · `TopicScene` (новая) | `#frontiers` | `VitTrainingLab` | `vittraining-controls` | [ArchitectureTrainingLabs.tsx:93](../../src/ArchitectureTrainingLabs.tsx) |
| [xor](../../animations/xor/xor.py) · `XORNetwork` (прежняя) | `#network` | `Experiments.NetworkLesson` | `xor-controls` | [FilmExamples.tsx:37](../../src/FilmExamples.tsx) |

## Границы покрытия и повторное использование

- `#vae`, раздел 5 «Границы»; `#gan`, раздел 5 «Варианты»; `#rl`, раздел 5 «DQN, actor–critic, PPO» — текстовые пояснения/ссылки без отдельного film mount. Они не считаются дополнительными сценами. Проверка: `VAECourse`/`GANCourse` hidden chapter4, `RLCourse.FamiliesLesson` section4.
- `#map`, `#curriculum`, `#practice`, `#sources` — навигация, практика и справка; отдельных роликов в этих mounts нет.
- `KnowledgeExplorer → ConceptLesson → ConceptExperiment / AdvancedConceptExperiment` повторно использует демонстрации понятий (например, function/derivative — один DerivativeDemo). В этих файлах нет mount TopicAnimation/LessonAnimation; повторный разбор понятия не считается отдельным клипом и не означает воспроизведение одного из71 роликов.
- `recurrent` обслуживает общий `RecurrentLab` для RNN/LSTM/GRU: это один фильм, а не три. `swiglu` — общий GatedFfnLab с несколькими активациями; `ssm` — StateSpaceLab с SSM/DeltaNet; `unetdit` — общий ImageDenoiserLab. Их переключатели не создают отдельные видеосцены.
- `vit/moe/ssm/unetdit` в `#advanced` и `vittraining/moetraining/ssmtraining/imagedenoisertraining` в `#frontiers` подключены к разным лабораториям: прямые вычисления и обучение соответственно.
- Вложенные дополнительные опыты (CnnShiftLab, NormalizationGeometryLab, ResidualGradientLab, оценка variance в PolicyLesson и т.п.) сохраняют собственный интерфейс; наличие связанного фильма у родительского раздела не заявляется как отдельное видео для каждого опыта.

## Проверка реестра

При создании документа автоматически проверено: ровно71 `animations/*/fixture.json`; для каждого найден фактический TSX mount, существующий Python-файл и класс; множества fixture-slug и строк таблицы совпадают. 8 старых target сверены с LessonAnimation wrappers; 63 новых взяты из fixture.lesson.target. Маршруты сверены с App.lessons и подключениями курсов. Это статическая проверка; доступность конкретного DOM-якоря и браузерное воспроизведение требуют отдельной UI-проверки.

Нынешний workflow — без озвучки; optional VTT выключены по умолчанию. Полные команды и ограничения — [animations/README.md](../../animations/README.md). Native inspect/render и media-verification координатор выполняет отдельно; эта карта не подменяет их результаты.
